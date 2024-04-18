import fs from 'fs/promises';
import {
    Field,
    Cache,
    Group,
    Reducer,
    TokenId,
    Mina,
    AccountUpdate,
    Scalar,
    UInt64,
    PublicKey,
    UInt32,
} from 'o1js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { UpdateRequest, ComputeResult } from '../contracts/Request.js';
import { RequestContract } from '../contracts/Request.js';
import {
    MemberArray,
    Round1Contribution,
    Round2Contribution,
    SecretPolynomial,
    calculatePublicKeyFromContribution,
    generateRandomPolynomial,
    getRound1Contribution,
    getRound2Contribution,
} from '../libs/Committee.js';
import { AddressStorage } from '../storages/AddressStorage.js';
import { Key, Network } from './helper/config.js';
import { prepare } from './helper/prepare.js';
import {
    RollupCounterStorage,
    RollupStorage,
} from '../storages/RollupStorage.js';
import {
    KeyCounterStorage,
    MemberStorage,
    SettingStorage,
} from '../storages/CommitteeStorage.js';
import {
    EncryptionStorage,
    KeyStatusStorage,
    KeyStorage,
    PublicKeyStorage,
    ResponseStorage,
    Round1ContributionStorage,
    Round2ContributionStorage,
    calculateKeyIndex,
} from '../storages/DkgStorage.js';
import { ProcessStorage } from '../storages/ProcessStorage.js';
import { compile } from './helper/compile.js';
import { Rollup, RollupContract } from '../contracts/Rollup.js';
import {
    ComputeResponse,
    FinalizeResponse,
    ResponseContract,
} from '../contracts/Response.js';
import {
    RequesterAction,
    RequesterAddressBook,
    RequesterContract,
    SubmissionContract,
    TaskManagerContract,
    UpdateTask,
} from '../contracts/Requester.js';
import { CommitteeContract, UpdateCommittee } from '../contracts/Committee.js';
import { DkgContract, KeyStatus, UpdateKey } from '../contracts/DKG.js';
import { FinalizeRound1, Round1Contract } from '../contracts/Round1.js';
import { FinalizeRound2, Round2Contract } from '../contracts/Round2.js';
import { ZkAppIndex } from '../contracts/constants.js';
import { BatchDecryption, BatchEncryption } from '../contracts/Encryption.js';
import { fetchAccounts, waitUntil } from './helper/index.js';
import {
    CommitmentStorage,
    RequesterAccumulationStorage,
    RequesterKeyIndexStorage,
    TimestampStorage,
} from '../storages/RequesterStorage.js';
import {
    ExpirationStorage,
    RequestAccumulationStorage,
    RequestKeyIndexStorage,
    ResultStorage,
    TaskIdStorage,
} from '../storages/RequestStorage.js';
import { SecretVector } from '../libs/Requester.js';
import { Requester } from '../libs/index.js';

