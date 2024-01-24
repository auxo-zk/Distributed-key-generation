import { Field, Provable, PublicKey } from 'o1js';
import { compile } from '../../helper/deploy.js';
import { fetchZkAppState } from '../../helper/deploy.js';
import {
    CheckMemberInput,
    CommitteeContract,
    CreateCommittee,
} from '../../../contracts/Committee.js';
import axios from 'axios';
import { MemberArray } from '../../../libs/Committee.js';
import {
    EMPTY_LEVEL_2_TREE,
    FullMTWitness,
    Level1Witness,
    Level2Witness,
    MemberStorage,
    SettingStorage,
} from '../../../contracts/CommitteeStorage.js';
import { prepare } from '../prepare.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(CreateCommittee, cache);
    await compile(CommitteeContract, cache);
    const committeeAddress =
        'B62qiYCgNQhu1KddDQZs7HL8cLqRd683YufYX1BNceZ6BHnC1qfEcJ9';
    const committeeContract = new CommitteeContract(
        PublicKey.fromBase58(committeeAddress)
    );

    // Fetch storage trees
    let memberStorage = new MemberStorage();
    let settingStorage = new SettingStorage();

    const rawState = (await fetchZkAppState(committeeAddress)) || [];
    Provable.log(rawState);
    const committeeState = {
        nextCommitteeId: Field(rawState[0]),
        committeeTreeRoot: Field(rawState[1]),
        settingTreeRoot: Field(rawState[2]),
        actionState: Field(rawState[3]),
    };

    const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
        .data;

    committees.map((committee: any) => {
        console.log(committee);
        let level2Tree = EMPTY_LEVEL_2_TREE();
        for (let i = 0; i < committee.numberOfMembers; i++) {
            level2Tree.setLeaf(
                BigInt(i),
                MemberArray.hash(PublicKey.fromBase58(committee.publicKeys[i]))
            );
        }
        memberStorage.updateInternal(Field(committee.committeeId), level2Tree);

        settingStorage.updateLeaf(
            {
                level1Index: SettingStorage.calculateLevel1Index(
                    Field(committee.committeeId)
                ),
            },
            SettingStorage.calculateLeaf({
                T: Field(committee.threshold),
                N: Field(committee.numberOfMembers),
            })
        );
    });

    Provable.log(memberStorage.root);
    Provable.log(settingStorage.root);

    console.log('committeeContract.checkMember: ');
    const committeeId = Field(3);
    const memberId = Field(0);
    let input = new CheckMemberInput({
        address: PublicKey.fromBase58(
            'B62qomDwU81ESmFrQDMRtXHgTeof3yXH8rgBzzNqdogevZSFK8VVdgB'
        ),
        commiteeId: committeeId,
        memberWitness: new FullMTWitness({
            level1: Level1Witness.fromJSON({
                path: [
                    '14463168169963187580045753625804186783839073483768116833149634967285246450879',
                    '13950425539963941588557111068780483095563775524323791997603657722772274188408',
                    '2447983280988565496525732146838829227220882878955914181821218085513143393976',
                ],
                isLeft: [false, false, true],
            }),
            level2: Level2Witness.fromJSON({
                path: [
                    '12097443147507227752906456788020971106189445760938780046675964708423984025754',
                    '8178707339308379113628883672164653149525025232601018649562467007888184806717',
                ],
                isLeft: [true, true],
            }),
            // level2: Level2Witness.fromJSON({
            //   path: [
            //     '0',
            //     '20019116504259370838794713391062689695628730735968112557964527030372953598068',
            //   ],
            //   isLeft: [true, false],
            // }),
        }),
    });
    Provable.log(
        Level1Witness.fromJSON({
            path: [
                '14463168169963187580045753625804186783839073483768116833149634967285246450879',
                '13950425539963941588557111068780483095563775524323791997603657722772274188408',
                '2447983280988565496525732146838829227220882878955914181821218085513143393976',
            ],
            isLeft: [false, false, true],
        }).calculateRoot(
            Level2Witness.fromJSON({
                path: [
                    '12097443147507227752906456788020971106189445760938780046675964708423984025754',
                    '8178707339308379113628883672164653149525025232601018649562467007888184806717',
                ],
                isLeft: [true, true],
            }).calculateRoot(
                MemberStorage.calculateLeaf(
                    PublicKey.fromBase58(
                        'B62qomDwU81ESmFrQDMRtXHgTeof3yXH8rgBzzNqdogevZSFK8VVdgB'
                    )
                )
            )
        )
    );
    let checkMember = await committeeContract.checkMember(input);
    Provable.log('Is member:', checkMember);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
