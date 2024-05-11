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
import { Network } from '../../helper/config.js';
import { fetchAccounts } from '../../helper/index.js';

async function main() {
    const logger: Utils.Logger = {
        info: true,
        error: true,
        memoryUsage: false,
    };
    const { accounts, cache, feePayer } = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs: true },
        {
            aliases: ['committee'],
        }
    );

    // Compile programs
    await Utils.compile(UpdateCommittee, cache);
    await Utils.compile(CommitteeContract, cache);

    // Get zkApps
    let committeeZkApp = Utils.getZkApp(
        accounts.committee,
        new CommitteeContract(accounts.committee.publicKey),
        CommitteeContract.name
    );
    let committeeContract = committeeZkApp.contract as CommitteeContract;
    await fetchAccounts([committeeZkApp.key.publicKey]);

    // Fetch off-chain storages
    const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
        .data;

    // Build off-chain storage trees
    let memberStorage = new MemberStorage();
    let settingStorage = new SettingStorage();
    const [memberLeafs, settingLeafs] = await Promise.all([
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/committee/member/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/committee/setting/leafs'
            )
        ).data,
    ]);
    Object.entries(memberLeafs).map(([index, data]: [string, any]) => {
        memberLeafs.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });
    Object.entries(settingLeafs).map(([index, data]: [string, any]) => {
        settingLeafs.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });

    // Fetch on-chain states
    const rawState =
        (await Utils.fetchZkAppState(committeeZkApp.key.publicKey)) || [];
    const committeeState = {
        nextCommitteeId: Field(rawState[0]),
        committeeTreeRoot: Field(rawState[1]),
        settingRoot: Field(rawState[2]),
        actionState: Field(rawState[3]),
    };
    Provable.log('Committee states:', committeeState);

    // Fetch actions
    const fromActionState =
        Field(
            28373415368718815380090794071598870635399146496579544406480489604358814828499n
        );
    const endActionState = Field(0n);
    const initialActionId = 3;
    const rawActions = await Utils.fetchActions(
        committeeZkApp.key.publicKey,
        fromActionState
        // endActionState
    );
    const actions: CommitteeAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return CommitteeAction.fromFields(action);
    });
    console.log('Actions:');
    actions.map((e) => Provable.log(e));

    // Prepare proofs
    let proof = await Utils.prove(
        UpdateCommittee.name,
        'init',
        async () =>
            UpdateCommittee.init(
                Reducer.initialActionState,
                memberStorage.root,
                settingStorage.root,
                committeeContract.nextCommitteeId.get()
            ),
        undefined,
        logger
    );

    for (let i = 0; i < actions.length; i++) {
        let action = actions[i];
        proof = await Utils.prove(
            UpdateCommittee.name,
            'update',
            async () =>
                UpdateCommittee.update(
                    proof,
                    action,
                    memberStorage.getLevel1Witness(Field(i)),
                    settingStorage.getLevel1Witness(Field(i))
                ),
            undefined,
            logger
        );

        for (let j = 0; j < Number(action.addresses.length); j++)
            memberStorage.updateRawLeaf(
                {
                    level1Index: Field(i),
                    level2Index: Field(j),
                },
                action.addresses.get(Field(j))
            );

        settingStorage.updateRawLeaf(
            { level1Index: Field(i) },
            {
                T: committees[i].threshold,
                N: Field(action.addresses.length),
            }
        );
    }

    // Prove and submit tx
    await Utils.proveAndSendTx(
        CommitteeContract.name,
        'update',
        async () => committeeContract.update(proof),
        feePayer,
        true,
        undefined,
        logger
    );
    await fetchAccounts([committeeZkApp.key.publicKey]);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