describe('Key usage', () => {
    const doProofs = false;
    const cache = Cache.FileSystem('./caches');
    const profiler = Utils.getProfiler('key-usage', fs);
    const logger: Utils.Logger = {
        info: true,
        error: true,
    };
    const TX_FEE = 0.1 * 10e9;
    let _: any;
    let users: Key[] = [];
    let rollupZkApp: Utils.ZkApp;
    let committeeZkApp: Utils.ZkApp;
    let dkgZkApp: Utils.ZkApp;
    let round1ZkApp: Utils.ZkApp;
    let round2ZkApp: Utils.ZkApp;
    let requestZkApp: Utils.ZkApp;
    let responseZkApp: Utils.ZkApp;
    let taskManagerZkApp: Utils.ZkApp;
    let submissionZkApp: Utils.ZkApp;
    let requesterZkApp: Utils.ZkApp;
    let committees: {
        members: MemberArray;
        threshold: Field;
        ipfsHash: IpfsHash;
    }[] = [];
    let keys: {
        committeeId: Field;
        keyId: Field;
        key?: Group;
        round1Contributions?: Round1Contribution[];
        round2Contributions?: Round2Contribution[];
    }[] = [];
    let committeeSecrets: SecretPolynomial[] = [];
    let committeeId = Field(0);
    let keyId = Field(0);
    let requests: {
        taskId: UInt32;
        keyIndex: Field;
        requester: PublicKey;
        requestId: Field;
        submissionTs: UInt64;
        expirationTs: UInt64;
        R: Group[][];
        M: Group[][];
        D: Group[][];
        sumR: Group[];
        sumM: Group[];
        sumD: Group[];
        result: { [key: number]: bigint };
    }[] = [];

    // Address storages
    let sharedAddressStorage = new AddressStorage();
    let requesterAddressStorage = new AddressStorage();

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

    // RequesterContract storage
    let requesterKeyIndexStorage = new RequesterKeyIndexStorage();
    let timestampStorage = new TimestampStorage();
    let requesterAccumulationStorage = new RequesterAccumulationStorage();
    let commitmentStorage = new CommitmentStorage();

    // RequestContract storage
    let requestKeyIndexStorage = new RequestKeyIndexStorage();
    let taskIdStorage = new TaskIdStorage();
    let requestAccumulationStorage = new RequestAccumulationStorage();
    let expirationStorage = new ExpirationStorage();
    let resultStorage = new ResultStorage();

    // Response storage
    let responseContributionStorage = new ResponseStorage();
    let responseProcessStorage = new ProcessStorage();

    beforeAll(async () => {
        // Prepare environment
        _ = await prepare(
            './caches',
            { type: Network.Local, doProofs },
            {
                aliases: [
                    'rollup',
                    'committee',
                    'dkg',
                    'round1',
                    'round2',
                    'request',
                    'requester',
                    'response',
                    'taskmanager',
                    'submission',
                ],
            }
        );
        users = [_.accounts[0], _.accounts[1], _.accounts[2]];

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
        keys = [
            {
                committeeId,
                keyId,
            },
        ];
    });

    it('Should compile all ZK programs', async () => {
        await compile(
            cache,
            [
                Rollup,
                UpdateRequest,
                ComputeResult,
                UpdateTask,
                ComputeResponse,
                FinalizeResponse,
            ],
            undefined,
            logger
        );

        if (doProofs)
            await compile(
                cache,
                [
                    UpdateCommittee,
                    UpdateKey,
                    BatchEncryption,
                    FinalizeRound1,
                    BatchDecryption,
                    FinalizeRound2,
                    RollupContract,
                    CommitteeContract,
                    DkgContract,
                    Round1Contract,
                    Round2Contract,
                    RequestContract,
                    RequesterContract,
                    ResponseContract,
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
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.REQUEST),
            accounts.request.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.RESPONSE),
            accounts.response.publicKey
        );
        requesterAddressStorage.updateAddress(
            Field(RequesterAddressBook.TASK_MANAGER),
            accounts.taskmanager.publicKey
        );
        requesterAddressStorage.updateAddress(
            Field(RequesterAddressBook.SUBMISSION),
            accounts.submission.publicKey
        );
        requesterAddressStorage.updateAddress(
            Field(RequesterAddressBook.DKG),
            accounts.dkg.publicKey
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

        // Calculate mock dkg trees
        let committee = committees[Number(committeeId)];
        let T = Number(committee.threshold);
        let N = Number(committee.members.length);
        keys[0].round1Contributions = [];
        keys[0].round2Contributions = [];
        for (let j = 0; j < N; j++) {
            let secret = generateRandomPolynomial(T, N);
            committeeSecrets.push(secret);
            let round1Contribution = getRound1Contribution(secret);
            keys[0].round1Contributions.push(round1Contribution);
            round1ContributionStorage.updateRawLeaf(
                {
                    level1Index: Round1ContributionStorage.calculateLevel1Index(
                        {
                            committeeId,
                            keyId,
                        }
                    ),
                    level2Index: Round1ContributionStorage.calculateLevel2Index(
                        Field(j)
                    ),
                },
                round1Contribution
            );
            publicKeyStorage.updateRawLeaf(
                {
                    level1Index: PublicKeyStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    }),
                    level2Index: PublicKeyStorage.calculateLevel2Index(
                        Field(j)
                    ),
                },
                secret.C[0]
            );
        }
        keys[0].key = calculatePublicKeyFromContribution(
            keys[0].round1Contributions
        );
        for (let j = 0; j < N; j++) {
            let round2Contribution = getRound2Contribution(
                committeeSecrets[j],
                j,
                keys[0].round1Contributions,
                [...Array(N)].map(() => Scalar.random())
            );
            keys[0].round2Contributions.push(round2Contribution);
            round2ContributionStorage.updateRawLeaf(
                {
                    level1Index: Round2ContributionStorage.calculateLevel1Index(
                        {
                            committeeId,
                            keyId,
                        }
                    ),
                    level2Index: Round2ContributionStorage.calculateLevel2Index(
                        Field(j)
                    ),
                },
                round2Contribution
            );
        }
        for (let j = 0; j < N; j++) {
            encryptionStorage.updateRawLeaf(
                {
                    level1Index: EncryptionStorage.calculateLevel1Index({
                        committeeId,
                        keyId,
                    }),
                    level2Index: EncryptionStorage.calculateLevel2Index(
                        Field(j)
                    ),
                },
                {
                    contributions: keys[0].round2Contributions,
                    memberId: Field(j),
                }
            );
        }
        keyStatusStorage.updateRawLeaf(
            {
                level1Index: KeyStatusStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
            },
            Field(KeyStatus.ACTIVE)
        );
        keyStorage.updateRawLeaf(
            {
                level1Index: KeyStatusStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
            },
            keys[0].key
        );

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
            {
                zkAppRoot: sharedAddressStorage.root,
                keyStatusRoot: keyCounterStorage.root,
                keyRoot: keyStorage.root,
            }
        );
        round1ZkApp = Utils.getZkApp(
            accounts.round1,
            new Round1Contract(accounts.round1.publicKey),
            Round1Contract.name,
            {
                zkAppRoot: sharedAddressStorage.root,
                contributionRoot: round1ContributionStorage.root,
                publicKeyRoot: publicKeyStorage.root,
            }
        );
        round2ZkApp = Utils.getZkApp(
            accounts.round2,
            new Round2Contract(accounts.round2.publicKey),
            Round2Contract.name,
            {
                zkAppRoot: sharedAddressStorage.root,
                contributionRoot: round2ContributionStorage.root,
                encryptionRoot: encryptionStorage.root,
            }
        );
        requestZkApp = Utils.getZkApp(
            accounts.request,
            new RequestContract(accounts.request.publicKey),
            RequestContract.name,
            { zkAppRoot: sharedAddressStorage.root }
        );
        responseZkApp = Utils.getZkApp(
            accounts.response,
            new ResponseContract(accounts.response.publicKey),
            ResponseContract.name,
            { zkAppRoot: sharedAddressStorage.root }
        );
        requesterZkApp = Utils.getZkApp(
            accounts.requester,
            new RequesterContract(accounts.requester.publicKey),
            RequesterContract.name,
            { zkAppRoot: requesterAddressStorage.root }
        );
        taskManagerZkApp = Utils.getZkApp(
            accounts.taskmanager,
            new TaskManagerContract(accounts.taskmanager.publicKey),
            TaskManagerContract.name,
            { requesterAddress: accounts.requester.publicKey }
        );
        submissionZkApp = Utils.getZkApp(
            accounts.submission,
            new SubmissionContract(accounts.submission.publicKey),
            SubmissionContract.name,
            { requesterAddress: accounts.requester.publicKey }
        );
        let rollupZkAppWithResponseToken = {
            ...rollupZkApp,
            contract: new RollupContract(
                accounts.rollup.publicKey,
                TokenId.derive(accounts.response.publicKey)
            ),
        };
        let requestZkAppWithRequesterToken = {
            ...requestZkApp,
            contract: new RequestContract(
                accounts.request.publicKey,
                TokenId.derive(accounts.requester.publicKey)
            ),
        };

        // Deploy contract accounts
        await Utils.deployZkApps(
            [
                rollupZkApp,
                committeeZkApp,
                dkgZkApp,
                round1ZkApp,
                round2ZkApp,
                requestZkApp,
                responseZkApp,
                requesterZkApp,
                taskManagerZkApp,
                submissionZkApp,
            ],
            feePayer,
            true,
            logger
        );

        // Deploy contract accounts with tokens
        await Utils.deployZkAppsWithToken(
            [
                {
                    owner: responseZkApp,
                    user: rollupZkAppWithResponseToken,
                },
                {
                    owner: requesterZkApp,
                    user: requestZkAppWithRequesterToken,
                },
            ],
            feePayer,
            true,
            logger
        );
    });

    /**
     * Test flow:
     * - Create task
     * - Update task
     * - Submit encryption vectors
     * - Accumulate submissions
     * - Wait until submission period ends
     * - Finalize task
     * - Update request
     * - Compute and submit response
     * - Finalize response contribution
     * - Update request
     */

    it('Should create an encryption task', async () => {
        const { feePayer } = _;
        const NUM_TASKS = 2;
        let keyIndex = calculateKeyIndex(committeeId, keyId);
        let requesterContract = requesterZkApp.contract as RequesterContract;
        let taskManagerContract =
            taskManagerZkApp.contract as TaskManagerContract;
        await fetchAccounts([
            requesterZkApp.key.publicKey,
            taskManagerZkApp.key.publicKey,
        ]);

        // Create task
        for (let i = 0; i < NUM_TASKS; i++) {
            let submissionTs = UInt64.from(Date.now() + 20 * 60 * 1000);
            await Utils.proveAndSendTx(
                TaskManagerContract.name,
                'createTask',
                async () =>
                    taskManagerContract.createTask(
                        keyIndex,
                        submissionTs,
                        requesterAddressStorage.getZkAppRef(
                            RequesterAddressBook.TASK_MANAGER,
                            taskManagerZkApp.key.publicKey
                        )
                    ),
                feePayer,
                true,
                undefined,
                logger
            );
            requests.push({
                taskId: UInt32.from(i),
                keyIndex: calculateKeyIndex(committeeId, keyId),
                requester: requesterZkApp.key.publicKey,
                requestId: Field(i),
                submissionTs,
                expirationTs: UInt64.from(0),
                R: [],
                M: [],
                D: [],
                sumR: [],
                sumM: [],
                sumD: [],
                result: {},
            });
            await fetchAccounts([
                requesterZkApp.key.publicKey,
                taskManagerZkApp.key.publicKey,
            ]);
            let actions = await Utils.fetchActions(
                requesterZkApp.key.publicKey
            );
            let action = RequesterAction.fromFields(
                actions[actions.length - 1].actions[0].map((e) => Field(e))
            );
            requesterZkApp.actionStates.push(
                requesterContract.account.actionState.get()
            );
            requestZkApp.actions.push(RequesterAction.toFields(action));
        }

        // Update task
        let updateTaskProof = await Utils.prove(
            UpdateTask.name,
            'init',
            async () =>
                UpdateTask.init(
                    RequesterAction.empty(),
                    UInt32.from(0),
                    requesterContract.actionState.get(),
                    requesterContract.keyIndexRoot.get(),
                    requesterContract.timestampRoot.get(),
                    requesterContract.accumulationRoot.get(),
                    requesterContract.commitmentCounter.get(),
                    requesterContract.commitmentRoot.get()
                ),
            undefined,
            logger
        );
        for (let i = 0; i < NUM_TASKS; i++) {
            let action = RequesterAction.fromFields(requestZkApp.actions[i]);
            let level1Index = RequesterKeyIndexStorage.calculateLevel1Index(
                action.taskId.value
            );
            updateTaskProof = await Utils.prove(
                UpdateTask.name,
                'create',
                async () =>
                    UpdateTask.create(
                        action,
                        updateTaskProof,
                        requesterKeyIndexStorage.getWitness(level1Index),
                        timestampStorage.getWitness(level1Index)
                    ),
                undefined,
                logger
            );
            requesterKeyIndexStorage.updateRawLeaf(
                {
                    level1Index,
                },
                action.keyIndex
            );
            timestampStorage.updateRawLeaf({ level1Index }, action.timestamp);
        }
        await Utils.proveAndSendTx(
            RequesterContract.name,
            'updateTasks',
            async () => requesterContract.updateTasks(updateTaskProof),
            feePayer,
            true,
            undefined,
            logger
        );
        await fetchAccounts([requesterZkApp.key.publicKey]);
    });

    it('Should submit and accumulate encryption vectors', async () => {
        const { feePayer } = _;
        const submissions = [
            { 0: 1000n, 3: 2000n, 15: 6000n },
            { 0: 5000n, 45: 6000n },
            { 3: 4000n },
        ];
        let request = requests[0];
        let publicKey = keys[0].key || Group.zero;
        let requesterContract = requesterZkApp.contract as RequesterContract;
        let submissionContract = submissionZkApp.contract as SubmissionContract;
        await fetchAccounts([
            requesterZkApp.key.publicKey,
            submissionZkApp.key.publicKey,
        ]);

        // Submit encryptions
        for (let i = 0; i < submissions.length; i++) {
            let encryption = Requester.generateEncryption(
                Number(request.taskId),
                publicKey,
                submissions[i]
            );
            await Utils.proveAndSendTx(
                SubmissionContract.name,
                'submitEncryption',
                async () =>
                    submissionContract.submitEncryption(
                        request.taskId,
                        request.keyIndex,
                        encryption.secrets,
                        encryption.randoms,
                        encryption.packedIndices,
                        encryption.nullifiers,
                        publicKey,
                        keyStorage.getWitness(
                            KeyStorage.calculateLevel1Index({
                                committeeId,
                                keyId,
                            })
                        ),
                        requesterKeyIndexStorage.getWitness(
                            RequesterKeyIndexStorage.calculateLevel1Index(
                                request.taskId.value
                            )
                        ),
                        requesterAddressStorage.getZkAppRef(
                            RequesterAddressBook.SUBMISSION,
                            submissionZkApp.key.publicKey
                        ),
                        requesterAddressStorage.getZkAppRef(
                            RequesterAddressBook.DKG,
                            dkgZkApp.key.publicKey
                        )
                    ),
                feePayer,
                true,
                undefined,
                logger
            );
            await fetchAccounts([
                requesterZkApp.key.publicKey,
                submissionZkApp.key.publicKey,
            ]);
        }

        // Wait until the submission period ends
        await waitUntil(Number(request.submissionTs));
    });

    // it('Create proof for requestInput1 and rollup', async () => {
    //     console.log('Create UpdateRequest.init requestInput1...');
    //     ActionRequestProfiler.start('UpdateRequest.init');
    //     proof = await UpdateRequest.init(
    //         requestContract.actionState.get(),
    //         requestStatusMap.getRoot(),
    //         requesterMap.getRoot()
    //     );
    //     ActionRequestProfiler.stop().store();
    //     expect(proof.publicOutput.initialActionState).toEqual(
    //         requestContract.actionState.get()
    //     );

    //     console.log('Create UpdateRequest.nextStep requestInput1...');
    //     ActionRequestProfiler.start('UpdateRequest.nextStep');
    //     proof = await UpdateRequest.nextStep(
    //         proof,
    //         action1,
    //         requestStatusMap.getWitness(input1.requestId()),
    //         requesterMap.getWitness(input1.requestId()),
    //         addresses.requester1
    //     );
    //     ActionRequestProfiler.stop().store();

    //     let tx = await Mina.transaction(feePayer, async () => {
    //         requestContract.rollupRequest(proof);
    //     });
    //     await tx.prove();
    //     await tx.sign([feePayerKey]).send();

    //     ////// update local state:
    //     requesterMap.set(
    //         input1.requestId(),
    //         Poseidon.hash(PublicKey.toFields(addresses.requester1))
    //     );
    //     // turn to request state
    //     requestStatusMap.set(
    //         input1.requestId(),
    //         Field(RequestStatusEnum.REQUESTING)
    //     );
    // });

    // it('Respone contract send requestInput2', async () => {
    //     console.log(
    //         'Contract actionState last: ',
    //         requestContract.actionState.get()
    //     );
    //     console.log('Contract action before responsee: ');
    //     await Mina.fetchActions(addresses.request).then((actions) => {
    //         Provable.log(actions);
    //         if (Array.isArray(actions)) {
    //             for (let action of actions) {
    //                 Provable.log(
    //                     'requestAction: ',
    //                     RequestAction.fromFields(
    //                         action.actions[0].map((e) => Field(e))
    //                     )
    //                 );
    //             }
    //         }
    //     });
    //     console.log('Respone contract send requestInput2');
    //     let balanceBefore = Number(Account(addresses.response).balance.get());
    //     let tx = await Mina.transaction(feePayer, async () => {
    //         responseContract.resolve(addresses.request, input2);
    //     });
    //     await tx.prove();
    //     await tx.sign([feePayerKey]).send();
    //     let balanceAfter = Number(Account(addresses.response).balance.get());
    //     expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // resolved earn fee
    // });

    // it('Create proof for requestInput2 and rollup', async () => {
    //     console.log('Create proof for requestInput2 and rollup');
    //     proof = await UpdateRequest.init(
    //         requestContract.actionState.get(),
    //         requestStatusMap.getRoot(),
    //         requesterMap.getRoot()
    //     );

    //     Provable.log(
    //         'proof.publicOutput.finalActionState: ',
    //         proof.publicOutput.finalActionState
    //     );

    //     console.log('Create UpdateRequest.nextStep requestInput2...');
    //     proof = await UpdateRequest.nextStep(
    //         proof,
    //         action2,
    //         requestStatusMap.getWitness(input2.requestId),
    //         requesterMap.getWitness(input2.requestId),
    //         addresses.requester1
    //     );

    //     ////// update local state:
    //     // requesterMap doesnt change
    //     // update request status state
    //     requestStatusMap.set(input2.requestId, action2.hashD());

    //     let balanceBefore = Number(Account(addresses.response).balance.get());
    //     // rollUp
    //     console.log('Rollup requestInput2...');
    //     let tx = await Mina.transaction(feePayer, async () => {
    //         requestContract.rollupRequest(proof);
    //     });
    //     await tx.prove();
    //     await tx.sign([feePayerKey]).send();
    //     let balanceAfter = Number(Account(addresses.response).balance.get());
    //     expect(balanceAfter - balanceBefore).toEqual(Number(0));
    // });
});
