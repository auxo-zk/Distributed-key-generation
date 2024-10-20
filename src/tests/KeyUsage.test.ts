// /* eslint-disable @typescript-eslint/no-non-null-assertion */
// import axios from 'axios';
// import fs from 'fs';
// import {
//     Field,
//     Cache,
//     Group,
//     TokenId,
//     Scalar,
//     UInt64,
//     PublicKey,
//     UInt32,
//     UInt8,
//     Provable,
// } from 'o1js';
// import { CustomScalar, IpfsHash, Utils } from '@auxo-dev/auxo-libs';
// import {
//     RollupRequest,
//     ComputeResult,
//     RequestAction,
//     ComputeResultInput,
// } from '../contracts/Request.js';
// import { RequestContract } from '../contracts/Request.js';
// import {
//     MemberArray,
//     ResponseContribution,
//     Round1Contribution,
//     Round2Contribution,
//     Round2Data,
//     SecretPolynomial,
//     MemberGroupArray,
//     accumulateResponses,
//     MemberFieldArray,
//     calculatePublicKeyFromContribution,
//     generateRandomPolynomial,
//     getResponseContribution,
//     getRound1Contribution,
//     getRound2Contribution,
// } from '../libs/Committee.js';
// import { AddressStorage } from '../storages/AddressStorage.js';
// import { Key, Network } from './helper/config.js';
// import { prepare } from './helper/prepare.js';
// import {
//     RollupCounterStorage,
//     RollupStorage,
// } from '../storages/RollupStorage.js';
// import {
//     KeyCounterStorage,
//     MemberStorage,
//     SettingStorage,
// } from '../storages/CommitteeStorage.js';
// import {
//     DKG_LEVEL_2_TREE,
//     EncryptionStorage,
//     KeyStatusStorage,
//     KeyStorage,
//     PublicKeyStorage,
//     ResponseContributionStorage,
//     ResponseStorage,
//     Round1ContributionStorage,
//     Round2ContributionStorage,
//     calculateKeyIndex,
// } from '../storages/KeyStorage.js';
// import { ProcessStorage } from '../storages/ProcessStorage.js';
// import { compile } from './helper/compile.js';
// import { Rollup, RollupAction, RollupContract } from '../contracts/Rollup.js';
// import {
//     ComputeResponse,
//     FinalizeResponse,
//     FinalizeResponseInput,
//     ResponseAction,
//     ResponseContract,
// } from '../contracts/Response.js';
// import {
//     RequesterAction,
//     RequesterAddressBook,
//     RequesterContract,
//     SubmissionContract,
//     TaskManagerContract,
//     RollupTask,
// } from '../contracts/Requester.js';
// import { CommitteeContract, RollupCommittee } from '../contracts/Committee.js';
// import { KeyContract, KeyStatus, RollupKey } from '../contracts/DKG.js';
// import { RollupContribution, Round1Contract } from '../contracts/Round1.js';
// import { FinalizeRound2, Round2Contract } from '../contracts/Round2.js';
// import { ZkAppIndex } from '../contracts/constants.js';
// import {
//     BatchDecryption,
//     BatchDecryptionInput,
//     BatchEncryption,
//     PlainArray,
// } from '../contracts/Encryption.js';
// import { fetchAccounts, waitUntil } from './helper/index.js';
// import {
//     CommitmentStorage,
//     CommitmentWitnesses,
//     RequesterAccumulationStorage,
//     RequesterCounters,
//     RequesterKeyIndexStorage,
//     TimestampStorage,
// } from '../storages/RequesterStorage.js';
// import {
//     ExpirationStorage,
//     GroupVector,
//     GroupVectorStorage,
//     GroupVectorWitnesses,
//     REQUEST_LEVEL_2_TREE,
//     RequestAccumulationStorage,
//     RequestKeyIndexStorage,
//     ResultStorage,
//     ScalarVectorStorage,
//     TaskStorage,
// } from '../storages/RequestStorage.js';
// import {
//     NullifierArray,
//     RandomVector,
//     SecretNote,
//     SecretVector,
//     bruteForceResultVector,
//     getResultVector,
// } from '../libs/Requester.js';
// import { Requester } from '../libs/index.js';
// import { ENC_LIMITS, SECRET_UNIT } from '../constants.js';

// describe('Key usage', () => {
//     const doProofs = true;
//     const cache = Cache.FileSystem('./caches');
//     const profiler = Utils.getProfiler('key-usage', fs.promises);
//     const logger: Utils.Logger = {
//         info: true,
//         error: true,
//         memoryUsage: false,
//     };
//     // eslint-disable-next-line @typescript-eslint/no-explicit-any
//     let _: any;
//     let users: Key[] = [];
//     let rollupZkApp: Utils.ZkApp;
//     let committeeZkApp: Utils.ZkApp;
//     let dkgZkApp: Utils.ZkApp;
//     let round1ZkApp: Utils.ZkApp;
//     let round2ZkApp: Utils.ZkApp;
//     let requestZkApp: Utils.ZkApp;
//     let responseZkApp: Utils.ZkApp;
//     let taskManagerZkApp: Utils.ZkApp;
//     let submissionZkApp: Utils.ZkApp;
//     let requesterZkApp: Utils.ZkApp;
//     let mockSecret: any;
//     let dkgDeployed = true;
//     let committees: {
//         members: MemberArray;
//         threshold: Field;
//         ipfsHash: IpfsHash;
//     }[] = [];
//     let keys: {
//         committeeId: Field;
//         keyId: Field;
//         key?: Group;
//         round1Contributions?: Round1Contribution[];
//         round2Contributions?: Round2Contribution[];
//     }[] = [];
//     let committeeSecrets: SecretPolynomial[] = [];
//     let committeeId = Field(0);
//     let keyId = Field(0);
//     const NUM_TASKS = 1;
//     const SUBMISSION_PERIOD = 1.5 * 60 * 1000; //ms

//     let requests: {
//         taskId: UInt32;
//         keyIndex: Field;
//         requester: PublicKey;
//         requestId: Field;
//         submissionTs: UInt64;
//         expirationTs: UInt64;
//         R: Group[][];
//         M: Group[][];
//         D: Group[][];
//         sumR: Group[];
//         sumM: Group[];
//         sumD: Group[];
//         accumulationRootR?: Field;
//         accumulationRootM?: Field;
//         accumulationRootD?: Field;
//         result: { [key: number]: bigint };
//         encryptions: {
//             indices: number[];
//             packedIndices: Field;
//             secrets: SecretVector;
//             randoms: RandomVector;
//             nullifiers: NullifierArray;
//             R: Group[];
//             M: Group[];
//             notes: SecretNote[];
//         }[];
//         contributions: ResponseContribution[];
//     }[] = [];

//     // Address storages
//     let sharedAddressStorage = new AddressStorage();
//     let requesterAddressStorage = new AddressStorage();

//     // RollupContract storage
//     let rollupStorage = new RollupStorage();
//     let rollupCounterStorage = new RollupCounterStorage();

//     // CommitteeContract storage
//     let memberStorage = new MemberStorage();
//     let settingStorage = new SettingStorage();

//     // KeyContract storage
//     let keyStatusStorage = new KeyStatusStorage();
//     let keyStorage = new KeyStorage();

//     // Round1Contract storage
//     let round1ContributionStorage = new Round1ContributionStorage();
//     let publicKeyStorage = new PublicKeyStorage();

