import fs from 'fs';
import { Field, Group, Mina, Provable, PublicKey } from 'o1js';
import {
    compile,
    fetchActions,
    fetchZkAppState,
    proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import {
    CommitteeContract,
    CreateCommittee,
    DKGContract,
    FinalizeRound1,
    ReduceRound1,
    Round1Action,
    Round1Contract,
    Round1Contribution,
    UpdateKey,
} from '../../../index.js';
import {
    Level1Witness as DKGLevel1Witness,
    KeyStatusStorage,
    PublicKeyStorage,
    Round1ContributionStorage,
    EMPTY_LEVEL_2_TREE,
} from '../../../contracts/DKGStorage.js';
import {
    Level1Witness as CommitteeLevel1Witness,
    SettingStorage,
} from '../../../contracts/CommitteeStorage.js';
import axios from 'axios';
import {
    AddressWitness,
    ReduceWitness,
    ZkAppRef,
} from '../../../contracts/SharedStorage.js';
import { Round1Input } from '../../../contracts/Round1.js';
import { ZkAppEnum } from '../../../constants.js';
import { CArray } from '../../../libs/Committee.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(CreateCommittee, cache);
    await compile(CommitteeContract, cache);
    await compile(UpdateKey, cache);
    await compile(DKGContract, cache);
    await compile(ReduceRound1, cache);
    await compile(FinalizeRound1, cache);
    await compile(Round1Contract, cache);
    const committeeAddress =
        'B62qjDLMhAw54JMrJLNZsrBRcoSjbQHQwn4ryceizpsQi8rwHQLA6R1';
    const dkgAddress =
        'B62qogHpAHHNP7PXAiRzHkpKnojERnjZq34GQ1PjjAv5wCLgtbYthAS';
    const round1Address =
        'B62qony53NMnmq49kxhtW1ttrQ8xvr58SNoX5jwgPY17pMChKLrjjWc';
    const round1Contract = new Round1Contract(
        PublicKey.fromBase58(round1Address)
    );

    const committeeId = Field(3);
    const keyId = Field(0);

    const [committees, committee, round1ZkApp, reduce, setting, keyStatus] =
        await Promise.all([
            (await axios.get(`https://api.auxo.fund/v0/committees/`)).data,
            (
                await axios.get(
                    `https://api.auxo.fund/v0/committees/${Number(committeeId)}`
                )
            ).data,
            (
                await axios.get(
                    'https://api.auxo.fund/v0/storages/round1/zkapps'
                )
            ).data,
            (
                await axios.get(
                    'https://api.auxo.fund/v0/storages/round1/reduce'
                )
            ).data,
            (
                await axios.get(
                    'https://api.auxo.fund/v0/storages/committee/setting/level1'
                )
            ).data,
            (
                await axios.get(
                    'https://api.auxo.fund/v0/storages/dkg/key-status/level1'
                )
            ).data,
        ]);
    const keys = await Promise.all(
        [...Array(committees.length).keys()].map(
            async (e) =>
                (
                    await axios.get(
                        `https://api.auxo.fund/v0/committees/${e}/keys`
                    )
                ).data
        )
    );
    // Fetch storage trees
    const contributionStorage = new Round1ContributionStorage();
    const publicKeyStorage = new PublicKeyStorage();

    keys.map((e: any, id: number) => {
        if (e.length == 0) return;
        e.map((key: any) => {
            if (key.status <= 1) return;
            console.log(
                `Adding key ${key.keyId} of committee ${key.committeeId} to storage...`
            );
            let contributionLevel2Tree = EMPTY_LEVEL_2_TREE();
            let publicKeyLevel2Tree = EMPTY_LEVEL_2_TREE();
            for (let i = 0; i < key.round1s.length; i++) {
                contributionLevel2Tree.setLeaf(
                    Round1ContributionStorage.calculateLevel2Index(
                        Field(key.round1s[i].memberId)
                    ).toBigInt(),
                    Round1ContributionStorage.calculateLeaf(
                        new Round1Contribution({
                            C: new CArray(
                                key.round1s[i].contribution.map(
                                    (group: any) =>
                                        new Group({ x: group.x, y: group.y })
                                )
                            ),
                        })
                    )
                );
                publicKeyLevel2Tree.setLeaf(
                    PublicKeyStorage.calculateLevel2Index(
                        Field(key.round1s[i].memberId)
                    ).toBigInt(),
                    PublicKeyStorage.calculateLeaf(
                        new Group({
                            x: key.round1s[i].contribution[0].x,
                            y: key.round1s[i].contribution[0].y,
                        })
                    )
                );
            }
            contributionStorage.updateInternal(
                Round1ContributionStorage.calculateLevel1Index({
                    committeeId: Field(key.committeeId),
                    keyId: Field(key.keyId),
                }),
                contributionLevel2Tree
            );
            publicKeyStorage.updateInternal(
                PublicKeyStorage.calculateLevel1Index({
                    committeeId: Field(key.committeeId),
                    keyId: Field(key.keyId),
                }),
                publicKeyLevel2Tree
            );
            console.log('Done');
        });
    });

    // Fetch state and actions
    await Promise.all([
        fetchZkAppState(committeeAddress),
        fetchZkAppState(dkgAddress),
    ]);
    const rawState = (await fetchZkAppState(round1Address)) || [];
    const round1State = {
        zkApps: rawState[0],
        reduceState: rawState[1],
        contributions: rawState[2],
        publicKeys: rawState[3],
    };
    Provable.log('Round 1 states:', round1State);

    const fromState =
        Field(
            8481153099833621817349097282911289219126620074665421844518804541945637548392n
        );
    const toState = undefined;

    const previousHashes = [
        Field(
            8481153099833621817349097282911289219126620074665421844518804541945637548392n
        ),
        Field(
            21769863472704035169109686949668942603687423803443025319900892543188653515100n
        ),
    ];

    const currentHashes = [
        Field(
            21769863472704035169109686949668942603687423803443025319900892543188653515100n
        ),
        Field(
            8302243030199083598511859698356353009770072315020564208363554095230974460094n
        ),
    ];

    const rawActions = (
        await fetchActions(round1Address, fromState, toState)
    ).filter((action) =>
        currentHashes.map((e) => e.toString()).includes(action.hash)
    );
    // rawActions.map((e) => Provable.log(e));
    const actions: Round1Action[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return Round1Action.fromFields(action);
    });
    console.log('Finalizing Actions:');
    actions.map((e) => Provable.log(e));

    console.log('FinalizeRound1.firstStep...');
    let proof = await FinalizeRound1.firstStep(
        new Round1Input({
            previousActionState: Field(0),
            action: Round1Action.empty(),
        }),
        Field(committee.threshold),
        Field(committee.numberOfMembers),
        round1State.contributions,
        round1State.publicKeys,
        round1State.reduceState,
        Round1ContributionStorage.calculateLevel1Index({
            committeeId: committeeId,
            keyId: keyId,
        }),
        contributionStorage.getLevel1Witness(
            Round1ContributionStorage.calculateLevel1Index({
                committeeId: committeeId,
                keyId: keyId,
            })
        ),
        publicKeyStorage.getLevel1Witness(
            PublicKeyStorage.calculateLevel1Index({
                committeeId: committeeId,
                keyId: keyId,
            })
        )
    );
    console.log('Done');

    contributionStorage.updateInternal(
        Round1ContributionStorage.calculateLevel1Index({
            committeeId: committeeId,
            keyId: keyId,
        }),
        EMPTY_LEVEL_2_TREE()
    );

    publicKeyStorage.updateInternal(
        PublicKeyStorage.calculateLevel1Index({
            committeeId: committeeId,
            keyId: keyId,
        }),
        EMPTY_LEVEL_2_TREE()
    );

    for (let i = 0; i < actions.length; i++) {
        let action = actions[i];
        Provable.log(action);
        console.log('FinalizeRound1.nextStep...');
        proof = await FinalizeRound1.nextStep(
            new Round1Input({
                previousActionState: previousHashes[Number(action.memberId)],
                action: action,
            }),
            proof,
            contributionStorage.getWitness(
                Round1ContributionStorage.calculateLevel1Index({
                    committeeId: action.committeeId,
                    keyId: action.keyId,
                }),
                Round1ContributionStorage.calculateLevel2Index(action.memberId)
            ),
            publicKeyStorage.getWitness(
                PublicKeyStorage.calculateLevel1Index({
                    committeeId: action.committeeId,
                    keyId: action.keyId,
                }),
                PublicKeyStorage.calculateLevel2Index(action.memberId)
            ),
            ReduceWitness.fromJSON(
                reduce[currentHashes[Number(action.memberId)].toString()]
            )
        );
        console.log('Done');

        contributionStorage.updateLeaf(
            {
                level1Index: Round1ContributionStorage.calculateLevel1Index({
                    committeeId: action.committeeId,
                    keyId: action.keyId,
                }),
                level2Index: Round1ContributionStorage.calculateLevel2Index(
                    action.memberId
                ),
            },
            Round1ContributionStorage.calculateLeaf(action.contribution)
        );

        publicKeyStorage.updateLeaf(
            {
                level1Index: PublicKeyStorage.calculateLevel1Index({
                    committeeId: action.committeeId,
                    keyId: action.keyId,
                }),
                level2Index: PublicKeyStorage.calculateLevel2Index(
                    action.memberId
                ),
            },
            PublicKeyStorage.calculateLeaf(action.contribution.C.get(Field(0)))
        );
    }

    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            round1Contract.finalize(
                proof,
                new ZkAppRef({
                    address: PublicKey.fromBase58(committeeAddress),
                    witness: AddressWitness.fromJSON(
                        round1ZkApp[ZkAppEnum.COMMITTEE]
                    ),
                }),
                new ZkAppRef({
                    address: PublicKey.fromBase58(dkgAddress),
                    witness: AddressWitness.fromJSON(
                        round1ZkApp[ZkAppEnum.DKG]
                    ),
                }),
                CommitteeLevel1Witness.fromJSON(
                    setting[
                        Number(SettingStorage.calculateLevel1Index(committeeId))
                    ]
                ),
                DKGLevel1Witness.fromJSON(
                    keyStatus[
                        Number(
                            KeyStatusStorage.calculateLevel1Index({
                                committeeId: committeeId,
                                keyId: keyId,
                            })
                        )
                    ]
                )
            );
        }
    );
    await proveAndSend(tx, feePayer.key, 'Round1Contract', 'finalize');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
