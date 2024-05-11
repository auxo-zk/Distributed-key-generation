import axios from 'axios';
import { Field, Provable, UInt8 } from 'o1js';
import { Network } from '../../helper/config.js';
import { prepare } from '../../helper/prepare.js';
import { Utils } from '@auxo-dev/auxo-libs';
import { Rollup, RollupContract } from '../../../contracts/Rollup.js';
import { DkgContract, UpdateKey } from '../../../contracts/DKG.js';
import {
    FinalizeRound1,
    FinalizeRound1Input,
    Round1Action,
    Round1Contract,
} from '../../../contracts/Round1.js';
import { fetchAccounts } from '../../helper/index.js';
import { AddressStorage } from '../../../storages/AddressStorage.js';
import {
    DKG_LEVEL_2_TREE,
    KeyStatusStorage,
    PublicKeyStorage,
    Round1ContributionStorage,
} from '../../../storages/DkgStorage.js';
import { ProcessStorage } from '../../../storages/ProcessStorage.js';
import { RollupStorage } from '../../../storages/RollupStorage.js';
import { SettingStorage } from '../../../storages/CommitteeStorage.js';
import { ZkAppIndex } from '../../../contracts/constants.js';

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
            aliases: ['rollup', 'committee', 'dkg', 'round1'],
        }
    );

    // Compile programs
    await Utils.compile(Rollup, cache);
    await Utils.compile(RollupContract, cache);
    await Utils.compile(UpdateKey, cache);
    await Utils.compile(DkgContract, cache);
    await Utils.compile(FinalizeRound1, cache);
    await Utils.compile(Round1Contract, cache);

    // Get zkApps
    let rollupZkApp = Utils.getZkApp(
        accounts.rollup,
        new RollupContract(accounts.rollup.publicKey),
        RollupContract.name
    );
    let dkgZkApp = Utils.getZkApp(
        accounts.dkg,
        new DkgContract(accounts.dkg.publicKey),
        DkgContract.name
    );
    let round1ZkApp = Utils.getZkApp(
        accounts.round1,
        new Round1Contract(accounts.round1.publicKey),
        Round1Contract.name
    );
    let rollupContract = rollupZkApp.contract as RollupContract;
    let round1Contract = round1ZkApp.contract as Round1Contract;
    await fetchAccounts([
        rollupZkApp.key.publicKey,
        dkgZkApp.key.publicKey,
        round1ZkApp.key.publicKey,
    ]);

    const committeeId = Field(0);
    const keyId = Field(1);

    // Fetch and rebuild storage trees
    const sharedAddressStorage = new AddressStorage();
    const settingStorage = new SettingStorage();
    const keyStatusStorage = new KeyStatusStorage();
    const contributionStorage = new Round1ContributionStorage();
    const publicKeyStorage = new PublicKeyStorage();
    const processStorage = new ProcessStorage();
    const rollupStorage = new RollupStorage();

    const [
        addressLeafs,
        settingLeafs,
        keyStatusLeafs,
        contributionLeafs,
        publicKeyLeafs,
        processLeafs,
        rollupLeafs,
    ] = await Promise.all([
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/round1/zkapp/leafs'
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
                'https://api.auxo.fund/v0/storages/round1/contribution/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/round1/public-key/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/round1/process/leafs'
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
    Object.entries(publicKeyLeafs).map(([index, data]: [string, any]) => {
        let [level1Index, level2Index] = index.split('-').map((e) => Field(e));
        publicKeyStorage.updateLeaf(
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

    // Fetch state and actions
    const fromActionState =
        Field(
            6803625946086018452598705039620679515213457161077862313461629549127215823911n
        );
    const endActionState = undefined;

    const actionIds = [2, 3];
    const previousHashes = [
        Field(
            6803625946086018452598705039620679515213457161077862313461629549127215823911n
        ),
        Field(
            14636295595744228947495750518328083237509545151896270768203993303991364063415n
        ),
    ];
    const currentHashes = [
        Field(
            14636295595744228947495750518328083237509545151896270768203993303991364063415n
        ),
        Field(
            26085979524577151463015068549718748852348038974812695892528175434793673878044n
        ),
    ];

    const rawActions = (
        await Utils.fetchActions(
            round1ZkApp.key.publicKey,
            fromActionState
            // toState
        )
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

    let finalizeProof = await Utils.prove(
        FinalizeRound1.name,
        'init',
        async () =>
            FinalizeRound1.init(
                new FinalizeRound1Input({
                    previousActionState: Field(0),
                    action: Round1Action.empty(),
                    actionId: Field(0),
                }),
                rollupContract.rollupRoot.get(),
                Field(settingLeafs[Number(committeeId)].raw.T),
                Field(settingLeafs[Number(committeeId)].raw.N),
                round1Contract.contributionRoot.get(),
                round1Contract.publicKeyRoot.get(),
                round1Contract.processRoot.get(),
                Round1ContributionStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                contributionStorage.getLevel1Witness(
                    Round1ContributionStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    })
                ),
                publicKeyStorage.getLevel1Witness(
                    PublicKeyStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    })
                )
            ),
        undefined,
        logger
    );

    contributionStorage.updateInternal(
        Round1ContributionStorage.calculateLevel1Index({
            committeeId,
            keyId,
        }),
        DKG_LEVEL_2_TREE()
    );

    publicKeyStorage.updateInternal(
        PublicKeyStorage.calculateLevel1Index({
            committeeId: committeeId,
            keyId: keyId,
        }),
        DKG_LEVEL_2_TREE()
    );

    for (let i = 0; i < actions.length; i++) {
        let action = actions[i];
        let actionId = Field(actionIds[i]);
        finalizeProof = await Utils.prove(
            FinalizeRound1.name,
            'contribute',
            async () =>
                FinalizeRound1.contribute(
                    new FinalizeRound1Input({
                        previousActionState: Field(previousHashes[i]),
                        action,
                        actionId,
                    }),
                    finalizeProof,
                    contributionStorage.getWitness(
                        Round1ContributionStorage.calculateLevel1Index({
                            committeeId: action.committeeId,
                            keyId: action.keyId,
                        }),
                        Round1ContributionStorage.calculateLevel2Index(
                            action.memberId
                        )
                    ),
                    publicKeyStorage.getWitness(
                        PublicKeyStorage.calculateLevel1Index({
                            committeeId: action.committeeId,
                            keyId: action.keyId,
                        }),
                        PublicKeyStorage.calculateLevel2Index(Field(i))
                    ),
                    rollupStorage.getWitness(
                        RollupStorage.calculateLevel1Index({
                            zkAppIndex: Field(ZkAppIndex.ROUND1),
                            actionId,
                        })
                    ),
                    processStorage.getWitness(
                        ProcessStorage.calculateIndex(actionId)
                    )
                ),
            undefined,
            logger
        );

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
        processStorage.updateRawLeaf(
            {
                level1Index: ProcessStorage.calculateLevel1Index(actionId),
            },
            {
                actionState: Field(currentHashes[i]),
                processCounter: UInt8.from(0),
            }
        );
    }

    await Utils.proveAndSendTx(
        Round1Contract.name,
        'finalize',
        async () =>
            round1Contract.finalize(
                finalizeProof,
                settingStorage.getWitness(committeeId),
                keyStatusStorage.getWitness(
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
                    ZkAppIndex.ROUND1,
                    round1ZkApp.key.publicKey
                )
            ),
        feePayer,
        true,
        undefined,
        logger
    );
    await fetchAccounts([
        dkgZkApp.key.publicKey,
        round1ZkApp.key.publicKey,
        rollupZkApp.key.publicKey,
    ]);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