//     // Round2Contract storage
//     let round2ContributionStorage = new Round2ContributionStorage();
//     let encryptionStorage = new EncryptionStorage();

//     // RequesterContract storage
//     let requesterKeyIndexStorage = new RequesterKeyIndexStorage();
//     let timestampStorage = new TimestampStorage();
//     let requesterAccumulationStorage = new RequesterAccumulationStorage();
//     let commitmentStorage = new CommitmentStorage();

//     // RequestContract storage
//     let requestKeyIndexStorage = new RequestKeyIndexStorage();
//     let taskStorage = new TaskStorage();
//     let requestAccumulationStorage = new RequestAccumulationStorage();
//     let expirationStorage = new ExpirationStorage();
//     let resultStorage = new ResultStorage();

//     // Response storage
//     let responseContributionStorage = new ResponseContributionStorage();
//     let responseStorage = new ResponseStorage();
//     let responseProcessStorage = new ProcessStorage();

//     beforeAll(async () => {
//         // Prepare environment
//         _ = await prepare(
//             './caches',
//             { type: Network.Lightnet, doProofs },
//             {
//                 aliases: [
//                     'rollup',
//                     'committee',
//                     'dkg',
//                     'round1',
//                     'round2',
//                     'request',
//                     'requester',
//                     'response',
//                     'taskmanager',
//                     'submission',
//                 ],
//             }
//         );
//         users = [_.accounts[0], _.accounts[1], _.accounts[2]];

//         // Prepare data for test cases
//         committees = [
//             {
//                 members: new MemberArray([
//                     users[0].publicKey,
//                     users[1].publicKey,
//                 ]),
//                 threshold: Field(1),
//                 ipfsHash: IpfsHash.fromString(
//                     'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
//                 ),
//             },
//             {
//                 members: new MemberArray([
//                     users[0].publicKey,
//                     users[1].publicKey,
//                     users[2].publicKey,
//                 ]),
//                 threshold: Field(3),
//                 ipfsHash: IpfsHash.fromString(
//                     'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
//                 ),
//             },
//         ];
//         keys = [
//             {
//                 committeeId,
//                 keyId,
//             },
//         ];
//     });

//     it('Should compile all ZK programs', async () => {
//         await compile(
//             cache,
//             [
//                 Rollup,
//                 RollupRequest,
//                 ComputeResult,
//                 RollupTask,
//                 ComputeResponse,
//                 BatchDecryption,
//                 FinalizeResponse,
//             ],
//             undefined,
//             logger
//         );

//         if (doProofs)
//             await compile(
//                 cache,
//                 [
//                     RollupCommittee,
//                     RollupKey,
//                     RollupContribution,
//                     BatchEncryption,
//                     FinalizeRound2,
//                     RollupContract,
//                     CommitteeContract,
//                     KeyContract,
//                     Round1Contract,
//                     Round2Contract,
//                     RequestContract,
//                     RequesterContract,
//                     ResponseContract,
//                     TaskManagerContract,
//                     SubmissionContract,
//                 ],
//                 undefined,
//                 logger
//             );
//     });

//     it('Should deploy contracts successfully', async () => {
//         const { accounts, feePayer } = _;

//         // Construct address books
//         sharedAddressStorage.updateAddress(
//             Field(ZkAppIndex.ROLLUP),
//             accounts.rollup.publicKey
//         );
//         sharedAddressStorage.updateAddress(
//             Field(ZkAppIndex.COMMITTEE),
//             accounts.committee.publicKey
//         );
//         sharedAddressStorage.updateAddress(
//             Field(ZkAppIndex.KEY),
//             accounts.dkg.publicKey
//         );
//         sharedAddressStorage.updateAddress(
//             Field(ZkAppIndex.ROUND1),
//             accounts.round1.publicKey
//         );
//         sharedAddressStorage.updateAddress(
//             Field(ZkAppIndex.ROUND2),
//             accounts.round2.publicKey
//         );
//         sharedAddressStorage.updateAddress(
//             Field(ZkAppIndex.REQUEST),
//             accounts.request.publicKey
//         );
//         sharedAddressStorage.updateAddress(
//             Field(ZkAppIndex.RESPONSE),
//             accounts.response.publicKey
//         );
//         requesterAddressStorage.updateAddress(
//             Field(RequesterAddressBook.TASK_MANAGER),
//             accounts.taskmanager.publicKey
//         );
//         requesterAddressStorage.updateAddress(
//             Field(RequesterAddressBook.SUBMISSION),
//             accounts.submission.publicKey
//         );
//         requesterAddressStorage.updateAddress(
//             Field(RequesterAddressBook.DKG),
//             accounts.dkg.publicKey
//         );
//         requesterAddressStorage.updateAddress(
//             Field(RequesterAddressBook.REQUEST),
//             accounts.request.publicKey
//         );

//         // Rollup tree
//         if (dkgDeployed) {
//             const [rollupCounterLeafs, rollupLeafs] = await Promise.all([
//                 (
//                     await axios.get(
//                         'https://api.auxo.fund/v0/storages/rollup/counter/leafs'
//                     )
//                 ).data,
//                 (
//                     await axios.get(
//                         'https://api.auxo.fund/v0/storages/rollup/rollup/leafs'
//                     )
//                 ).data,
//             ]);
//             Object.entries(rollupCounterLeafs).map(
//                 ([index, data]: [string, any]) => {
//                     if (data.leaf !== '0')
//                         rollupCounterStorage.updateLeaf(
//                             { level1Index: Field.from(index) },
//                             Field.from(data.leaf)
//                         );
//                 }
//             );
//             Object.entries(rollupLeafs).map(([index, data]: [string, any]) => {
//                 rollupStorage.updateLeaf(
//                     { level1Index: Field.from(index) },
//                     Field.from(data.leaf)
//                 );
//             });
//         }

//         // Calculate mock committee trees
//         for (let i = 0; i < committees.length; i++) {
//             let committee = committees[i];
//             for (let j = 0; j < Number(committee.members.length); j++)
//                 memberStorage.updateRawLeaf(
//                     {
//                         level1Index: Field(i),
//                         level2Index: Field(j),
//                     },
//                     committee.members.get(Field(j))
//                 );

//             settingStorage.updateRawLeaf(
//                 { level1Index: Field(i) },
//                 {
//                     T: committees[i].threshold,
//                     N: Field(committee.members.length),
//                 }
//             );
//         }

