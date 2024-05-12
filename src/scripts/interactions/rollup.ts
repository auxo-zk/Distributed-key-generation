import axios from 'axios';
import { Field, Provable } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../helper/prepare.js';
import {
    Rollup,
    RollupAction,
    RollupContract,
} from '../../contracts/Rollup.js';
import { Network } from '../helper/config.js';
import {
    RollupCounterStorage,
    RollupStorage,
} from '../../storages/RollupStorage.js';
import { fetchAccounts } from '../helper/index.js';
import { AddressStorage } from '../../storages/AddressStorage.js';

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
            aliases: ['rollup'],
        }
    );

    // Compile programs
    await Utils.compile(Rollup, cache);
    await Utils.compile(RollupContract, cache);

    // Get zkApps
    let rollupZkApp = Utils.getZkApp(
        accounts.rollup,
        new RollupContract(accounts.rollup.publicKey),
        RollupContract.name
    );
    let rollupContract = rollupZkApp.contract as RollupContract;
    await fetchAccounts([rollupZkApp.key.publicKey]);

    // Fetch and rebuild storage trees
    const sharedAddressStorage = new AddressStorage();
    const rollupCounterStorage = new RollupCounterStorage();
    const rollupStorage = new RollupStorage();

    const [addressLeafs, rollupCounterLeafs, rollupLeafs] = await Promise.all([
        (
            await axios.get('https://api.auxo.fund/v0/storages/dkg/zkapp/leafs')
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/rollup/member/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/rollup/rollup/leafs'
            )
        ).data,
    ]);
    let actionCounters: { [key: number]: number } = {};
    Object.entries(addressLeafs).map(([index, data]: [string, any]) => {
        sharedAddressStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });
    Object.entries(rollupCounterLeafs).map(([index, data]: [string, any]) => {
        if (data.leaf !== '0')
            rollupCounterStorage.updateLeaf(
                { level1Index: Field.from(index) },
                Field.from(data.leaf)
            );
        Object.assign(actionCounters, { [Number(index)]: Number(data.leaf) });
    });
    Object.entries(rollupLeafs).map(([index, data]: [string, any]) => {
        rollupStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });

    // Fetch actions
    const fromActionState =
        Field(
            6142150741903469959487399934181833683923050987919089738773230258248953740685n
        );

    const rawActions = await Utils.fetchActions(
        rollupZkApp.key.publicKey,
        fromActionState
        // endActionState,
    );

    const actions: RollupAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return RollupAction.fromFields(action);
    });
    actions.map((e) => Provable.log(e));

    let rollupProof = await Utils.prove(
        Rollup.name,
        'init',
        async () =>
            Rollup.init(
                RollupAction.empty(),
                rollupContract.counterRoot.get(),
                rollupContract.rollupRoot.get(),
                rollupContract.actionState.get()
            ),
        undefined,
        logger
    );

    for (let i = 0; i < actions.length; i++) {
        let action = actions[i];
        let zkAppIndex = action.zkAppIndex;
        let actionId = Field(actionCounters[Number(zkAppIndex)]);
        Provable.log('Action ID:', actionId);
        rollupProof = await Utils.prove(
            Rollup.name,
            'rollup',
            async () =>
                Rollup.rollup(
                    action,
                    rollupProof,
                    actionId,
                    rollupCounterStorage.getWitness(
                        RollupCounterStorage.calculateLevel1Index(zkAppIndex)
                    ),
                    rollupStorage.getWitness(
                        RollupStorage.calculateLevel1Index({
                            zkAppIndex,
                            actionId,
                        })
                    )
                ),
            undefined,
            logger
        );
        rollupStorage.updateRawLeaf(
            {
                level1Index: RollupStorage.calculateLevel1Index({
                    zkAppIndex,
                    actionId,
                }),
            },
            action.actionHash
        );
        rollupCounterStorage.updateRawLeaf(
            {
                level1Index:
                    RollupCounterStorage.calculateLevel1Index(zkAppIndex),
            },
            actionId.add(1)
        );
        actionCounters[Number(zkAppIndex)] += 1;
        console.log(actionCounters);
    }

    await Utils.proveAndSendTx(
        RollupContract.name,
        'rollup',
        async () => rollupContract.rollup(rollupProof),
        feePayer,
        true,
        undefined,
        logger
    );
    await fetchAccounts([rollupZkApp.key.publicKey]);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
