import fs from 'fs';
import {
    Cache,
    Field,
    Mina,
    PrivateKey,
    Provable,
    PublicKey,
    Reducer,
    fetchAccount,
} from 'o1js';
import { Config, JSONKey, Key } from '../../helper/config.js';
import { ContractList, compile, wait } from '../../helper/deploy.js';
import { fetchActions, fetchZkAppState } from '../../helper/deploy.js';
import {
    CommitteeMemberInput,
    CommitteeAction,
    CommitteeContract,
    RollupCommittee,
} from '../../../contracts/Committee.js';
import axios from 'axios';
import { MemberArray } from '../../../libs/Committee.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import {
    EMPTY_LEVEL_2_TREE,
    FullMTWitness,
    Level1Witness,
    Level2Witness,
    MemberStorage,
    SettingStorage,
} from '../../../contracts/CommitteeStorage.js';
import { COMMITTEE_MAX_SIZE } from '../../../constants.js';
import { prepare } from '../prepare.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(RollupCommittee, cache);
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
        settingRoot: Field(rawState[2]),
        actionState: Field(rawState[3]),
    };

    const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
        .data;

    committees.map((committee: any) => {
        console.log(committee);
        if (Boolean(committee.active)) {
            let level2Tree = EMPTY_LEVEL_2_TREE();
            for (let i = 0; i < committee.numberOfMembers; i++) {
                level2Tree.setLeaf(
                    BigInt(i),
                    MemberArray.hash(
                        PublicKey.fromBase58(committee.publicKeys[i])
                    )
                );
            }
            memberStorage.updateInternal(
                Field(committee.committeeId),
                level2Tree
            );

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
        }
    });

    Provable.log(memberStorage.root);
    Provable.log(settingStorage.root);

    // const rawActions = await fetchActions(
    //   // publicKey
    //   committeeAddress,
    //   // fromState
    //   Field(
    //     25079927036070901246064867767436987657692091363973573142121686150614948079097n
    //   ),
    //   // toState
    //   Field(
    //     1972653782998565751193839543112576956152658311032796175197111159970957407940n
    //   )
    // );

    // Provable.log('Actions:', actions);
    // const actions: CommitteeAction[] = rawActions.map((e) => {
    //   let action: Field[] = e.actions[0].map((e) => Field(e));
    //   return new CommitteeAction({
    //     addresses: MemberArray.fromFields(
    //       action.slice(0, COMMITTEE_MAX_SIZE * 2 + 1)
    //     ),
    //     threshold: Field(action[COMMITTEE_MAX_SIZE * 2 + 1]),
    //     ipfsHash: IPFSHash.fromFields(action.slice(COMMITTEE_MAX_SIZE * 2 + 2)),
    //   });
    // });

    console.log('committeeContract.checkMember: ');
    const committeeId = Field(3);
    const memberId = Field(0);
    let input = new CommitteeMemberInput({
        address: PublicKey.fromBase58(
            'B62qomDwU81ESmFrQDMRtXHgTeof3yXH8rgBzzNqdogevZSFK8VVdgB'
        ),
        committeeId: committeeId,
        memberWitness: new FullMTWitness({
            level1: Level1Witness.fromJSON({
                path: [
                    '14463168169963187580045753625804186783839073483768116833149634967285246450879',
                    '13950425539963941588557111068780483095563775524323791997603657722772274188408',
                    '2447983280988565496525732146838829227220882878955914181821218085513143393976',
                ],
                isLeft: [false, false, true],
            }),
            // level2: Level2Witness.fromJSON({
            //   path: [
            //     '12097443147507227752906456788020971106189445760938780046675964708423984025754',
            //     '8178707339308379113628883672164653149525025232601018649562467007888184806717',
            //   ],
            //   isLeft: [true, true],
            // }),
            level2: Level2Witness.fromJSON({
                path: [
                    '0',
                    '20019116504259370838794713391062689695628730735968112557964527030372953598068',
                ],
                isLeft: [true, false],
            }),
        }),
    });
    let checkMember = await committeeContract.checkMember(input);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