//         // Calculate mock dkg trees
//         let committee = committees[Number(committeeId)];
//         let T = Number(committee.threshold);
//         let N = Number(committee.members.length);
//         keys[0].round1Contributions = [];
//         keys[0].round2Contributions = [];
//         let filename = `mock/secrets-${T}-${N}.json`;
//         let isMockSecretsUsed = fs.existsSync(filename);
//         if (isMockSecretsUsed) {
//             mockSecret = JSON.parse(fs.readFileSync(filename, 'utf8'));
//         }
//         for (let j = 0; j < N; j++) {
//             let secret = isMockSecretsUsed
//                 ? {
//                       a: mockSecret.secrets[j].a.map((e: any) =>
//                           Scalar.from(e)
//                       ),
//                       C: mockSecret.secrets[j].C.map(
//                           (e: any) => new Group({ x: e.x, y: e.y })
//                       ),
//                       f: mockSecret.secrets[j].f.map((e: any) =>
//                           Scalar.from(e)
//                       ),
//                   }
//                 : generateRandomPolynomial(T, N);
//             committeeSecrets.push(secret);
//             let round1Contribution = getRound1Contribution(secret);
//             Provable.log(
//                 `Member ${j} round 1 contribution`,
//                 round1Contribution.C
//             );
//             keys[0].round1Contributions.push(round1Contribution);
//             round1ContributionStorage.updateRawLeaf(
//                 {
//                     level1Index: Round1ContributionStorage.calculateLevel1Index(
//                         {
//                             committeeId,
//                             keyId,
//                         }
//                     ),
//                     level2Index: Round1ContributionStorage.calculateLevel2Index(
//                         Field(j)
//                     ),
//                 },
//                 round1Contribution
//             );
//             publicKeyStorage.updateRawLeaf(
//                 {
//                     level1Index: PublicKeyStorage.calculateLevel1Index({
//                         committeeId,
//                         keyId,
//                     }),
//                     level2Index: PublicKeyStorage.calculateLevel2Index(
//                         Field(j)
//                     ),
//                 },
//                 secret.C[0]
//             );
//         }
//         keys[0].key = calculatePublicKeyFromContribution(
//             keys[0].round1Contributions
//         );
//         for (let j = 0; j < N; j++) {
//             let randoms = isMockSecretsUsed
//                 ? mockSecret.randoms[j]
//                 : [...Array(N)].map(() => Scalar.random());
//             let round2Contribution = getRound2Contribution(
//                 committeeSecrets[j],
//                 j,
//                 keys[0].round1Contributions,
//                 randoms.map((e: string) => Scalar.from(e))
//             );
//             Provable.log(`Member ${j} round 2 contribution:`);
//             Provable.log(round2Contribution.c);
//             Provable.log(round2Contribution.U);
//             keys[0].round2Contributions.push(round2Contribution);
//             round2ContributionStorage.updateRawLeaf(
//                 {
//                     level1Index: Round2ContributionStorage.calculateLevel1Index(
//                         {
//                             committeeId,
//                             keyId,
//                         }
//                     ),
//                     level2Index: Round2ContributionStorage.calculateLevel2Index(
//                         Field(j)
//                     ),
//                 },
//                 round2Contribution
//             );
//         }
//         for (let j = 0; j < N; j++) {
//             encryptionStorage.updateRawLeaf(
//                 {
//                     level1Index: EncryptionStorage.calculateLevel1Index({
//                         committeeId,
//                         keyId,
//                     }),
//                     level2Index: EncryptionStorage.calculateLevel2Index(
//                         Field(j)
//                     ),
//                 },
//                 {
//                     contributions: keys[0].round2Contributions,
//                     memberId: Field(j),
//                 }
//             );
//         }
//         keyStatusStorage.updateRawLeaf(
//             {
//                 level1Index: KeyStatusStorage.calculateLevel1Index({
//                     committeeId,
//                     keyId,
//                 }),
//             },
//             Field(KeyStatus.ACTIVE)
//         );
//         keyStorage.updateRawLeaf(
//             {
//                 level1Index: KeyStorage.calculateLevel1Index({
//                     committeeId,
//                     keyId,
//                 }),
//             },
//             keys[0].key
//         );

//         // Prepare zkApps
//         rollupZkApp = Utils.getZkApp(
//             accounts.rollup,
//             new RollupContract(accounts.rollup.publicKey),
//             {
//                 name: RollupContract.name,
//                 initArgs: { zkAppRoot: sharedAddressStorage.root },
//             }
//         );
//         committeeZkApp = Utils.getZkApp(
//             accounts.committee,
//             new CommitteeContract(accounts.committee.publicKey),
//             {
//                 name: CommitteeContract.name,
//                 initArgs: {
//                     zkAppRoot: sharedAddressStorage.root,
//                     memberRoot: memberStorage.root,
//                     settingRoot: settingStorage.root,
//                 },
//             }
//         );
//         dkgZkApp = Utils.getZkApp(
//             accounts.dkg,
//             new KeyContract(accounts.dkg.publicKey),
//             {
//                 name: KeyContract.name,
//                 initArgs: {
//                     zkAppRoot: sharedAddressStorage.root,
//                     keyStatusRoot: keyStatusStorage.root,
//                     keyRoot: keyStorage.root,
//                 },
//             }
//         );
//         round1ZkApp = Utils.getZkApp(
//             accounts.round1,
//             new Round1Contract(accounts.round1.publicKey),
//             {
//                 name: Round1Contract.name,
//                 initArgs: {
//                     zkAppRoot: sharedAddressStorage.root,
//                     contributionRoot: round1ContributionStorage.root,
//                     publicKeyRoot: publicKeyStorage.root,
//                 },
//             }
//         );
//         round2ZkApp = Utils.getZkApp(
//             accounts.round2,
//             new Round2Contract(accounts.round2.publicKey),
//             {
//                 name: Round2Contract.name,
//                 initArgs: {
//                     zkAppRoot: sharedAddressStorage.root,
//                     contributionRoot: round2ContributionStorage.root,
//                     encryptionRoot: encryptionStorage.root,
//                 },
//             }
//         );
//         requestZkApp = Utils.getZkApp(
//             accounts.request,
//             new RequestContract(accounts.request.publicKey),
//             {
//                 name: RequestContract.name,
//                 initArgs: { zkAppRoot: sharedAddressStorage.root },
//             }
//         );
//         responseZkApp = Utils.getZkApp(
//             accounts.response,
//             new ResponseContract(accounts.response.publicKey),
//             {
//                 name: ResponseContract.name,
//                 initArgs: { zkAppRoot: sharedAddressStorage.root },
//             }
//         );
//         requesterZkApp = Utils.getZkApp(
//             accounts.requester,
//             new RequesterContract(accounts.requester.publicKey),
//             {
//                 name: RequesterContract.name,
//                 initArgs: { zkAppRoot: requesterAddressStorage.root },
//             }
//         );
//         taskManagerZkApp = Utils.getZkApp(
//             accounts.taskmanager,
//             new TaskManagerContract(accounts.taskmanager.publicKey),
//             {
//                 name: TaskManagerContract.name,
//                 initArgs: { requesterAddress: accounts.requester.publicKey },
//             }
//         );
//         submissionZkApp = Utils.getZkApp(
//             accounts.submission,
//             new SubmissionContract(accounts.submission.publicKey),
//             {
//                 name: SubmissionContract.name,
//                 initArgs: { requesterAddress: accounts.requester.publicKey },
//             }
//         );
//         let rollupZkAppWithResponseToken = {
//             ...rollupZkApp,
//             contract: new RollupContract(
//                 accounts.rollup.publicKey,
//                 TokenId.derive(accounts.response.publicKey)
//             ),
//         };
//         let requestZkAppWithRequesterToken = {
//             ...requestZkApp,
//             contract: new RequestContract(
//                 accounts.request.publicKey,
//                 TokenId.derive(accounts.requester.publicKey)
//             ),
//         };
//         let requesterWithTaskManagerToken = {
//             ...requesterZkApp,
//             contract: new RequesterContract(
//                 accounts.requester.publicKey,
//                 TokenId.derive(accounts.taskmanager.publicKey)
//             ),
//         };
//         let requesterWithSubmissionToken = {
//             ...requesterZkApp,
//             contract: new RequesterContract(
//                 accounts.requester.publicKey,
//                 TokenId.derive(accounts.submission.publicKey)
//             ),
//         };

