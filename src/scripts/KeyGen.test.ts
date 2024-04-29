import { Cache, Field, Group, Provable, Scalar, TokenId, UInt8 } from 'o1js';
import { CustomScalar, IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { CommitteeContract, UpdateCommittee } from '../contracts/Committee.js';
import {
    DkgAction,
    DkgActionMask,
    DkgActionEnum,
    DkgContract,
    KeyStatus,
    UpdateKey,
    UpdateKeyInput,
} from '../contracts/DKG.js';
import {
    Round1Action,
    FinalizeRound1,
    Round1Contract,
    FinalizeRound1Input,
} from '../contracts/Round1.js';
import {
    Round2Action,
    FinalizeRound2,
    Round2Contract,
    FinalizeRound2Input,
} from '../contracts/Round2.js';
import {
    BatchEncryption,
    BatchEncryptionInput,
    PlainArray,
    RandomArray,
} from '../contracts/Encryption.js';
import {
    KeyCounterStorage,
    MemberStorage,
    SettingStorage,
} from '../storages/CommitteeStorage.js';
import {
    DKG_LEVEL_2_TREE,
    EncryptionStorage,
    KeyStatusStorage,
    KeyStorage,
    PublicKeyStorage,
    Round1ContributionStorage,
    Round2ContributionStorage,
} from '../storages/DkgStorage.js';
import {
    CArray,
    EncryptionHashArray,
    MemberArray,
    Round1Contribution,
    Round2Contribution,
    SecretPolynomial,
    calculatePublicKey,
    generateRandomPolynomial,
    getRound1Contribution,
    getRound2Contribution,
} from '../libs/Committee.js';
import {
    RollupCounterStorage,
    RollupStorage,
} from '../storages/RollupStorage.js';
import { AddressStorage } from '../storages/AddressStorage.js';
import { prepare } from './helper/prepare.js';
import { Key, Network } from './helper/config.js';
import { compile } from './helper/compile.js';
import { ZkAppIndex } from '../contracts/constants.js';
import { Rollup, RollupAction, RollupContract } from '../contracts/Rollup.js';
import { ProcessStorage } from '../storages/ProcessStorage.js';
import { fetchAccounts } from './helper/index.js';

describe('Key generation', () => {
    const doProofs = true;
    const cache = Cache.FileSystem('./caches');
    const profiler: Utils.Profiler | undefined = undefined;
    // Utils.getProfiler('key-generation', fs);
    const logger: Utils.Logger = {
        info: true,
        error: true,
        memoryUsage: false,
    };
    const NUM_KEYS = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let _: any;
    let users: Key[] = [];
    let rollupZkApp: Utils.ZkApp;
    let committeeZkApp: Utils.ZkApp;
    let dkgZkApp: Utils.ZkApp;
    let round1ZkApp: Utils.ZkApp;
    let round2ZkApp: Utils.ZkApp;
    let committees: {
        members: MemberArray;
        threshold: Field;
        ipfsHash: IpfsHash;
    }[] = [];
    let committeeSecrets: SecretPolynomial[] = [];
    let keys: {
        committeeId: Field;
        keyId: Field;
        key?: Group;
        round1Contributions?: Round1Contribution[];
        round2Contributions?: Round2Contribution[];
    }[] = [];

    // Address storages
    let sharedAddressStorage = new AddressStorage();

    // RollupContract storage
    let rollupStorage = new RollupStorage();
    let rollupCounterStorage = new RollupCounterStorage();

    // CommitteeContract storage
    let memberStorage = new MemberStorage();
    let settingStorage = new SettingStorage();

    // DkgContract storage
    let keyCounterStorage = new KeyCounterStorage();
    let keyStatusStorage = new KeyStatusStorage();
    let keyStorage = new KeyStorage();
    let dkgProcessStorage = new ProcessStorage();

    // Round1Contract storage
    let round1ContributionStorage = new Round1ContributionStorage();
    let publicKeyStorage = new PublicKeyStorage();
    let round1ProcessStorage = new ProcessStorage();

    // Round2Contract storage
    let round2ContributionStorage = new Round2ContributionStorage();
    let encryptionStorage = new EncryptionStorage();
    let round2ProcessStorage = new ProcessStorage();

    beforeAll(async () => {
        // Prepare environment
        _ = await prepare(
            './caches',
            { type: Network.Lightnet, doProofs },
            {
                aliases: ['rollup', 'committee', 'dkg', 'round1', 'round2'],
            }
        );
        users = [_.accounts[0], _.accounts[1]];

        // Prepare data for test cases
        committees = [
            {
                members: new MemberArray([
                    users[0].publicKey,
                    users[1].publicKey,
                ]),
                threshold: Field(1),
                ipfsHash: IpfsHash.fromString(
                    'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
                ),
            },
            {
                members: new MemberArray([
                    users[0].publicKey,
                    users[1].publicKey,
                ]),
                threshold: Field(2),
                ipfsHash: IpfsHash.fromString(
                    'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
                ),
            },
        ];
    });

    it('Should compile all ZK programs', async () => {
        await compile(
            cache,
            [
                Rollup,
                UpdateKey,
                FinalizeRound1,
                FinalizeRound2,
                BatchEncryption,
            ],
            undefined,
            logger
        );

        if (doProofs)
            await compile(
                cache,
                [
                    UpdateCommittee,
                    RollupContract,
                    CommitteeContract,
                    DkgContract,
                    Round1Contract,
                    Round2Contract,
                ],
                undefined,
                logger
            );
    });

    it('Should deploy contracts successfully', async () => {
        const { accounts, feePayer } = _;

        // Construct address books
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.ROLLUP),
            accounts.rollup.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.COMMITTEE),
            accounts.committee.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.DKG),
            accounts.dkg.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.ROUND1),
            accounts.round1.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.ROUND2),
            accounts.round2.publicKey
        );

        // Calculate mock committee trees
        for (let i = 0; i < committees.length; i++) {
            let committee = committees[i];
            for (let j = 0; j < Number(committee.members.length); j++)
                memberStorage.updateRawLeaf(
                    {
                        level1Index: Field(i),
                        level2Index: Field(j),
                    },
                    committee.members.get(Field(j))
                );

            settingStorage.updateRawLeaf(
                { level1Index: Field(i) },
                {
                    T: committees[i].threshold,
                    N: Field(committee.members.length),
                }
            );
        }

        // Prepare zkApps
        rollupZkApp = Utils.getZkApp(
            accounts.rollup,
            new RollupContract(accounts.rollup.publicKey),
            RollupContract.name,
            { zkAppRoot: sharedAddressStorage.root }
        );
        committeeZkApp = Utils.getZkApp(
            accounts.committee,
            new CommitteeContract(accounts.committee.publicKey),
            CommitteeContract.name,
            {
                zkAppRoot: sharedAddressStorage.root,
                memberRoot: memberStorage.root,
                settingRoot: settingStorage.root,
            }
        );
        dkgZkApp = Utils.getZkApp(
            accounts.dkg,
            new DkgContract(accounts.dkg.publicKey),
            DkgContract.name,
            { zkAppRoot: sharedAddressStorage.root }
        );
        round1ZkApp = Utils.getZkApp(
            accounts.round1,
            new Round1Contract(accounts.round1.publicKey),
            Round1Contract.name,
            { zkAppRoot: sharedAddressStorage.root }
        );
        round2ZkApp = Utils.getZkApp(
            accounts.round2,
            new Round2Contract(accounts.round2.publicKey),
            Round2Contract.name,
            { zkAppRoot: sharedAddressStorage.root }
        );
        let rollupZkAppWithDkgToken = {
            ...rollupZkApp,
            contract: new RollupContract(
                accounts.rollup.publicKey,
                TokenId.derive(accounts.dkg.publicKey)
            ),
        };
        let rollupZkAppWithRound1Token = {
            ...rollupZkApp,
            contract: new RollupContract(
                accounts.rollup.publicKey,
                TokenId.derive(accounts.round1.publicKey)
            ),
        };
        let rollupZkAppWithRound2Token = {
            ...rollupZkApp,
            contract: new RollupContract(
                accounts.rollup.publicKey,
                TokenId.derive(accounts.round2.publicKey)
            ),
        };
        let dkgZkAppWithRound1Token = {
            ...dkgZkApp,
            contract: new DkgContract(
                accounts.dkg.publicKey,
                TokenId.derive(accounts.round1.publicKey)
            ),
        };
        let dkgZkAppWithRound2Token = {
            ...dkgZkApp,
            contract: new DkgContract(
                accounts.dkg.publicKey,
                TokenId.derive(accounts.round2.publicKey)
            ),
        };

        // Deploy contract accounts
        await Utils.deployZkApps(
            [rollupZkApp, committeeZkApp, dkgZkApp, round1ZkApp, round2ZkApp],
            feePayer,
            true,
            logger
        );

        // Deploy contract accounts with tokens
        await Utils.deployZkAppsWithToken(
            [
                {
                    owner: dkgZkApp,
                    user: rollupZkAppWithDkgToken,
                },
                {
                    owner: round1ZkApp,
                    user: rollupZkAppWithRound1Token,
                },
                {
                    owner: round2ZkApp,
                    user: rollupZkAppWithRound2Token,
                },
                {
                    owner: round1ZkApp,
                    user: dkgZkAppWithRound1Token,
                },
                {
                    owner: round2ZkApp,
                    user: dkgZkAppWithRound2Token,
                },
            ],
            feePayer,
            true,
            logger
        );
    });

    it('Should generate new keys', async () => {
        // Initialization
        const { feePayer } = _;
        let dkgContract = dkgZkApp.contract as DkgContract;
        let rollupContract = rollupZkApp.contract as RollupContract;
        await fetchAccounts([
            dkgZkApp.key.publicKey,
            rollupZkApp.key.publicKey,
        ]);

        // Key generation actions
        for (let i = 0; i < committees.slice(0, 1).length; i++) {
            let committeeId = Field(i);
            for (let j = 0; j < NUM_KEYS; j++) {
                let keyId = Field(j);
                let memberWitness = memberStorage.getWitness(
                    MemberStorage.calculateLevel1Index(committeeId),
                    MemberStorage.calculateLevel2Index(Field(j))
                );
                await Utils.proveAndSendTx(
                    CommitteeContract.name,
                    'committeeAction',
                    async () =>
                        dkgContract.committeeAction(
                            Field.random(),
                            Field(DkgActionEnum.GENERATE_KEY),
                            memberWitness,
                            sharedAddressStorage.getZkAppRef(
                                ZkAppIndex.COMMITTEE,
                                committeeZkApp.key.publicKey
                            ),
                            sharedAddressStorage.getZkAppRef(
                                ZkAppIndex.ROLLUP,
                                rollupZkApp.key.publicKey
                            ),
                            sharedAddressStorage.getZkAppRef(
                                ZkAppIndex.DKG,
                                dkgZkApp.key.publicKey
                            )
                        ),
                    {
                        sender: users[j],
                    },
                    true,
                    profiler,
                    logger
                );
                await fetchAccounts([
                    dkgZkApp.key.publicKey,
                    rollupZkApp.key.publicKey,
                ]);
                let action = new DkgAction({
                    committeeId,
                    keyId: Field(-1),
                    key: Group.zero,
                    mask: DkgActionMask.createMask(
                        Field(DkgActionEnum.GENERATE_KEY)
                    ),
                });
                dkgZkApp.actions?.push(DkgAction.toFields(action));
                dkgZkApp.actionStates?.push(
                    dkgContract.account.actionState.get()
                );
                rollupZkApp.actions?.push(
                    RollupAction.toFields(
                        new RollupAction({
                            zkAppIndex: Field(ZkAppIndex.DKG),
                            actionHash: action.hash(),
                        })
                    )
                );
                rollupZkApp.actionStates?.push(
                    rollupContract.account.actionState.get()
                );
                keys.push({
                    committeeId,
                    keyId,
                });
            }
        }

        // Rollup dkg actions
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
            profiler,
            logger
        );
        for (let i = 0; i < rollupZkApp.actions.length; i++) {
            let action = RollupAction.fromFields(rollupZkApp.actions[i]);
            rollupProof = await Utils.prove(
                Rollup.name,
                'rollup',
                async () =>
                    Rollup.rollup(
                        action,
                        rollupProof,
                        Field(i),
                        rollupCounterStorage.getWitness(
                            RollupCounterStorage.calculateLevel1Index(
                                Field(ZkAppIndex.DKG)
                            )
                        ),
                        rollupStorage.getWitness(
                            RollupStorage.calculateLevel1Index({
                                zkAppIndex: Field(ZkAppIndex.DKG),
                                actionId: Field(i),
                            })
                        )
                    ),
                profiler,
                logger
            );
            rollupCounterStorage.updateRawLeaf(
                {
                    level1Index: RollupCounterStorage.calculateLevel1Index(
                        Field(ZkAppIndex.DKG)
                    ),
                },
                Field(i + 1)
            );
            rollupStorage.updateRawLeaf(
                {
                    level1Index: RollupStorage.calculateLevel1Index({
                        zkAppIndex: Field(ZkAppIndex.DKG),
                        actionId: Field(i),
                    }),
                },
                action.actionHash
            );
        }
        await Utils.proveAndSendTx(
            RollupContract.name,
            'rollup',
            async () => rollupContract.rollup(rollupProof),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([rollupZkApp.key.publicKey]);

        // Update dkg keys
        let updateKeyProof = await Utils.prove(
            UpdateKey.name,
            'init',
            async () =>
                UpdateKey.init(
                    new UpdateKeyInput({
                        previousActionState: Field(0),
                        action: DkgAction.empty(),
                        actionId: Field(0),
                    }),
                    rollupContract.rollupRoot.get(),
                    dkgContract.keyCounterRoot.get(),
                    dkgContract.keyStatusRoot.get(),
                    dkgContract.keyRoot.get(),
                    dkgContract.processRoot.get()
                ),
            profiler,
            logger
        );
        for (let i = 0; i < NUM_KEYS; i++) {
            let action = DkgAction.fromFields(dkgZkApp.actions[i]);
            let actionId = Field(i);
            let keyId = Field(i);
            let input = new UpdateKeyInput({
                previousActionState: dkgZkApp.actionStates[i],
                action,
                actionId,
            });
            updateKeyProof = await Utils.prove(
                UpdateKey.name,
                'generate',
                async () =>
                    UpdateKey.generate(
                        input,
                        updateKeyProof,
                        keyId,
                        keyCounterStorage.getWitness(
                            KeyCounterStorage.calculateLevel1Index(
                                action.committeeId
                            )
                        ),
                        keyStatusStorage.getWitness(
                            KeyStatusStorage.calculateLevel1Index({
                                committeeId: action.committeeId,
                                keyId,
                            })
                        ),
                        rollupStorage.getWitness(
                            RollupStorage.calculateLevel1Index({
                                zkAppIndex: Field(ZkAppIndex.DKG),
                                actionId,
                            })
                        ),
                        dkgProcessStorage.getWitness(
                            ProcessStorage.calculateIndex(actionId)
                        )
                    ),
                profiler,
                logger
            );
            keyCounterStorage.updateRawLeaf(
                {
                    level1Index: KeyCounterStorage.calculateLevel1Index(
                        action.committeeId
                    ),
                },
                KeyCounterStorage.calculateLeaf(Field(i + 1))
            );
            keyStatusStorage.updateRawLeaf(
                {
                    level1Index: KeyStatusStorage.calculateLevel1Index({
                        committeeId: action.committeeId,
                        keyId,
                    }),
                },
                Provable.switch(action.mask.values, Field, [
                    Field(KeyStatus.ROUND_1_CONTRIBUTION),
                    Field(KeyStatus.ROUND_2_CONTRIBUTION),
                    Field(KeyStatus.ACTIVE),
                    Field(KeyStatus.DEPRECATED),
                ])
            );
            dkgProcessStorage.updateRawLeaf(
                {
                    level1Index: ProcessStorage.calculateLevel1Index(actionId),
                },
                {
                    actionState: dkgZkApp.actionStates[i + 1],
                    processCounter: UInt8.from(0),
                }
            );
        }
        await Utils.proveAndSendTx(
            DkgContract.name,
            'update',
            async () =>
                dkgContract.update(
                    updateKeyProof,
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.ROLLUP,
                        rollupContract.address
                    )
                ),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([dkgZkApp.key.publicKey]);
    });

    it('Should contribute round 1 successfully', async () => {
        // Initialization
        const { feePayer } = _;
        let committeeId = Field(0);
        let keyId = Field(0);
        let committee = committees[Number(committeeId)];
        let dkgContract = dkgZkApp.contract as DkgContract;
        let round1Contract = round1ZkApp.contract as Round1Contract;
        let rollupContract = rollupZkApp.contract as RollupContract;
        await fetchAccounts([
            round1ZkApp.key.publicKey,
            rollupZkApp.key.publicKey,
        ]);
        let T = Number(committee.threshold);
        let N = Number(committee.members.length);
        keys[Number(keyId)].round1Contributions = [];

        // Members' round 1 contribution actions
        for (let i = 0; i < N; i++) {
            let secret = generateRandomPolynomial(T, N);
            committeeSecrets.push(secret);
            let contribution = getRound1Contribution(secret);
            let action = new Round1Action({
                committeeId,
                keyId,
                memberId: Field(i),
                contribution,
            });
            let memberWitness = memberStorage.getWitness(
                MemberStorage.calculateLevel1Index(committeeId),
                MemberStorage.calculateLevel2Index(Field(i))
            );
            await Utils.proveAndSendTx(
                Round1Contract.name,
                'contribute',
                async () =>
                    round1Contract.contribute(
                        keyId,
                        contribution.C,
                        memberWitness,
                        sharedAddressStorage.getZkAppRef(
                            ZkAppIndex.COMMITTEE,
                            committeeZkApp.key.publicKey
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
                {
                    sender: users[i],
                },
                true,
                profiler,
                logger
            );
            await fetchAccounts([
                round1ZkApp.key.publicKey,
                rollupZkApp.key.publicKey,
            ]);
            round1ZkApp.actions?.push(Round1Action.toFields(action));
            round1ZkApp.actionStates?.push(
                round1Contract.account.actionState.get()
            );
            rollupZkApp.actions?.push(
                RollupAction.toFields(
                    new RollupAction({
                        zkAppIndex: Field(ZkAppIndex.ROUND1),
                        actionHash: action.hash(),
                    })
                )
            );
            rollupZkApp.actionStates?.push(
                rollupContract.account.actionState.get()
            );
            keys[Number(keyId)].round1Contributions?.push(contribution);
        }
        keys[Number(keyId)].key = calculatePublicKey(
            keys[Number(keyId)].round1Contributions || []
        );

        // Rollup round 1 actions
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
            profiler,
            logger
        );
        let actions = rollupZkApp.actions?.slice(NUM_KEYS, NUM_KEYS + N);
        for (let i = 0; i < actions.length; i++) {
            let action = RollupAction.fromFields(actions[i]);
            rollupProof = await Utils.prove(
                Rollup.name,
                'rollup',
                async () =>
                    Rollup.rollup(
                        action,
                        rollupProof,
                        Field(i),
                        rollupCounterStorage.getWitness(
                            RollupCounterStorage.calculateLevel1Index(
                                Field(ZkAppIndex.ROUND1)
                            )
                        ),
                        rollupStorage.getWitness(
                            RollupStorage.calculateLevel1Index({
                                zkAppIndex: Field(ZkAppIndex.ROUND1),
                                actionId: Field(i),
                            })
                        )
                    ),
                profiler,
                logger
            );
            rollupCounterStorage.updateRawLeaf(
                {
                    level1Index: RollupCounterStorage.calculateLevel1Index(
                        Field(ZkAppIndex.ROUND1)
                    ),
                },
                Field(i + 1)
            );
            rollupStorage.updateRawLeaf(
                {
                    level1Index: RollupStorage.calculateLevel1Index({
                        zkAppIndex: Field(ZkAppIndex.ROUND1),
                        actionId: Field(i),
                    }),
                },
                action.actionHash
            );
        }
        await Utils.proveAndSendTx(
            RollupContract.name,
            'rollup',
            async () => rollupContract.rollup(rollupProof),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([rollupZkApp.key.publicKey]);

        // Finalize round 1 contributions
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
                    committees[0].threshold,
                    committees[0].members.length,
                    round1Contract.contributionRoot.get(),
                    round1Contract.publicKeyRoot.get(),
                    round1Contract.processRoot.get(),
                    Round1ContributionStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    }),
                    round1ContributionStorage.getLevel1Witness(
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
            profiler,
            logger
        );
        round1ContributionStorage.updateInternal(
            Round1ContributionStorage.calculateLevel1Index({
                committeeId,
                keyId,
            }),
            DKG_LEVEL_2_TREE()
        );
        publicKeyStorage.updateInternal(
            PublicKeyStorage.calculateLevel1Index({
                committeeId,
                keyId,
            }),
            DKG_LEVEL_2_TREE()
        );
        for (let i = 0; i < N; i++) {
            let action = Round1Action.fromFields(round1ZkApp.actions[i]);
            let actionId = Field(i);
            finalizeProof = await Utils.prove(
                FinalizeRound1.name,
                'contribute',
                async () =>
                    FinalizeRound1.contribute(
                        new FinalizeRound1Input({
                            previousActionState: round1ZkApp.actionStates[i],
                            action,
                            actionId,
                        }),
                        finalizeProof,
                        round1ContributionStorage.getWitness(
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
                        round1ProcessStorage.getWitness(
                            ProcessStorage.calculateIndex(actionId)
                        )
                    ),
                profiler,
                logger
            );
            round1ContributionStorage.updateRawLeaf(
                {
                    level1Index: Round1ContributionStorage.calculateLevel1Index(
                        {
                            committeeId: action.committeeId,
                            keyId: action.keyId,
                        }
                    ),
                    level2Index: Round1ContributionStorage.calculateLevel2Index(
                        action.memberId
                    ),
                },
                action.contribution
            );
            publicKeyStorage.updateRawLeaf(
                {
                    level1Index: PublicKeyStorage.calculateLevel1Index({
                        committeeId: action.committeeId,
                        keyId: action.keyId,
                    }),
                    level2Index: PublicKeyStorage.calculateLevel2Index(
                        action.memberId
                    ),
                },
                action.contribution.C.get(Field(0))
            );
            round1ProcessStorage.updateRawLeaf(
                {
                    level1Index: ProcessStorage.calculateLevel1Index(actionId),
                },
                {
                    actionState: round1ZkApp.actionStates[i + 1],
                    processCounter: UInt8.from(0),
                }
            );
        }
        finalizeProof.publicOutput.publicKey.assertEquals(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            keys[Number(keyId)].key!
        );
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
                        committeeZkApp.key.publicKey
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
            profiler,
            logger
        );
        await fetchAccounts([
            dkgZkApp.key.publicKey,
            round1ZkApp.key.publicKey,
            rollupZkApp.key.publicKey,
        ]);
        let action = new DkgAction({
            committeeId,
            keyId,
            key: finalizeProof.publicOutput.publicKey,
            mask: DkgActionMask.createMask(
                Field(DkgActionEnum.FINALIZE_ROUND_1)
            ),
        });
        let actionId = Field(NUM_KEYS);
        let rollupAction = new RollupAction({
            zkAppIndex: Field(ZkAppIndex.DKG),
            actionHash: action.hash(),
        });
        dkgZkApp.actionStates.push(dkgContract.account.actionState.get());
        dkgZkApp.actions.push(DkgAction.toFields(action));
        rollupZkApp.actionStates.push(rollupContract.account.actionState.get());
        rollupZkApp.actions.push(RollupAction.toFields(rollupAction));

        // Rollup dkg action
        rollupProof = await Utils.prove(Rollup.name, 'init', async () =>
            Rollup.init(
                RollupAction.empty(),
                rollupContract.counterRoot.get(),
                rollupContract.rollupRoot.get(),
                rollupContract.actionState.get()
            )
        );
        rollupProof = await Utils.prove(
            Rollup.name,
            'rollup',
            async () =>
                Rollup.rollup(
                    rollupAction,
                    rollupProof,
                    Field(NUM_KEYS),
                    rollupCounterStorage.getWitness(
                        RollupCounterStorage.calculateLevel1Index(
                            Field(ZkAppIndex.DKG)
                        )
                    ),
                    rollupStorage.getWitness(
                        RollupStorage.calculateLevel1Index({
                            zkAppIndex: Field(ZkAppIndex.DKG),
                            actionId,
                        })
                    )
                ),
            profiler,
            logger
        );
        rollupCounterStorage.updateRawLeaf(
            {
                level1Index: RollupCounterStorage.calculateLevel1Index(
                    Field(ZkAppIndex.DKG)
                ),
            },
            actionId.add(1)
        );
        rollupStorage.updateRawLeaf(
            {
                level1Index: RollupStorage.calculateLevel1Index({
                    zkAppIndex: Field(ZkAppIndex.DKG),
                    actionId,
                }),
            },
            rollupAction.actionHash
        );
        await Utils.proveAndSendTx(
            RollupContract.name,
            'rollup',
            async () => rollupContract.rollup(rollupProof),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([rollupZkApp.key.publicKey]);

        // Update dkg key
        let updateKeyProof = await Utils.prove(
            UpdateKey.name,
            'init',
            async () =>
                UpdateKey.init(
                    new UpdateKeyInput({
                        previousActionState: Field(0),
                        action: DkgAction.empty(),
                        actionId: Field(0),
                    }),
                    rollupContract.rollupRoot.get(),
                    dkgContract.keyCounterRoot.get(),
                    dkgContract.keyStatusRoot.get(),
                    dkgContract.keyRoot.get(),
                    dkgContract.processRoot.get()
                )
        );

        let input = new UpdateKeyInput({
            previousActionState: dkgZkApp.actionStates[NUM_KEYS],
            action,
            actionId,
        });
        updateKeyProof = await Utils.prove(
            UpdateKey.name,
            'update',
            async () =>
                UpdateKey.update(
                    input,
                    updateKeyProof,
                    keyStatusStorage.getWitness(
                        KeyStatusStorage.calculateLevel1Index({
                            committeeId: action.committeeId,
                            keyId: action.keyId,
                        })
                    ),
                    keyStorage.getWitness(
                        KeyStatusStorage.calculateLevel1Index({
                            committeeId: action.committeeId,
                            keyId: action.keyId,
                        })
                    ),
                    rollupStorage.getWitness(
                        RollupStorage.calculateLevel1Index({
                            zkAppIndex: Field(ZkAppIndex.DKG),
                            actionId,
                        })
                    ),
                    dkgProcessStorage.getWitness(
                        ProcessStorage.calculateIndex(actionId)
                    )
                ),
            profiler,
            logger
        );
        keyStatusStorage.updateRawLeaf(
            {
                level1Index: KeyStatusStorage.calculateLevel1Index({
                    committeeId: action.committeeId,
                    keyId: action.keyId,
                }),
            },
            Provable.switch(action.mask.values, Field, [
                Field(KeyStatus.ROUND_1_CONTRIBUTION),
                Field(KeyStatus.ROUND_2_CONTRIBUTION),
                Field(KeyStatus.ACTIVE),
                Field(KeyStatus.DEPRECATED),
            ])
        );
        keyStorage.updateRawLeaf(
            {
                level1Index: KeyStatusStorage.calculateLevel1Index({
                    committeeId: action.committeeId,
                    keyId: action.keyId,
                }),
            },
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            keys[Number(keyId)].key!
        );
        dkgProcessStorage.updateRawLeaf(
            {
                level1Index: ProcessStorage.calculateLevel1Index(actionId),
            },
            {
                actionState: dkgZkApp.actionStates[Number(actionId) + 1],
                processCounter: UInt8.from(0),
            }
        );

        await Utils.proveAndSendTx(
            DkgContract.name,
            'update',
            async () =>
                dkgContract.update(
                    updateKeyProof,
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.ROLLUP,
                        rollupContract.address
                    )
                ),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([dkgZkApp.key.publicKey]);
    });

    it('Should contribute round 2 successfully', async () => {
        // Initialization
        const { feePayer } = _;
        let committeeId = Field(0);
        let keyId = Field(0);
        let committee = committees[Number(committeeId)];
        let dkgContract = dkgZkApp.contract as DkgContract;
        let round2Contract = round2ZkApp.contract as Round2Contract;
        let rollupContract = rollupZkApp.contract as RollupContract;
        await fetchAccounts([
            round2ZkApp.key.publicKey,
            rollupZkApp.key.publicKey,
        ]);
        let T = Number(committee.threshold);
        let N = Number(committee.members.length);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let round1Contributions = keys[Number(keyId)].round1Contributions!;
        keys[Number(keyId)].round2Contributions = [];

        // Members' contribution actions
        for (let i = 0; i < N; i++) {
            let randoms = [...Array(N)].map(() => Scalar.random());
            let contribution = getRound2Contribution(
                committeeSecrets[i],
                i,
                round1Contributions,
                randoms
            );
            let action = new Round2Action({
                committeeId,
                keyId,
                memberId: Field(i),
                contribution,
            });

            let encryptionProof = await Utils.prove(
                BatchEncryption.name,
                'encrypt',
                async () =>
                    BatchEncryption.encrypt(
                        new BatchEncryptionInput({
                            publicKeys: new CArray(
                                round1Contributions.map((e) =>
                                    e.C.get(Field(0))
                                )
                            ),
                            c: action.contribution.c,
                            U: action.contribution.U,
                            memberId: Field(i),
                        }),
                        new PlainArray(
                            committeeSecrets[i].f.map((e) =>
                                CustomScalar.fromScalar(e)
                            )
                        ),
                        new RandomArray(
                            randoms.map((e) => CustomScalar.fromScalar(e))
                        )
                    ),
                profiler,
                logger
            );
            let memberWitness = memberStorage.getWitness(
                MemberStorage.calculateLevel1Index(committeeId),
                MemberStorage.calculateLevel2Index(Field(i))
            );
            await Utils.proveAndSendTx(
                Round2Contract.name,
                'contribute',
                async () =>
                    round2Contract.contribute(
                        keyId,
                        encryptionProof,
                        memberWitness,
                        publicKeyStorage.getLevel1Witness(
                            PublicKeyStorage.calculateLevel1Index({
                                committeeId,
                                keyId,
                            })
                        ),
                        sharedAddressStorage.getZkAppRef(
                            ZkAppIndex.COMMITTEE,
                            committeeZkApp.key.publicKey
                        ),
                        sharedAddressStorage.getZkAppRef(
                            ZkAppIndex.ROUND1,
                            round1ZkApp.key.publicKey
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
                {
                    sender: users[i],
                },
                true,
                profiler,
                logger
            );
            await fetchAccounts([
                round2ZkApp.key.publicKey,
                rollupZkApp.key.publicKey,
            ]);
            round2ZkApp.actionStates.push(
                round2Contract.account.actionState.get()
            );
            round2ZkApp.actions.push(Round2Action.toFields(action));
            rollupZkApp.actionStates.push(
                rollupContract.account.actionState.get()
            );
            rollupZkApp.actions.push(
                RollupAction.toFields(
                    new RollupAction({
                        zkAppIndex: Field(ZkAppIndex.ROUND2),
                        actionHash: action.hash(),
                    })
                )
            );
            keys[Number(keyId)].round2Contributions?.push(contribution);
        }

        //  Rollup round 2 contribution actions
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
            profiler,
            logger
        );
        let actions = rollupZkApp.actions?.slice(
            NUM_KEYS + N + 1,
            NUM_KEYS + 2 * N + 1
        );
        for (let i = 0; i < actions.length; i++) {
            let action = RollupAction.fromFields(actions[i]);
            rollupProof = await Utils.prove(
                Rollup.name,
                'rollup',
                async () =>
                    Rollup.rollup(
                        action,
                        rollupProof,
                        Field(i),
                        rollupCounterStorage.getWitness(
                            RollupCounterStorage.calculateLevel1Index(
                                Field(ZkAppIndex.ROUND2)
                            )
                        ),
                        rollupStorage.getWitness(
                            RollupStorage.calculateLevel1Index({
                                zkAppIndex: Field(ZkAppIndex.ROUND2),
                                actionId: Field(i),
                            })
                        )
                    ),
                profiler,
                logger
            );
            rollupCounterStorage.updateRawLeaf(
                {
                    level1Index: RollupCounterStorage.calculateLevel1Index(
                        Field(ZkAppIndex.ROUND2)
                    ),
                },
                Field(i + 1)
            );
            rollupStorage.updateRawLeaf(
                {
                    level1Index: RollupStorage.calculateLevel1Index({
                        zkAppIndex: Field(ZkAppIndex.ROUND2),
                        actionId: Field(i),
                    }),
                },
                action.actionHash
            );
        }
        await Utils.proveAndSendTx(
            RollupContract.name,
            'rollup',
            async () => rollupContract.rollup(rollupProof),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([rollupZkApp.key.publicKey]);

        // Finalize round 2 contributions
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
                    round2ContributionStorage.getLevel1Witness(
                        Round2ContributionStorage.calculateLevel1Index({
                            committeeId,
                            keyId,
                        })
                    )
                ),
            profiler,
            logger
        );
        round2ContributionStorage.updateInternal(
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
        for (let i = 0; i < N; i++) {
            let action = Round2Action.fromFields(round2ZkApp.actions[i]);
            let actionId = Field(i);
            finalizeProof = await Utils.prove(
                FinalizeRound2.name,
                'finalize',
                async () =>
                    FinalizeRound2.contribute(
                        new FinalizeRound2Input({
                            previousActionState: round2ZkApp.actionStates[i],
                            action,
                            actionId,
                        }),
                        finalizeProof,
                        round2ContributionStorage.getWitness(
                            Round2ContributionStorage.calculateLevel1Index({
                                committeeId: action.committeeId,
                                keyId: action.keyId,
                            }),
                            Round2ContributionStorage.calculateLevel2Index(
                                action.memberId
                            )
                        ),
                        rollupStorage.getWitness(
                            RollupStorage.calculateLevel1Index({
                                zkAppIndex: Field(ZkAppIndex.ROUND2),
                                actionId,
                            })
                        ),
                        round2ProcessStorage.getWitness(
                            ProcessStorage.calculateIndex(actionId)
                        )
                    ),
                profiler,
                logger
            );
            round2ContributionStorage.updateRawLeaf(
                {
                    level1Index: Round2ContributionStorage.calculateLevel1Index(
                        {
                            committeeId: action.committeeId,
                            keyId: action.keyId,
                        }
                    ),
                    level2Index: Round2ContributionStorage.calculateLevel2Index(
                        action.memberId
                    ),
                },
                action.contribution
            );
            encryptionStorage.updateRawLeaf(
                {
                    level1Index: EncryptionStorage.calculateLevel1Index({
                        committeeId: action.committeeId,
                        keyId: action.keyId,
                    }),
                    level2Index: EncryptionStorage.calculateLevel2Index(
                        action.memberId
                    ),
                },
                {
                    contributions:
                        keys[Number(keyId)].round2Contributions || [],
                    memberId: action.memberId,
                }
            );
            round2ProcessStorage.updateRawLeaf(
                {
                    level1Index: ProcessStorage.calculateLevel1Index(actionId),
                },
                {
                    actionState: round2ZkApp.actionStates[i + 1],
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
                        committeeZkApp.key.publicKey
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
            profiler,
            logger
        );
        await fetchAccounts([
            dkgZkApp.key.publicKey,
            round2ZkApp.key.publicKey,
            rollupZkApp.key.publicKey,
        ]);
        let action = new DkgAction({
            committeeId,
            keyId,
            key: Group.zero,
            mask: DkgActionMask.createMask(
                Field(DkgActionEnum.FINALIZE_ROUND_2)
            ),
        });
        let actionId = Field(NUM_KEYS + 1);
        let rollupAction = new RollupAction({
            zkAppIndex: Field(ZkAppIndex.DKG),
            actionHash: action.hash(),
        });
        dkgZkApp.actionStates.push(dkgContract.account.actionState.get());
        dkgZkApp.actions.push(DkgAction.toFields(action));
        rollupZkApp.actionStates.push(rollupContract.account.actionState.get());
        rollupZkApp.actions.push(RollupAction.toFields(rollupAction));

        // Rollup dkg action
        rollupProof = await Utils.prove(Rollup.name, 'init', async () =>
            Rollup.init(
                RollupAction.empty(),
                rollupContract.counterRoot.get(),
                rollupContract.rollupRoot.get(),
                rollupContract.actionState.get()
            )
        );
        rollupProof = await Utils.prove(
            Rollup.name,
            'rollup',
            async () =>
                Rollup.rollup(
                    rollupAction,
                    rollupProof,
                    actionId,
                    rollupCounterStorage.getWitness(
                        RollupCounterStorage.calculateLevel1Index(
                            Field(ZkAppIndex.DKG)
                        )
                    ),
                    rollupStorage.getWitness(
                        RollupStorage.calculateLevel1Index({
                            zkAppIndex: Field(ZkAppIndex.DKG),
                            actionId,
                        })
                    )
                ),
            profiler,
            logger
        );
        rollupCounterStorage.updateRawLeaf(
            {
                level1Index: RollupCounterStorage.calculateLevel1Index(
                    Field(ZkAppIndex.DKG)
                ),
            },
            actionId.add(1)
        );
        rollupStorage.updateRawLeaf(
            {
                level1Index: RollupStorage.calculateLevel1Index({
                    zkAppIndex: Field(ZkAppIndex.DKG),
                    actionId,
                }),
            },
            rollupAction.actionHash
        );
        await Utils.proveAndSendTx(
            RollupContract.name,
            'rollup',
            async () => rollupContract.rollup(rollupProof),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([rollupZkApp.key.publicKey]);

        // Update dkg key
        let updateKeyProof = await Utils.prove(
            UpdateKey.name,
            'init',
            async () =>
                UpdateKey.init(
                    new UpdateKeyInput({
                        previousActionState: Field(0),
                        action: DkgAction.empty(),
                        actionId: Field(0),
                    }),
                    rollupContract.rollupRoot.get(),
                    dkgContract.keyCounterRoot.get(),
                    dkgContract.keyStatusRoot.get(),
                    dkgContract.keyRoot.get(),
                    dkgContract.processRoot.get()
                )
        );

        let input = new UpdateKeyInput({
            previousActionState: dkgZkApp.actionStates[Number(actionId)],
            action,
            actionId,
        });
        updateKeyProof = await Utils.prove(UpdateKey.name, 'update', async () =>
            UpdateKey.update(
                input,
                updateKeyProof,
                keyStatusStorage.getWitness(
                    KeyStatusStorage.calculateLevel1Index({
                        committeeId: action.committeeId,
                        keyId: action.keyId,
                    })
                ),
                keyStorage.getWitness(
                    KeyStatusStorage.calculateLevel1Index({
                        committeeId: action.committeeId,
                        keyId: action.keyId,
                    })
                ),
                rollupStorage.getWitness(
                    RollupStorage.calculateLevel1Index({
                        zkAppIndex: Field(ZkAppIndex.DKG),
                        actionId,
                    })
                ),
                dkgProcessStorage.getWitness(
                    ProcessStorage.calculateIndex(actionId)
                )
            )
        );
        keyStatusStorage.updateRawLeaf(
            {
                level1Index: KeyStatusStorage.calculateLevel1Index({
                    committeeId: action.committeeId,
                    keyId,
                }),
            },
            Provable.switch(action.mask.values, Field, [
                Field(KeyStatus.ROUND_1_CONTRIBUTION),
                Field(KeyStatus.ROUND_2_CONTRIBUTION),
                Field(KeyStatus.ACTIVE),
                Field(KeyStatus.DEPRECATED),
            ])
        );
        dkgProcessStorage.updateRawLeaf(
            {
                level1Index: ProcessStorage.calculateLevel1Index(actionId),
            },
            {
                actionState: dkgZkApp.actionStates[Number(actionId) + 1],
                processCounter: UInt8.from(0),
            }
        );

        await Utils.proveAndSendTx(
            DkgContract.name,
            'update',
            async () =>
                dkgContract.update(
                    updateKeyProof,
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.ROLLUP,
                        rollupContract.address
                    )
                ),
            feePayer,
            true,
            profiler,
            logger
        );
        await fetchAccounts([dkgZkApp.key.publicKey]);
    });

    afterAll(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (profiler) (profiler as any).store();
    });
});
