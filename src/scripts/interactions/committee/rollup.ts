import 'dotenv/config.js';
import { Field, Mina, Provable, PublicKey, Reducer, fetchAccount } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import {
    CommitteeAction,
    CommitteeContract,
    UpdateCommittee,
} from '../../../contracts/Committee.js';
import axios from 'axios';
import { MemberArray } from '../../../libs/Committee.js';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import {
    COMMITTEE_LEVEL_2_TREE,
    MemberStorage,
    SettingStorage,
} from '../../../storages/CommitteeStorage.js';
import { INSTANCE_LIMITS } from '../../../constants.js';
import { prepare } from '../../helper/prepare.js';

async function main() {
    // Prepare for interactions
    const { cache, feePayer } = await prepare();

    // Custom values
    const fromState =
        Field(
            26089382628273984114009748697325178716021230220334200340522908388853527750250n
        );
    const toState = undefined;

    // Compile programs
    await Utils.compile(UpdateCommittee, cache);
    await Utils.compile(CommitteeContract, cache);
    const committeeAddress = process.env.BERKELEY_COMMITTEE_ADDRESS as string;
    console.log('Committee address:', committeeAddress);
    const committeeContract = new CommitteeContract(
        PublicKey.fromBase58(committeeAddress)
    );

    // Fetch on-chain states
    const rawState =
        (await Utils.fetchZkAppState(PublicKey.fromBase58(committeeAddress))) ||
        [];
    const committeeState = {
        nextCommitteeId: Field(rawState[0]),
        committeeTreeRoot: Field(rawState[1]),
        settingRoot: Field(rawState[2]),
        actionState: Field(rawState[3]),
    };
    Provable.log('Committee states:', committeeState);

    // Fetch off-chain storages
    const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
        .data;

    // Build off-chain storage trees
    let memberStorage = new MemberStorage();
    let settingStorage = new SettingStorage();
    committees
        .filter((e: any) => e.active)
        .map((committee: any) => {
            console.log(
                `Adding committee ${committee.committeeId} to storage...`
            );
            let level2Tree = COMMITTEE_LEVEL_2_TREE();
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
            console.log('Done');
        });

    // Fetch actions
    const rawActions = await Utils.fetchActions(
        PublicKey.fromBase58(committeeAddress),
        fromState,
        toState
    );
    const actions: CommitteeAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return new CommitteeAction({
            addresses: MemberArray.fromFields(
                action.slice(0, INSTANCE_LIMITS.MEMBER * 2 + 1)
            ),
            threshold: Field(action[INSTANCE_LIMITS.MEMBER * 2 + 1]),
            ipfsHash: IpfsHash.fromFields(
                action.slice(INSTANCE_LIMITS.MEMBER * 2 + 2)
            ),
        });
    });
    console.log('Actions:');
    actions.map((e) => Provable.log(e));

    // Prepare proofs
    console.log('UpdateCommittee.init...');
    let proof = await UpdateCommittee.init(
        committeeState.actionState,
        committeeState.committeeTreeRoot,
        committeeState.settingRoot,
        committeeState.nextCommitteeId
    );
    console.log('Done');

    const reduceActions = actions;

    for (let i = 0; i < reduceActions.length; i++) {
        let action = reduceActions[i];
        console.log(`${i} - UpdateCommittee.nextStep...`);
        let memberWitness = memberStorage.getLevel1Witness(
            MemberStorage.calculateLevel1Index(
                Field(i).add(committeeState.nextCommitteeId)
            )
        );
        let storageWitness = settingStorage.getWitness(
            SettingStorage.calculateLevel1Index(
                Field(i).add(committeeState.nextCommitteeId)
            )
        );

        // proof = await UpdateCommittee.update(
        //     proof,
        //     new CommitteeAction(action),
        //     memberWitness,
        //     storageWitness
        // );
        console.log('Done');

        let level2Tree = COMMITTEE_LEVEL_2_TREE();
        for (let i = 0; i < Number(action.addresses.length); i++) {
            level2Tree.setLeaf(
                BigInt(i),
                MemberArray.hash(action.addresses.get(Field(i)))
            );
        }

        memberStorage.updateInternal(
            MemberStorage.calculateLevel1Index(
                Field(i).add(committeeState.nextCommitteeId)
            ),
            level2Tree
        );
        settingStorage.updateLeaf(
            {
                level1Index: SettingStorage.calculateLevel1Index(
                    Field(i).add(committeeState.nextCommitteeId)
                ),
            },
            SettingStorage.calculateLeaf({
                T: action.threshold,
                N: action.addresses.length,
            })
        );
    }

    // Prove and submit tx
    await Utils.proveAndSendTx(
        CommitteeContract.name,
        'updateCommittee',
        async () => {
            committeeContract.updateCommittees(proof);
        },
        feePayer
    );
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