//         // Deploy contract accounts
//         if (dkgDeployed) {
//             await fetchAccounts([
//                 rollupZkApp.key.publicKey,
//                 committeeZkApp.key.publicKey,
//                 dkgZkApp.key.publicKey,
//                 round1ZkApp.key.publicKey,
//                 round2ZkApp.key.publicKey,
//             ]);
//             await Utils.deployZkApps(
//                 [
//                     requestZkApp,
//                     responseZkApp,
//                     requesterZkApp,
//                     taskManagerZkApp,
//                     submissionZkApp,
//                 ],
//                 feePayer,
//                 true,
//                 { logger }
//             );
//         } else {
//             await Utils.deployZkApps(
//                 [
//                     rollupZkApp,
//                     committeeZkApp,
//                     dkgZkApp,
//                     round1ZkApp,
//                     round2ZkApp,
//                     requestZkApp,
//                     responseZkApp,
//                     requesterZkApp,
//                     taskManagerZkApp,
//                     submissionZkApp,
//                 ],
//                 feePayer,
//                 true,
//                 { logger }
//             );
//         }

//         // Deploy contract accounts with tokens
//         await Utils.deployZkAppsWithToken(
//             [
//                 {
//                     owner: responseZkApp,
//                     user: rollupZkAppWithResponseToken,
//                 },
//                 {
//                     owner: requesterZkApp,
//                     user: requestZkAppWithRequesterToken,
//                 },
//                 {
//                     owner: taskManagerZkApp,
//                     user: requesterWithTaskManagerToken,
//                 },
//                 {
//                     owner: submissionZkApp,
//                     user: requesterWithSubmissionToken,
//                 },
//             ],
//             feePayer,
//             true,
//             { logger }
//         );
//     });

//     it('Should create an encryption task', async () => {
//         const { feePayer } = _;
//         let keyIndex = calculateKeyIndex(committeeId, keyId);
//         let requesterContract = requesterZkApp.contract as RequesterContract;
//         let taskManagerContract =
//             taskManagerZkApp.contract as TaskManagerContract;
//         await fetchAccounts([
//             requesterZkApp.key.publicKey,
//             taskManagerZkApp.key.publicKey,
//         ]);

//         // Create task
//         for (let i = 0; i < NUM_TASKS; i++) {
//             let submissionTs = UInt64.from(Date.now() + SUBMISSION_PERIOD);
//             await Utils.proveAndSendTx(
//                 TaskManagerContract.name,
//                 'createTask',
//                 async () =>
//                     taskManagerContract.createTask(
//                         keyIndex,
//                         submissionTs,
//                         requesterAddressStorage.getZkAppRef(
//                             RequesterAddressBook.TASK_MANAGER,
//                             taskManagerZkApp.key.publicKey
//                         )
//                     ),
//                 feePayer,
//                 true,
//                 { logger }
//             );
//             requests.push({
//                 taskId: UInt32.from(i),
//                 keyIndex: calculateKeyIndex(committeeId, keyId),
//                 requester: requesterZkApp.key.publicKey,
//                 requestId: Field(i),
//                 submissionTs,
//                 expirationTs: UInt64.from(0),
//                 R: [],
//                 M: [],
//                 D: [],
//                 sumR: new Array<Group>(ENC_LIMITS.FULL_DIMENSION).fill(
//                     Group.zero
//                 ),
//                 sumM: new Array<Group>(ENC_LIMITS.FULL_DIMENSION).fill(
//                     Group.zero
//                 ),
//                 sumD: new Array<Group>(ENC_LIMITS.FULL_DIMENSION).fill(
//                     Group.zero
//                 ),
//                 result: {},
//                 encryptions: [],
//                 contributions: [],
//             });
//             await fetchAccounts([
//                 requesterZkApp.key.publicKey,
//                 taskManagerZkApp.key.publicKey,
//             ]);
//             let actions = await Utils.fetchActions(
//                 requesterZkApp.key.publicKey
//             );
//             let action = RequesterAction.fromFields(
//                 actions[i].actions[0].map((e) => Field(e))
//             );
//             requesterZkApp.actionStates.push(
//                 requesterContract.account.actionState.get()
//             );
//             requesterZkApp.actions.push(RequesterAction.toFields(action));
//         }

//         // Update task
//         let requesterCounters = RequesterCounters.fromFields([
//             requesterContract.counters.get(),
//         ]);
//         let updateTaskProof = await Utils.prove(
//             RollupTask.name,
//             'init',
//             async () =>
//                 RollupTask.init(
//                     RequesterAction.empty(),
//                     requesterContract.actionState.get(),
//                     requesterCounters.taskCounter,
//                     requesterContract.keyIndexRoot.get(),
//                     requesterContract.timestampRoot.get(),
//                     requesterContract.accumulationRoot.get(),
//                     requesterCounters.commitmentCounter,
//                     requesterContract.commitmentRoot.get()
//                 ),
//             { logger }
//         );
//         for (let i = 0; i < NUM_TASKS; i++) {
//             let action = RequesterAction.fromFields(requesterZkApp.actions[i]);
//             let level1Index = RequesterKeyIndexStorage.calculateLevel1Index(
//                 UInt32.from(i).value
//             );
//             updateTaskProof = await Utils.prove(
//                 RollupTask.name,
//                 'create',
//                 async () =>
//                     RollupTask.create(
//                         action,
//                         updateTaskProof,
//                         requesterKeyIndexStorage.getWitness(level1Index),
//                         timestampStorage.getWitness(level1Index),
//                         requesterAccumulationStorage.getWitness(level1Index)
//                     ),
//                 { logger }
//             );
//             requesterKeyIndexStorage.updateRawLeaf(
//                 {
//                     level1Index,
//                 },
//                 action.keyIndex
//             );
//             timestampStorage.updateRawLeaf({ level1Index }, action.timestamp);
//             requesterAccumulationStorage.updateRawLeaf(
//                 { level1Index },
//                 {
//                     accumulationRootR: REQUEST_LEVEL_2_TREE().getRoot(),
//                     accumulationRootM: REQUEST_LEVEL_2_TREE().getRoot(),
//                 }
//             );
//         }
//         await Utils.proveAndSendTx(
//             RequesterContract.name,
//             'rollup',
//             async () => requesterContract.rollup(updateTaskProof),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([requesterZkApp.key.publicKey]);
//     });

//     it('Should submit and accumulate encryption vectors', async () => {
//         const { feePayer } = _;
//         const submissions = [
//             { 0: 10n * BigInt(SECRET_UNIT), 2: 20n * BigInt(SECRET_UNIT) },
//             { 1: 25n * BigInt(SECRET_UNIT), 2: 15n * BigInt(SECRET_UNIT) },
//             { 0: 5n * BigInt(SECRET_UNIT) },
//         ];
//         let request = requests[0];
//         let publicKey = keys[0].key || Group.zero;
//         let requesterContract = requesterZkApp.contract as RequesterContract;
//         let submissionContract = submissionZkApp.contract as SubmissionContract;
//         await fetchAccounts([
//             dkgZkApp.key.publicKey,
//             requesterZkApp.key.publicKey,
//             submissionZkApp.key.publicKey,
//         ]);

