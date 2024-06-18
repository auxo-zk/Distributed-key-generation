import axios from 'axios';
import { Field, Provable, Reducer, UInt8 } from 'o1js';
import { Network } from '../../helper/config.js';
import { prepare } from '../../helper/prepare.js';
import { Utils } from '@auxo-dev/auxo-libs';
import { Rollup, RollupContract } from '../../../contracts/Rollup.js';
import { DkgContract, UpdateKey } from '../../../contracts/DKG.js';
import { FinalizeRound1, Round1Contract } from '../../../contracts/Round1.js';
import { fetchAccounts } from '../../helper/index.js';
import { AddressStorage } from '../../../storages/AddressStorage.js';
import {
    DKG_LEVEL_2_TREE,
    EncryptionStorage,
    KeyStatusStorage,
    Round2ContributionStorage,
} from '../../../storages/DkgStorage.js';
import { ProcessStorage } from '../../../storages/ProcessStorage.js';
import { RollupStorage } from '../../../storages/RollupStorage.js';
import { SettingStorage } from '../../../storages/CommitteeStorage.js';
import { ZkAppIndex } from '../../../contracts/constants.js';
import { BatchEncryption } from '../../../contracts/Encryption.js';
import {
    FinalizeRound2,
    FinalizeRound2Input,
    Round2Action,
    Round2Contract,
} from '../../../contracts/Round2.js';
import { EncryptionHashArray } from '../../../libs/Committee.js';
import { compile } from '../../helper/compile.js';

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
            aliases: ['rollup', 'committee', 'dkg', 'round1', 'round2'],
        }
    );

    // Compile programs
    await compile(
        cache,
        [
            Rollup,
            RollupContract,
            UpdateKey,
            DkgContract,
            FinalizeRound1,
            Round1Contract,
            BatchEncryption,
            FinalizeRound2,
            Round2Contract,
        ],
        undefined,
        logger
    );

    // Get zkApps
    let rollupZkApp = Utils.getZkApp(
        accounts.rollup,
        new RollupContract(accounts.rollup.publicKey),
        { name: RollupContract.name }
    );
    let dkgZkApp = Utils.getZkApp(
        accounts.dkg,
        new DkgContract(accounts.dkg.publicKey),
        { name: DkgContract.name }
    );
    let round1ZkApp = Utils.getZkApp(
        accounts.round1,
        new Round1Contract(accounts.round1.publicKey),
        { name: Round1Contract.name }
    );
    let round2ZkApp = Utils.getZkApp(
        accounts.round2,
        new Round2Contract(accounts.round2.publicKey),
        { name: Round2Contract.name }
    );
    let rollupContract = rollupZkApp.contract as RollupContract;
    let round2Contract = round2ZkApp.contract as Round2Contract;
    await fetchAccounts([
        rollupZkApp.key.publicKey,
        dkgZkApp.key.publicKey,
        round1ZkApp.key.publicKey,
        round2ZkApp.key.publicKey,
    ]);

    const committeeId = Field(0);
    const keyId = Field(1);

    // Fetch and rebuild storage trees
    const sharedAddressStorage = new AddressStorage();
    const settingStorage = new SettingStorage();
    const keyStatusStorage = new KeyStatusStorage();
    const contributionStorage = new Round2ContributionStorage();
    const encryptionStorage = new EncryptionStorage();
    const processStorage = new ProcessStorage();
    const rollupStorage = new RollupStorage();

    const [
        addressLeafs,
        settingLeafs,
        keyStatusLeafs,
        contributionLeafs,
        encryptionLeafs,
        processLeafs,
        rollupLeafs,
    ] = await Promise.all([
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/round2/zkapp/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/committee/setting/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/dkg/key-status/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/round2/contribution/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/round2/encryption/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/round2/process/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/rollup/rollup/leafs'
            )
        ).data,
    ]);

    Object.entries(addressLeafs).map(([index, data]: [string, any]) => {
        sharedAddressStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });
    Object.entries(settingLeafs).map(([index, data]: [string, any]) => {
        settingStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });
    Object.entries(keyStatusLeafs).map(([index, data]: [string, any]) => {
        keyStatusStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });
    Object.entries(contributionLeafs).map(([index, data]: [string, any]) => {
        let [level1Index, level2Index] = index.split('-').map((e) => Field(e));
        contributionStorage.updateLeaf(
            { level1Index, level2Index },
            Field.from(data.leaf)
        );
    });
    Object.entries(encryptionLeafs).map(([index, data]: [string, any]) => {
        let [level1Index, level2Index] = index.split('-').map((e) => Field(e));
        encryptionStorage.updateLeaf(
            { level1Index, level2Index },
            Field.from(data.leaf)
        );
    });
    Object.entries(processLeafs).map(([index, data]: [string, any]) => {
        processStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });
    Object.entries(rollupLeafs).map(([index, data]: [string, any]) => {
        rollupStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });

    // Fetch state and action
    const fromActionState = Reducer.initialActionState;
    const endActionState = undefined;

    const actionIds = [3, 2];
    const contributionOrder = [1, 0];
    const previousHashes = [
        Field(
            12462783225281412162894431339277438629001681076236681076841908061249107453738n
        ),
        Field(
            16030499483815551524673590315351370170715930349087749666310392556068603745839n
        ),
    ];

    const currentHashes = [
        Field(
            19901200321464961021286562358597054525981496551262727599968019034215674584662n
        ),
        Field(
            12462783225281412162894431339277438629001681076236681076841908061249107453738n
        ),
    ];

    const rawActions = (
        await Utils.fetchActions(
            round2ZkApp.key.publicKey,
            fromActionState
            // toState
        )
    ).filter((action) =>
        currentHashes.map((e) => e.toString()).includes(action.hash)
    );
    const actions: Round2Action[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return Round2Action.fromFields(action);
    });
    console.log('Finalizing Actions:');
    const orderedActions = ((actionList) => {
        let newList = [];
        for (let i = 0; i < currentHashes.length; i++) {
            newList.push(actionList[contributionOrder[i]]);
        }
        return newList;
    })(actions);
    orderedActions.map((e) => Provable.log(e));

    const T = Number(settingLeafs[Number(committeeId)].raw.T);
    const N = Number(settingLeafs[Number(committeeId)].raw.N);
    let initialHashArray = new EncryptionHashArray(
        [...Array(N)].map(() => Field(0))
    );
    let finalizeProof = await Utils.prove(
        FinalizeRound2.name,
        'init',
        async () =>
            FinalizeRound2.init(
                new FinalizeRound2Input({
                    previousActionState: Field(0),
                    action: Round2Action.empty(),
                    actionId: Field(0),
                }),
                rollupContract.rollupRoot.get(),
                Field(T),
                Field(N),
                round2Contract.contributionRoot.get(),
                round2Contract.processRoot.get(),
                Round2ContributionStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                initialHashArray,
                contributionStorage.getLevel1Witness(
                    Round2ContributionStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    })
                )
            ),
        { logger }
    );

    contributionStorage.updateInternal(
        Round2ContributionStorage.calculateLevel1Index({
            committeeId,
            keyId,
        }),
        DKG_LEVEL_2_TREE()
    );

    encryptionStorage.updateInternal(
        EncryptionStorage.calculateLevel1Index({
            committeeId,
            keyId,
        }),
        DKG_LEVEL_2_TREE()
    );

    for (let i = 0; i < orderedActions.length; i++) {
        let action = orderedActions[i];
        let actionId = Field(actionIds[i]);
        let memberId = Round2Action.unpackId(action.packedId).memberId;
        finalizeProof = await Utils.prove(
            FinalizeRound2.name,
            'finalize',
            async () =>
                FinalizeRound2.contribute(
                    new FinalizeRound2Input({
                        previousActionState: previousHashes[i],
                        action,
                        actionId,
                    }),
                    finalizeProof,
                    contributionStorage.getWitness(
                        Round2ContributionStorage.calculateLevel1Index({
                            committeeId,
                            keyId,
                        }),
                        Round2ContributionStorage.calculateLevel2Index(memberId)
                    ),
                    rollupStorage.getWitness(
                        RollupStorage.calculateLevel1Index({
                            zkAppIndex: Field(ZkAppIndex.ROUND2),
                            actionId,
                        })
                    ),
                    processStorage.getWitness(
                        ProcessStorage.calculateIndex(actionId)
                    )
                ),
            { logger }
        );

        contributionStorage.updateLeaf(
            {
                level1Index: Round2ContributionStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                level2Index:
                    Round2ContributionStorage.calculateLevel2Index(memberId),
            },
            Round2ContributionStorage.calculateLeaf(action.contribution)
        );
        encryptionStorage.updateLeaf(
            {
                level1Index: EncryptionStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                level2Index: EncryptionStorage.calculateLevel2Index(memberId),
            },
            EncryptionStorage.calculateLeaf({
                contributions: actions.map((e) => e.contribution),
                memberId: memberId,
            })
        );
        processStorage.updateRawLeaf(
            {
                level1Index: ProcessStorage.calculateLevel1Index(actionId),
            },
            {
                actionState: currentHashes[i],
                processCounter: UInt8.from(0),
            }
        );
    }

    await Utils.proveAndSendTx(
        Round2Contract.name,
        'finalize',
        async () =>
            round2Contract.finalize(
                finalizeProof,
                encryptionStorage.getLevel1Witness(
                    EncryptionStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    })
                ),
                settingStorage.getWitness(committeeId),
                keyStatusStorage.getLevel1Witness(
                    KeyStatusStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    })
                ),
                sharedAddressStorage.getZkAppRef(
                    ZkAppIndex.COMMITTEE,
                    accounts.committee.publicKey
                ),
                sharedAddressStorage.getZkAppRef(
                    ZkAppIndex.DKG,
                    dkgZkApp.key.publicKey
                ),
                sharedAddressStorage.getZkAppRef(
                    ZkAppIndex.ROLLUP,
                    rollupZkApp.key.publicKey
                ),
                sharedAddressStorage.getZkAppRef(
                    ZkAppIndex.ROUND2,
                    round2ZkApp.key.publicKey
                )
            ),
        feePayer,
        true,
        { logger }
    );
    await fetchAccounts([
        dkgZkApp.key.publicKey,
        round2ZkApp.key.publicKey,
        rollupZkApp.key.publicKey,
    ]);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