//         // Submit encryptions
//         for (let i = 0; i < submissions.length; i++) {
//             let submissionFile = `mock/submissions-${Number(
//                 request.taskId
//             )}-${i}.json`;
//             let isMockCommitmentUsed = fs.existsSync(submissionFile);
//             let encryption: any;
//             if (isMockCommitmentUsed) {
//                 let mockSubmission = JSON.parse(
//                     fs.readFileSync(submissionFile, 'utf8')
//                 );
//                 encryption = {
//                     indices: mockSubmission.indices,
//                     packedIndices: Field.from(mockSubmission.packedIndices),
//                     secrets: SecretVector.fromJSON(mockSubmission.secrets),
//                     randoms: RandomVector.fromJSON(mockSubmission.randoms),
//                     nullifiers: NullifierArray.fromJSON(
//                         mockSubmission.nullifiers
//                     ),
//                     R: mockSubmission.R.map(
//                         (e: any) => new Group({ x: e.x, y: e.y })
//                     ),
//                     M: mockSubmission.M.map(
//                         (e: any) => new Group({ x: e.x, y: e.y })
//                     ),
//                     notes: mockSubmission.notes.map(
//                         (e: any) =>
//                             new SecretNote({
//                                 taskId: UInt32.from(e.taskId),
//                                 index: UInt8.from(e.index.value),
//                                 nullifier: Field(e.nullifier),
//                                 commitment: Field(e.commitment),
//                             })
//                     ),
//                 };
//             } else {
//                 encryption = Requester.generateEncryption(
//                     Number(request.taskId),
//                     publicKey,
//                     submissions[i]
//                 );
//                 fs.writeFileSync(
//                     submissionFile,
//                     JSON.stringify({
//                         ...encryption,
//                         secrets: SecretVector.toJSON(encryption.secrets),
//                         randoms: RandomVector.toJSON(encryption.randoms),
//                         nullifiers: NullifierArray.toJSON(
//                             encryption.nullifiers
//                         ),
//                     })
//                 );
//             }
//             Provable.log('Encryption:', encryption);
//             requests[0].encryptions.push(encryption);
//             await Utils.proveAndSendTx(
//                 SubmissionContract.name,
//                 'submitEncryption',
//                 async () =>
//                     submissionContract.submitEncryption(
//                         request.taskId,
//                         request.keyIndex,
//                         encryption.secrets,
//                         encryption.randoms,
//                         encryption.packedIndices,
//                         encryption.nullifiers,
//                         publicKey,
//                         keyStorage.getWitness(
//                             KeyStorage.calculateLevel1Index({
//                                 committeeId,
//                                 keyId,
//                             })
//                         ),
//                         requesterKeyIndexStorage.getWitness(
//                             RequesterKeyIndexStorage.calculateLevel1Index(
//                                 request.taskId.value
//                             )
//                         ),
//                         requesterAddressStorage.getZkAppRef(
//                             RequesterAddressBook.SUBMISSION,
//                             submissionZkApp.key.publicKey
//                         ),
//                         requesterAddressStorage.getZkAppRef(
//                             RequesterAddressBook.DKG,
//                             dkgZkApp.key.publicKey
//                         )
//                     ),
//                 feePayer,
//                 true,
//                 { logger }
//             );
//             await fetchAccounts([
//                 requesterZkApp.key.publicKey,
//                 submissionZkApp.key.publicKey,
//             ]);
//             let actions = await Utils.fetchActions(
//                 requesterZkApp.key.publicKey
//             );
//             let action = RequesterAction.fromFields(
//                 actions[NUM_TASKS + i].actions[0].map((e) => Field(e))
//             );
//             requesterZkApp.actionStates.push(
//                 requesterContract.account.actionState.get()
//             );
//             requesterZkApp.actions.push(RequesterAction.toFields(action));
//         }

//         // Accumulate submission
//         let requesterCounters = RequesterCounters.fromFields([
//             requesterContract.counters.get(),
//         ]);
//         let updateTaskProof = await Utils.prove(
//             RollupTask.name,
//             'init',
//             async () =>
//                 RollupTask.init(
//                     RequesterAction.empty(),
//                     requesterContract.actionState.get(),
//                     requesterCounters.taskCounter,
//                     requesterContract.keyIndexRoot.get(),
//                     requesterContract.timestampRoot.get(),
//                     requesterContract.accumulationRoot.get(),
//                     requesterCounters.commitmentCounter,
//                     requesterContract.commitmentRoot.get()
//                 ),
//             { logger }
//         );
//         let actions = requesterZkApp.actions.slice(
//             NUM_TASKS,
//             NUM_TASKS + submissions.length
//         );
//         let accumulationStorageR = new GroupVectorStorage();
//         let accumulationStorageM = new GroupVectorStorage();
//         let commitmentCounter = requesterCounters.commitmentCounter;
//         for (let i = 0; i < actions.length; i++) {
//             let action = RequesterAction.fromFields(actions[i]);
//             let encryption = requests[0].encryptions[i];
//             let sumR = new GroupVector(
//                 encryption.indices.map((e) => request.sumR[e])
//             );
//             let sumM = new GroupVector(
//                 encryption.indices.map((e) => request.sumM[e])
//             );
//             let initialSumR = sumR.copy();
//             let initialSumM = sumM.copy();
//             let accumulationWitnessesR = new GroupVectorWitnesses();
//             let accumulationWitnessesM = new GroupVectorWitnesses();
//             let commitmentWitnesses = new CommitmentWitnesses();
//             for (let j = 0; j < ENC_LIMITS.DIMENSION; j++) {
//                 let index = encryption.indices[j];
//                 // Get accumulation witnesses
//                 accumulationWitnessesR.set(
//                     Field(j),
//                     accumulationStorageR.getWitness(Field(index))
//                 );
//                 accumulationWitnessesM.set(
//                     Field(j),
//                     accumulationStorageM.getWitness(Field(index))
//                 );

//                 // Update sum vectors
//                 requests[0].sumR[index] = requests[0].sumR[index].add(
//                     encryption.R[index]
//                 );
//                 sumR.set(Field(j), requests[0].sumR[index]);
//                 requests[0].sumM[index] = requests[0].sumM[index].add(
//                     encryption.M[index]
//                 );
//                 sumM.set(Field(j), requests[0].sumM[index]);

//                 // Update accumulation storages
//                 accumulationStorageR.updateRawLeaf(
//                     { level1Index: Field(index) },
//                     requests[0].sumR[index]
//                 );
//                 accumulationStorageM.updateRawLeaf(
//                     { level1Index: Field(index) },
//                     requests[0].sumM[index]
//                 );

//                 // Get commitment witness
//                 commitmentWitnesses.set(
//                     Field(j),
//                     commitmentStorage.getWitness(commitmentCounter.value)
//                 );

//                 // Update commitment storage
//                 commitmentStorage.updateRawLeaf(
//                     { level1Index: commitmentCounter.value },
//                     action.commitments.get(Field(j))
//                 );
//                 commitmentCounter = commitmentCounter.add(1);
//             }
//             updateTaskProof = await Utils.prove(
//                 RollupTask.name,
//                 'accumulate',
//                 async () =>
//                     RollupTask.accumulate(
//                         action,
//                         updateTaskProof,
//                         initialSumR,
//                         initialSumM,
//                         requesterAccumulationStorage.getWitness(Field(0)),
//                         accumulationWitnessesR,
//                         accumulationWitnessesM,
//                         commitmentWitnesses
//                     ),
//                 { logger }
//             );
//         }
//         requests[0].accumulationRootR = accumulationStorageR.root;
//         requests[0].accumulationRootM = accumulationStorageM.root;
//         await Utils.proveAndSendTx(
//             RequesterContract.name,
//             'rollup',
//             async () => requesterContract.rollup(updateTaskProof),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([requesterZkApp.key.publicKey]);
//     });

//     it('Should finalize task and create request', async () => {
//         const { feePayer } = _;
//         let request = requests[0];
//         let requestContract = requestZkApp.contract as RequestContract;
//         let requesterContract = requesterZkApp.contract as RequesterContract;
//         await fetchAccounts([
//             requestZkApp.key.publicKey,
//             requesterZkApp.key.publicKey,
//         ]);

//         // Wait until the submission period ends and finalize task
//         await waitUntil(Number(request.submissionTs));
//         let level1Index = request.taskId.value;
//         await Utils.proveAndSendTx(
//             RequesterContract.name,
//             'finalizeTask',
//             async () =>
//                 requesterContract.finalizeTask(
//                     request.taskId,
//                     UInt8.from(ENC_LIMITS.FULL_DIMENSION),
//                     request.keyIndex,
//                     request.accumulationRootR!,
//                     request.accumulationRootM!,
//                     requesterKeyIndexStorage.getWitness(level1Index),
//                     requesterAccumulationStorage.getWitness(level1Index),
//                     requesterAddressStorage.getZkAppRef(
//                         RequesterAddressBook.REQUEST,
//                         requestZkApp.key.publicKey
//                     )
//                 ),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([requestZkApp.key.publicKey]);
//         let actions = await Utils.fetchActions(requestZkApp.key.publicKey);
//         let action = RequestAction.fromFields(
//             actions[0].actions[0].map((e) => Field(e))
//         );
//         requestZkApp.actionStates.push(
//             requestContract.account.actionState.get()
//         );
//         requestZkApp.actions.push(RequestAction.toFields(action));

//         // Initialize request
//         let updateRequestProof = await Utils.prove(
//             RollupRequest.name,
//             'init',
//             async () =>
//                 RollupRequest.init(
//                     RequestAction.empty(),
//                     requestContract.requestCounter.get(),
//                     requestContract.keyIndexRoot.get(),
//                     requestContract.taskRoot.get(),
//                     requestContract.accumulationRoot.get(),
//                     requestContract.expirationRoot.get(),
//                     requestContract.resultRoot.get(),
//                     requestContract.actionState.get()
//                 ),
//             { logger }
//         );
//         updateRequestProof = await Utils.prove(
//             RollupRequest.name,
//             'initialize',
//             async () =>
//                 RollupRequest.initialize(
//                     action,
//                     updateRequestProof,
//                     requestKeyIndexStorage.getWitness(Field(0)),
//                     taskStorage.getWitness(Field(0)),
//                     requestAccumulationStorage.getWitness(Field(0)),
//                     expirationStorage.getWitness(Field(0))
//                 ),
//             { logger }
//         );
//         requestKeyIndexStorage.updateRawLeaf(
//             {
//                 level1Index: Field(0),
//             },
//             request.keyIndex
//         );
//         taskStorage.updateRawLeaf(
//             {
//                 level1Index: Field(0),
//             },
//             {
//                 requester: request.requester,
//                 taskId: request.taskId,
//             }
//         );
//         requestAccumulationStorage.updateRawLeaf(
//             {
//                 level1Index: Field(0),
//             },
//             {
//                 accumulationRootR: request.accumulationRootR!,
//                 accumulationRootM: request.accumulationRootM!,
//                 dimension: UInt32.from(ENC_LIMITS.FULL_DIMENSION),
//             }
//         );
//         expirationStorage.updateRawLeaf(
//             {
//                 level1Index: Field(0),
//             },
//             action.expirationTimestamp
//         );
//         await Utils.proveAndSendTx(
//             RequestContract.name,
//             'update',
//             async () => requestContract.update(updateRequestProof),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([requestZkApp.key.publicKey]);
//     });

//     it('Should contribute response and resolve request', async () => {
//         const { feePayer } = _;
//         let committee = committees[Number(committeeId)];
//         let T = Number(committee.threshold);
//         let N = Number(committee.members.length);
//         let request = requests[0];
//         let requestContract = requestZkApp.contract as RequestContract;
//         let responseContract = responseZkApp.contract as ResponseContract;
//         let rollupContract = rollupZkApp.contract as RollupContract;
//         await fetchAccounts([
//             requestZkApp.key.publicKey,
//             responseZkApp.key.publicKey,
//             rollupZkApp.key.publicKey,
//         ]);

//         // Prepare accumulation storage for R and M
//         let accumulationStorageR = new GroupVectorStorage();
//         let accumulationStorageM = new GroupVectorStorage();
//         Provable.log('Sum R:', request.sumR);
//         Provable.log('Sum M:', request.sumM);
//         for (let i = 0; i < ENC_LIMITS.FULL_DIMENSION; i++) {
//             if (request.sumR[i].equals(Group.zero).not().toBoolean()) {
//                 accumulationStorageR.updateRawLeaf(
//                     { level1Index: Field(i) },
//                     request.sumR[i]
//                 );
//                 accumulationStorageM.updateRawLeaf(
//                     { level1Index: Field(i) },
//                     request.sumM[i]
//                 );
//             }
//         }

//         let responseStoragesD: GroupVectorStorage[] = [];
//         for (let i = 0; i < T; i++) {
//             let memberId = i;
//             let responseStorageD = new GroupVectorStorage();
//             // Generate decryption proof for secret shares
//             let c = new MemberFieldArray(
//                 // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
//                 keys[0].round2Contributions!.map((e) =>
//                     e.c.get(Field(memberId))
//                 )
//             );
//             let U = new MemberGroupArray(
//                 keys[0].round2Contributions!.map((e) =>
//                     e.U.get(Field(memberId))
//                 )
//             );
//             let decryptionProof = await Utils.prove(
//                 BatchDecryption.name,
//                 'decrypt',
//                 async () =>
//                     BatchDecryption.decrypt(
//                         new BatchDecryptionInput({
//                             publicKey: committeeSecrets[memberId].C[0],
//                             c,
//                             U,
//                             memberId: Field(memberId),
//                         }),
//                         new PlainArray(
//                             committeeSecrets.map((e) => e.f[memberId])
//                         ),
//                         committeeSecrets[memberId].a[0]
//                     ),
//                 { logger }
//             );
//             Provable.log('Decrypted Ski:', decryptionProof.publicOutput);

//             // Get response contribution
//             let round2Data: Round2Data[] = keys[0].round2Contributions!.map(
//                 (e) =>
//                     ({
//                         c: e.c.get(Field(memberId)),
//                         U: e.U.get(Field(memberId)),
//                     } as Round2Data)
//             );
//             let [contribution, ski] = getResponseContribution(
//                 committeeSecrets[memberId],
//                 i,
//                 round2Data,
//                 requests[0].sumR
//             );
//             Provable.log('Ski:', ski);
//             requests[0].contributions.push(contribution);

//             // Generate compute response proof
//             let computeResponseProof = await Utils.prove(
//                 ComputeResponse.name,
//                 'init',
//                 async () =>
//                     ComputeResponse.init(
//                         accumulationStorageR.root,
//                         CustomScalar.fromScalar(ski)
//                     ),
//                 { logger }
//             );
//             for (let j = 0; j < ENC_LIMITS.FULL_DIMENSION; j++) {
//                 computeResponseProof = await Utils.prove(
//                     ComputeResponse.name,
//                     'compute',
//                     async () =>
//                         ComputeResponse.compute(
//                             computeResponseProof,
//                             CustomScalar.fromScalar(ski),
//                             request.sumR[j],
//                             accumulationStorageR.getWitness(Field(j)),
//                             responseStorageD.getWitness(Field(j))
//                         ),
//                     { logger }
//                 );
//                 responseStorageD.updateRawLeaf(
//                     {
//                         level1Index: Field(j),
//                     },
//                     request.sumR[j]
//                         .add(Group.generator)
//                         .scale(ski)
//                         .sub(Group.generator.scale(ski))
//                 );
//             }
//             responseStoragesD.push(responseStorageD);

//             let action = new ResponseAction({
//                 committeeId,
//                 keyId,
//                 memberId: Field(memberId),
//                 requestId: Field(0),
//                 dimension: UInt8.from(ENC_LIMITS.FULL_DIMENSION),
//                 responseRootD: responseStorageD.root,
//             });

//             let memberWitness = memberStorage.getWitness(
//                 MemberStorage.calculateLevel1Index(committeeId),
//                 MemberStorage.calculateLevel2Index(Field(memberId))
//             );

//             await Utils.proveAndSendTx(
//                 ResponseContract.name,
//                 'contribute',
//                 async () =>
//                     responseContract.contribute(
//                         decryptionProof,
//                         computeResponseProof,
//                         keyId,
//                         Field(0),
//                         accumulationStorageM.root,
//                         memberWitness,
//                         publicKeyStorage.getWitness(
//                             PublicKeyStorage.calculateLevel1Index({
//                                 committeeId,
//                                 keyId,
//                             }),
//                             PublicKeyStorage.calculateLevel2Index(Field(i))
//                         ),
//                         encryptionStorage.getWitness(
//                             EncryptionStorage.calculateLevel1Index({
//                                 committeeId,
//                                 keyId,
//                             }),
//                             EncryptionStorage.calculateLevel2Index(Field(i))
//                         ),
//                         requestAccumulationStorage.getWitness(Field(0)),
//                         sharedAddressStorage.getZkAppRef(
//                             ZkAppIndex.COMMITTEE,
//                             committeeZkApp.key.publicKey
//                         ),
//                         sharedAddressStorage.getZkAppRef(
//                             ZkAppIndex.ROUND1,
//                             round1ZkApp.key.publicKey
//                         ),
//                         sharedAddressStorage.getZkAppRef(
//                             ZkAppIndex.ROUND2,
//                             round2ZkApp.key.publicKey
//                         ),
//                         sharedAddressStorage.getZkAppRef(
//                             ZkAppIndex.REQUEST,
//                             requestZkApp.key.publicKey
//                         ),
//                         sharedAddressStorage.getZkAppRef(
//                             ZkAppIndex.ROLLUP,
//                             rollupZkApp.key.publicKey
//                         ),
//                         sharedAddressStorage.getZkAppRef(
//                             ZkAppIndex.RESPONSE,
//                             responseZkApp.key.publicKey
//                         )
//                     ),
//                 feePayer,
//                 true,
//                 { logger }
//             );
//             await fetchAccounts([
//                 responseZkApp.key.publicKey,
//                 rollupZkApp.key.publicKey,
//             ]);
//             let rollupAction = new RollupAction({
//                 zkAppIndex: Field(ZkAppIndex.RESPONSE),
//                 actionHash: action.hash(),
//             });
//             responseZkApp.actionStates.push(
//                 responseContract.account.actionState.get()
//             );
//             responseZkApp.actions.push(ResponseAction.toFields(action));
//             rollupZkApp.actionStates.push(
//                 rollupContract.account.actionState.get()
//             );
//             rollupZkApp.actions.push(RollupAction.toFields(rollupAction));
//         }

//         // Rollup dkg action
//         let rollupProof = await Utils.prove(
//             Rollup.name,
//             'init',
//             async () =>
//                 Rollup.init(
//                     RollupAction.empty(),
//                     rollupContract.counterRoot.get(),
//                     rollupContract.rollupRoot.get(),
//                     rollupContract.actionState.get()
//                 ),
//             { logger }
//         );
//         for (let i = 0; i < T; i++) {
//             let action = RollupAction.fromFields(rollupZkApp.actions[i]);
//             rollupProof = await Utils.prove(
//                 Rollup.name,
//                 'rollup',
//                 async () =>
//                     Rollup.rollup(
//                         action,
//                         rollupProof,
//                         Field(i),
//                         rollupCounterStorage.getWitness(
//                             RollupCounterStorage.calculateLevel1Index(
//                                 Field(ZkAppIndex.RESPONSE)
//                             )
//                         ),
//                         rollupStorage.getWitness(
//                             RollupStorage.calculateLevel1Index({
//                                 zkAppIndex: Field(ZkAppIndex.RESPONSE),
//                                 actionId: Field(i),
//                             })
//                         )
//                     ),
//                 { logger }
//             );
//             rollupCounterStorage.updateRawLeaf(
//                 {
//                     level1Index: RollupCounterStorage.calculateLevel1Index(
//                         Field(ZkAppIndex.RESPONSE)
//                     ),
//                 },
//                 Field(i + 1)
//             );
//             rollupStorage.updateRawLeaf(
//                 {
//                     level1Index: RollupStorage.calculateLevel1Index({
//                         zkAppIndex: Field(ZkAppIndex.RESPONSE),
//                         actionId: Field(i),
//                     }),
//                 },
//                 action.actionHash
//             );
//         }
//         await Utils.proveAndSendTx(
//             RollupContract.name,
//             'rollup',
//             async () => rollupContract.rollup(rollupProof),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([rollupZkApp.key.publicKey]);

//         // Finalize response contributions
//         let finalizeResponseProof = await Utils.prove(
//             FinalizeResponse.name,
//             'init',
//             async () =>
//                 FinalizeResponse.init(
//                     new FinalizeResponseInput({
//                         previousActionState: Field(0),
//                         action: ResponseAction.empty(),
//                         actionId: Field(0),
//                     }),
//                     Field(T),
//                     Field(N),
//                     UInt8.from(ENC_LIMITS.FULL_DIMENSION),
//                     Field(0),
//                     Field(0),
//                     responseContract.contributionRoot.get(),
//                     responseContract.processRoot.get(),
//                     rollupContract.rollupRoot.get(),
//                     responseContributionStorage.getLevel1Witness(Field(0))
//                 ),
//             { logger }
//         );
//         responseContributionStorage.updateInternal(
//             Field(0),
//             DKG_LEVEL_2_TREE()
//         );
//         responseStorage.updateRawLeaf(
//             { level1Index: Field(0) },
//             REQUEST_LEVEL_2_TREE().getRoot()
//         );

//         for (let i = 0; i < T; i++) {
//             let action = ResponseAction.fromFields(responseZkApp.actions[i]);
//             let actionId = Field(i);
//             finalizeResponseProof = await Utils.prove(
//                 FinalizeResponse.name,
//                 'contribute',
//                 async () =>
//                     FinalizeResponse.contribute(
//                         new FinalizeResponseInput({
//                             previousActionState: responseZkApp.actionStates[i],
//                             action,
//                             actionId,
//                         }),
//                         finalizeResponseProof,
//                         responseContributionStorage.getWitness(
//                             Field(0),
//                             Field(i)
//                         ),
//                         rollupStorage.getWitness(
//                             RollupStorage.calculateLevel1Index({
//                                 zkAppIndex: Field(ZkAppIndex.RESPONSE),
//                                 actionId,
//                             })
//                         ),
//                         responseProcessStorage.getWitness(
//                             ProcessStorage.calculateIndex(actionId)
//                         )
//                     ),
//                 { logger }
//             );
//             responseContributionStorage.updateRawLeaf(
//                 {
//                     level1Index: Field(0),
//                     level2Index: Field(i),
//                 },
//                 action.responseRootD
//             );
//             responseProcessStorage.updateRawLeaf(
//                 {
//                     level1Index: ProcessStorage.calculateLevel1Index(actionId),
//                 },
//                 {
//                     actionState: responseZkApp.actionStates[i + 1],
//                     processCounter: UInt8.from(0),
//                 }
//             );
//         }
//         let responseStorageD = new GroupVectorStorage();
//         let sumD = accumulateResponses(
//             [...Array(T).keys()],
//             request.contributions.map((e) => e.D.values)
//         );
//         for (let i = 0; i < request.sumR.length; i++) {
//             for (let j = 0; j < T; j++) {
//                 let action = ResponseAction.fromFields(
//                     responseZkApp.actions[j]
//                 );
//                 let actionId = Field(j);
//                 finalizeResponseProof = await Utils.prove(
//                     FinalizeResponse.name,
//                     'compute',
//                     async () =>
//                         FinalizeResponse.compute(
//                             new FinalizeResponseInput({
//                                 previousActionState:
//                                     responseZkApp.actionStates[j],
//                                 action,
//                                 actionId,
//                             }),
//                             finalizeResponseProof,
//                             request.contributions[j].D.get(Field(i)),
//                             responseStoragesD[j].getWitness(Field(i)),
//                             responseProcessStorage.getWitness(
//                                 ProcessStorage.calculateIndex(actionId)
//                             )
//                         ),
//                     { logger }
//                 );
//                 responseProcessStorage.updateRawLeaf(
//                     {
//                         level1Index:
//                             ProcessStorage.calculateLevel1Index(actionId),
//                     },
//                     {
//                         actionState: responseZkApp.actionStates[j + 1],
//                         processCounter: UInt8.from(i + 1),
//                     }
//                 );
//             }
//             requests[0].sumD[i] = sumD[i];
//             finalizeResponseProof = await Utils.prove(
//                 FinalizeResponse.name,
//                 'finalize',
//                 async () =>
//                     FinalizeResponse.finalize(
//                         new FinalizeResponseInput({
//                             previousActionState: Field(0),
//                             action: ResponseAction.empty(),
//                             actionId: Field(0),
//                         }),
//                         finalizeResponseProof,
//                         responseStorageD.getWitness(Field(i))
//                     ),
//                 { logger }
//             );
//             responseStorageD.updateRawLeaf(
//                 { level1Index: Field(i) },
//                 requests[0].sumD[i]
//             );
//         }
//         await Utils.proveAndSendTx(
//             ResponseContract.name,
//             'finalize',
//             async () =>
//                 responseContract.finalize(
//                     finalizeResponseProof,
//                     settingStorage.getWitness(committeeId),
//                     requestKeyIndexStorage.getWitness(Field(0)),
//                     responseStorage.getWitness(Field(0)),
//                     sharedAddressStorage.getZkAppRef(
//                         ZkAppIndex.COMMITTEE,
//                         committeeZkApp.key.publicKey
//                     ),
//                     sharedAddressStorage.getZkAppRef(
//                         ZkAppIndex.REQUEST,
//                         requestZkApp.key.publicKey
//                     ),
//                     sharedAddressStorage.getZkAppRef(
//                         ZkAppIndex.ROLLUP,
//                         rollupZkApp.key.publicKey
//                     )
//                 ),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([responseZkApp.key.publicKey]);

//         // Resolve request
//         let rawResultStorage = new ScalarVectorStorage();
//         let rawResult = bruteForceResultVector(
//             getResultVector(requests[0].sumD, requests[0].sumM)
//         );
//         for (let i = 0; i < ENC_LIMITS.FULL_DIMENSION; i++) {
//             rawResultStorage.updateRawLeaf(
//                 { level1Index: Field(i) },
//                 rawResult[i]
//             );
//         }
//         let computeResultProof = await Utils.prove(
//             ComputeResult.name,
//             'init',
//             async () =>
//                 ComputeResult.init(
//                     new ComputeResultInput({
//                         M: Group.zero,
//                         D: Group.zero,
//                         result: Scalar.from(0),
//                     }),
//                     accumulationStorageM.root,
//                     responseStorageD.root,
//                     rawResultStorage.root
//                 ),
//             { logger }
//         );
//         for (let i = 0; i < ENC_LIMITS.FULL_DIMENSION; i++) {
//             let sumMi = requests[0].sumM[i];
//             let sumDi = requests[0].sumD[i];
//             let result = rawResult[i];
//             computeResultProof = await Utils.prove(
//                 ComputeResult.name,
//                 'compute',
//                 async () =>
//                     ComputeResult.compute(
//                         new ComputeResultInput({
//                             M: sumMi,
//                             D: sumDi,
//                             result,
//                         }),
//                         computeResultProof,
//                         accumulationStorageM.getWitness(Field(i)),
//                         responseStorageD.getWitness(Field(i)),
//                         rawResultStorage.getWitness(Field(i))
//                     ),
//                 { logger }
//             );
//         }
//         await Utils.proveAndSendTx(
//             RequestContract.name,
//             'resolve',
//             async () =>
//                 requestContract.resolve(
//                     computeResultProof,
//                     request.expirationTs,
//                     accumulationStorageR.root,
//                     expirationStorage.getWitness(Field(0)),
//                     requestAccumulationStorage.getWitness(Field(0)),
//                     responseStorage.getWitness(Field(0)),
//                     resultStorage.getWitness(Field(0)),
//                     sharedAddressStorage.getZkAppRef(
//                         ZkAppIndex.RESPONSE,
//                         responseZkApp.key.publicKey
//                     )
//                 ),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([requestZkApp.key.publicKey]);
//         let action = new RequestAction({
//             ...RequestAction.empty(),
//             requestId: Field(0),
//             resultRoot: computeResultProof.publicOutput.resultRoot,
//         });
//         requestZkApp.actionStates.push(
//             requestContract.account.actionState.get()
//         );
//         requestZkApp.actions.push(RequestAction.toFields(action));

//         let updateRequestProof = await Utils.prove(
//             RollupRequest.name,
//             'init',
//             async () =>
//                 RollupRequest.init(
//                     RequestAction.empty(),
//                     requestContract.requestCounter.get(),
//                     requestContract.keyIndexRoot.get(),
//                     requestContract.taskRoot.get(),
//                     requestContract.accumulationRoot.get(),
//                     requestContract.expirationRoot.get(),
//                     requestContract.resultRoot.get(),
//                     requestContract.actionState.get()
//                 ),
//             { logger }
//         );
//         updateRequestProof = await Utils.prove(
//             RollupRequest.name,
//             'resolve',
//             async () =>
//                 RollupRequest.resolve(
//                     action,
//                     updateRequestProof,
//                     resultStorage.getWitness(Field(0))
//                 ),
//             { logger }
//         );
//         resultStorage.updateRawLeaf(
//             { level1Index: Field(0) },
//             computeResultProof.publicOutput.resultRoot
//         );
//         await Utils.proveAndSendTx(
//             RequestContract.name,
//             'update',
//             async () => requestContract.update(updateRequestProof),
//             feePayer,
//             true,
//             { logger }
//         );
//         await fetchAccounts([requestZkApp.key.publicKey]);
//     });
// });
