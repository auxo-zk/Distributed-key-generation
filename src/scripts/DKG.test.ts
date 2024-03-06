// import {
//     AccountUpdate,
//     Cache,
//     Field,
//     Group,
//     Mina,
//     PrivateKey,
//     Provable,
//     PublicKey,
//     Reducer,
//     Scalar,
//     SmartContract,
// } from 'o1js';
// import { CustomScalar } from '@auxo-dev/auxo-libs';
// import fs from 'fs';
// import { getProfiler } from './helper/profiler.js';
// import { Config, Key } from './helper/config.js';
// import { CommitteeContract, RollupCommittee } from '../contracts/Committee.js';
// import {
//     Action as DKGAction,
//     ActionEnum,
//     ACTION_MASK,
//     DkgContract,
//     KeyStatus,
//     RollupDkg,
// } from '../contracts/DKG.js';
// import {
//     Action as Round1Action,
//     FinalizeRound1,
//     ReduceRound1,
//     Round1Contract,
//     Round1Input,
// } from '../contracts/Round1.js';
// import {
//     Action as Round2Action,
//     FinalizeRound2,
//     ReduceRound2,
//     Round2Contract,
//     Round2Input,
// } from '../contracts/Round2.js';
// import {
//     Action as ResponseAction,
//     FinalizeResponse,
//     ReduceResponse,
//     ResponseContract,
//     ResponseInput,
// } from '../contracts/Response.js';
// import {
//     BatchDecryption,
//     BatchDecryptionInput,
//     BatchDecryptionProof,
//     BatchEncryption,
//     BatchEncryptionInput,
//     BatchEncryptionProof,
//     PlainArray,
//     RandomArray,
// } from '../contracts/Encryption.js';
// import {
//     EMPTY_LEVEL_2_TREE as COMMITTEE_LEVEL_2_TREE,
//     KeyCounterStorage,
//     MemberStorage,
//     SettingStorage,
// } from '../contracts/CommitteeStorage.js';
// import {
//     EMPTY_LEVEL_2_TREE as DKG_LEVEL_2_TREE,
//     EncryptionStorage,
//     KeyStatusStorage,
//     PublicKeyStorage,
//     Round1ContributionStorage,
//     Round2ContributionStorage,
// } from '../contracts/DKGStorage.js';
// import {
//     ActionStatus,
//     AddressStorage,
//     ReduceStorage,
// } from '../contracts/SharedStorage.js';
// import {
//     CArray,
//     EncryptionHashArray,
//     Round2Data,
//     SecretPolynomial,
//     UArray,
//     cArray,
//     calculatePublicKey,
//     generateRandomPolynomial,
//     getResponseContribution,
//     getRound1Contribution,
//     getRound2Contribution,
// } from '../libs/Committee.js';
// import { ZkAppEnum, Contract } from '../constants.js';
// import {
//     RArray,
//     accumulateEncryption,
//     generateEncryption,
// } from '../libs/Requester.js';
// import { CreateRequest, RequestContract } from '../contracts/Request.js';
// import { packIndexArray } from '../libs/utils.js';
// import { ResponseContributionStorage } from '../contracts/RequestStorage.js';

// describe('DKG', () => {
//     const doProofs = false;
//     const profiling = false;
//     const logMemory = false;
//     const cache = Cache.FileSystem('./caches');
//     const DKGProfiler = getProfiler('Benchmark DKG');
//     let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
//     Mina.setActiveInstance(Local);
//     let feePayerKey: Key;
//     let contracts: {
//         [key: string]: {
//             key: Key;
//             contract: SmartContract;
//             actionStates: Field[];
//         };
//     } = {};

//     let committeeIndex = Field(0);
//     let T = 1,
//         N = 2;
//     let members: Key[] = Local.testAccounts.slice(1, N + 1);
//     let responsedMembers = [0];
//     let secrets: SecretPolynomial[] = [];
//     let publicKeys: Group[] = [];
//     let requestId = Field.random();
//     let mockRequests = [
//         [1000n, 1000n, 1000n],
//         [4000n, 3000n, 2000n],
//     ];
//     let mockResult = [5000n, 4000n, 3000n];
//     let R: Group[][] = [];
//     let M: Group[][] = [];
//     let sumR: Group[] = [];
//     let sumM: Group[] = [];
//     let D: Group[][] = [];

//     // CommitteeContract storage
//     let memberStorage = new MemberStorage();
//     let settingStorage = new SettingStorage();
//     let commmitteeAddressStorage = new AddressStorage();

//     // DkgContract storage
//     let keyCounterStorage = new KeyCounterStorage();
//     let keyStatusStorage = new KeyStatusStorage();
//     let dkgAddressStorage = new AddressStorage();

//     // Round1Contract storage
//     let round1ReduceStorage = new ReduceStorage();
//     let round1ContributionStorage = new Round1ContributionStorage();
//     let publicKeyStorage = new PublicKeyStorage();
//     let round1AddressStorage = new AddressStorage();

//     // Round2Contract storage
//     let round2ReduceStorage = new ReduceStorage();
//     let round2ContributionStorage = new Round2ContributionStorage();
//     let encryptionStorage = new EncryptionStorage();
//     let round2AddressStorage = new AddressStorage();

//     // Response storage
//     let responseReduceStorage = new ReduceStorage();
//     let responseContributionStorage = new ResponseContributionStorage();
//     let responseAddressStorage = new AddressStorage();

//     let dkgActions = {
//         [ActionEnum.GENERATE_KEY]: [
//             new DKGAction({
//                 committeeId: committeeIndex,
//                 keyId: Field(-1),
//                 mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
//             }),
//             new DKGAction({
//                 committeeId: committeeIndex,
//                 keyId: Field(-1),
//                 mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
//             }),
//             new DKGAction({
//                 committeeId: committeeIndex,
//                 keyId: Field(-1),
//                 mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
//             }),
//         ],
//         [ActionEnum.FINALIZE_ROUND_1]: [
//             new DKGAction({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//                 mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_1],
//             }),
//         ],
//         [ActionEnum.FINALIZE_ROUND_2]: [
//             new DKGAction({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//                 mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_2],
//             }),
//         ],
//         [ActionEnum.DEPRECATE_KEY]: [
//             new DKGAction({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//                 mask: ACTION_MASK[ActionEnum.DEPRECATE_KEY],
//             }),
//         ],
//     };

//     let round1Actions: Round1Action[] = [];
//     let round2Actions: Round2Action[] = [];
//     let encryptionProofs: BatchEncryptionProof[] = [];
//     let responseActions: ResponseAction[] = [];
//     let decryptionProofs: BatchDecryptionProof[] = [];

//     const logMemUsage = () => {
//         console.log(
//             'Current memory usage:',
//             Math.floor(process.memoryUsage().rss / 1024 / 1024),
//             'MB'
//         );
//     };

//     const compile = async (
//         // eslint-disable-next-line @typescript-eslint/no-explicit-any
//         prg: any,
//         name: string,
//         profiling = false
//     ) => {
//         if (logMemory) logMemUsage();
//         console.log(`Compiling ${name}...`);
//         if (profiling) DKGProfiler.start(`${name}.compile`);
//         await prg.compile({ cache });
//         if (profiling) DKGProfiler.stop();
//         console.log('Done!');
//     };

//     const deploy = async (
//         feePayer: Key,
//         name: string,
//         initArgs: [string, Field][]
//     ) => {
//         console.log(`Deploying ${name}...`);
//         let ct = name.toLowerCase().replace('contract', '');
//         let { contract, key } = contracts[ct];
//         let tx = await Mina.transaction(feePayer.publicKey, () => {
//             AccountUpdate.fundNewAccount(feePayer.publicKey, 1);
//             contract.deploy();
//             for (let i = 0; i < initArgs.length; i++) {
//                 // eslint-disable-next-line @typescript-eslint/no-explicit-any
//                 (contract as any)[initArgs[i][0]].set(initArgs[i][1]);
//             }
//         });
//         await tx.sign([feePayer.privateKey, key.privateKey]).send();
//         console.log(`${name} deployed!`);
//         Object.assign(contracts[ct], {
//             contract: contract,
//         });
//     };

//     const proveAndSend = async (
//         tx: Mina.Transaction,
//         feePayer: Key,
//         contractName: string,
//         methodName: string,
//         profiling = true
//     ) => {
//         if (logMemory) logMemUsage();
//         console.log(
//             `Generate proof and submit tx for ${contractName}.${methodName}()...`
//         );
//         if (profiling) DKGProfiler.start(`${contractName}.${methodName}.prove`);
//         await tx.prove();
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');
//         await tx.sign([feePayer.privateKey]).send();
//     };

//     beforeAll(async () => {
//         let configJson: Config = JSON.parse(
//             await fs.readFileSync('config.json', 'utf8')
//         );

//         // let feePayerKeysBase58: { privateKey: string; publicKey: string } =
//         //   JSON.parse(await fs.readFileSync(dkgConfig.feepayerKeyPath, 'utf8'));
//         feePayerKey = {
//             privateKey: Local.testAccounts[0].privateKey,
//             publicKey: Local.testAccounts[0].publicKey,
//         };

//         await Promise.all(
//             Object.keys(Contract)
//                 .filter((item) => isNaN(Number(item)))
//                 .map(async (e) => {
//                     let config = configJson.deployAliases[e.toLowerCase()];
//                     // console.log(config);
//                     let keyBase58: { privateKey: string; publicKey: string } =
//                         JSON.parse(
//                             await fs.readFileSync(config.keyPath, 'utf8')
//                         );
//                     let key = {
//                         privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
//                         publicKey: PublicKey.fromBase58(keyBase58.publicKey),
//                     };
//                     let contract = (() => {
//                         switch (e.toLowerCase()) {
//                             case Contract.COMMITTEE:
//                                 return new CommitteeContract(key.publicKey);
//                             case Contract.DKG:
//                                 return new DkgContract(key.publicKey);
//                             case Contract.ROUND1:
//                                 return new Round1Contract(key.publicKey);
//                             case Contract.ROUND2:
//                                 return new Round2Contract(key.publicKey);
//                             case Contract.RESPONSE:
//                                 return new ResponseContract(key.publicKey);
//                             case Contract.REQUEST:
//                                 return new RequestContract(key.publicKey);
//                             default:
//                                 return new SmartContract(key.publicKey);
//                         }
//                     })();
//                     contracts[e.toLowerCase()] = {
//                         key: key,
//                         contract: contract,
//                         actionStates: [Reducer.initialActionState],
//                     };
//                 })
//         );
//     });

//     it('Should compile all ZK programs', async () => {
//         await compile(RollupDkg, 'RollupDkg', profiling);

//         await compile(ReduceRound1, 'ReduceRound1', profiling);
//         await compile(FinalizeRound1, 'FinalizeRound1', profiling);

//         await compile(ReduceRound2, 'ReduceRound2', profiling);
//         await compile(BatchEncryption, 'BatchEncryption', profiling);
//         await compile(FinalizeRound2, 'FinalizeRound2', profiling);

//         await compile(ReduceResponse, 'ReduceResponse', profiling);
//         await compile(BatchDecryption, 'BatchDecryption', profiling);
//         await compile(FinalizeResponse, 'FinalizeResponse', profiling);

//         await compile(RollupCommittee, 'RollupCommittee', profiling);

//         await compile(CreateRequest, 'CreateRequest', profiling);

//         if (doProofs) {
//             await compile(CommitteeContract, 'CommitteeContract', profiling);
//             await compile(DkgContract, 'DkgContract', profiling);
//             await compile(Round1Contract, 'Round1Contract', profiling);
//             await compile(Round2Contract, 'Round2Contract', profiling);
//             await compile(ResponseContract, 'ResponseContract', profiling);
//             await compile(RequestContract, 'RequestContract', profiling);
//         }
//     });

//     it('Should deploy contracts successfully', async () => {
//         // Calculate mock committee trees
//         let memberTree = COMMITTEE_LEVEL_2_TREE();
//         for (let i = 0; i < members.length; i++) {
//             memberTree.setLeaf(
//                 BigInt(i),
//                 MemberStorage.calculateLeaf(members[i].publicKey)
//             );
//         }
//         memberStorage.updateInternal(committeeIndex, memberTree);
//         settingStorage.updateLeaf(
//             {
//                 level1Index:
//                     SettingStorage.calculateLevel1Index(committeeIndex),
//             },
//             SettingStorage.calculateLeaf({ T: Field(T), N: Field(N) })
//         );

//         // Deploy committee contract
//         await deploy(feePayerKey, 'CommitteeContract', [
//             ['nextCommitteeId', committeeIndex.add(Field(1))],
//             ['memberRoot', memberStorage.root],
//             ['settingRoot', settingStorage.root],
//         ]);
//         dkgAddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//             contracts[Contract.COMMITTEE].contract.address
//         );
//         round1AddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//             contracts[Contract.COMMITTEE].contract.address
//         );
//         round2AddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//             contracts[Contract.COMMITTEE].contract.address
//         );
//         responseAddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//             contracts[Contract.COMMITTEE].contract.address
//         );

//         // Deploy dkg contract
//         await deploy(feePayerKey, 'DkgContract', [
//             ['zkApps', dkgAddressStorage.root],
//         ]);
//         round1AddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.DKG),
//             contracts[Contract.DKG].contract.address
//         );
//         round2AddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.DKG),
//             contracts[Contract.DKG].contract.address
//         );
//         responseAddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.DKG),
//             contracts[Contract.DKG].contract.address
//         );

//         // Deploy round 1 contract
//         await deploy(feePayerKey, 'Round1Contract', [
//             ['zkApps', round1AddressStorage.root],
//         ]);
//         round2AddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.ROUND1),
//             contracts[Contract.ROUND1].contract.address
//         );
//         responseAddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.ROUND1),
//             contracts[Contract.ROUND1].contract.address
//         );

//         // Deploy round 2 contract
//         await deploy(feePayerKey, 'Round2Contract', [
//             ['zkApps', round2AddressStorage.root],
//         ]);
//         responseAddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.ROUND2),
//             contracts[Contract.ROUND2].contract.address
//         );

//         responseAddressStorage.updateAddress(
//             AddressStorage.calculateIndex(ZkAppEnum.REQUEST),
//             contracts[Contract.REQUEST].contract.address
//         );

//         // Deploy response contract
//         await deploy(feePayerKey, 'ResponseContract', [
//             ['zkApps', responseAddressStorage.root],
//         ]);

//         let requestContract = contracts[Contract.REQUEST]
//             .contract as RequestContract;

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             AccountUpdate.fundNewAccount(feePayerKey.publicKey);
//             requestContract.deploy();
//             requestContract.responeContractAddress.set(
//                 contracts[Contract.REQUEST].contract.address
//             );
//             let feePayerAccount = AccountUpdate.createSigned(
//                 feePayerKey.publicKey
//             );
//             feePayerAccount.send({
//                 to: contracts[Contract.REQUEST].contract,
//                 amount: 10 * 10 ** 9,
//             }); // 10 Mina
//         });
//         await tx
//             .sign([
//                 feePayerKey.privateKey,
//                 contracts[Contract.REQUEST].key.privateKey,
//             ])
//             .send();
//     });

//     it('Should reduce dkg actions and generate new keys', async () => {
//         let dkgContract = contracts[Contract.DKG].contract as DkgContract;
//         let initialActionState = dkgContract.account.actionState.get();
//         let initialKeyCounter = dkgContract.keyCounter.get();
//         let initialKeyStatus = dkgContract.keyStatus.get();
//         for (let i = 0; i < 1; i++) {
//             let action = dkgActions[ActionEnum.GENERATE_KEY][i];
//             let memberWitness = memberStorage.getWitness(
//                 MemberStorage.calculateLevel1Index(committeeIndex),
//                 MemberStorage.calculateLevel2Index(Field(i))
//             );
//             let tx = await Mina.transaction(members[i].publicKey, () => {
//                 dkgContract.committeeAction(
//                     action.committeeId,
//                     action.keyId,
//                     Field(i),
//                     Field(ActionEnum.GENERATE_KEY),
//                     commmitteeAddressStorage.getZkAppRef(
//                         ZkAppEnum.COMMITTEE,
//                         contracts[Contract.COMMITTEE].contract.address
//                     ),
//                     memberWitness
//                 );
//             });
//             await proveAndSend(
//                 tx,
//                 members[i],
//                 'DkgContract',
//                 'committeeAction'
//             );
//             contracts[Contract.DKG].actionStates.push(
//                 dkgContract.account.actionState.get()
//             );
//         }

//         console.log('Generate first step proof RollupDkg...');
//         if (profiling) DKGProfiler.start('RollupDkg.firstStep');
//         let updateKeyProof = await RollupDkg.firstStep(
//             DKGAction.empty(),
//             initialKeyCounter,
//             initialKeyStatus,
//             initialActionState
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         for (let i = 0; i < 1; i++) {
//             let action = dkgActions[ActionEnum.GENERATE_KEY][i];
//             console.log(`Generate step ${i + 1} proof RollupDkg...`);
//             if (profiling) DKGProfiler.start('RollupDkg.nextStepGeneration');
//             updateKeyProof = await RollupDkg.nextStepGeneration(
//                 action,
//                 updateKeyProof,
//                 Field(i),
//                 keyCounterStorage.getWitness(
//                     KeyCounterStorage.calculateLevel1Index(action.committeeId)
//                 ),
//                 keyStatusStorage.getWitness(
//                     KeyStatusStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: Field(i),
//                     })
//                 )
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');

//             keyCounterStorage.updateLeaf(
//                 {
//                     level1Index: KeyCounterStorage.calculateLevel1Index(
//                         action.committeeId
//                     ),
//                 },
//                 KeyCounterStorage.calculateLeaf(Field(i + 1))
//             );

//             keyStatusStorage.updateLeaf(
//                 {
//                     level1Index: KeyStatusStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: Field(i),
//                     }),
//                 },
//                 Provable.switch(action.mask.values, Field, [
//                     Field(KeyStatus.ROUND_1_CONTRIBUTION),
//                     Field(KeyStatus.ROUND_2_CONTRIBUTION),
//                     Field(KeyStatus.ACTIVE),
//                     Field(KeyStatus.DEPRECATED),
//                 ])
//             );
//         }

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             dkgContract.updateKeys(updateKeyProof);
//         });
//         await proveAndSend(tx, feePayerKey, 'DkgContract', 'updateKeys');
//         dkgContract.keyStatus.get().assertEquals(keyStatusStorage.root);
//     });

//     it('Should contribute round 1 successfully', async () => {
//         let round1Contract = contracts[Contract.ROUND1]
//             .contract as Round1Contract;
//         for (let i = 0; i < N; i++) {
//             let secret = generateRandomPolynomial(T, N);
//             secrets.push(secret);
//             let contribution = getRound1Contribution(secret);
//             let action = new Round1Action({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//                 memberId: Field(i),
//                 contribution: contribution,
//             });
//             round1Actions.push(action);

//             let memberWitness = memberStorage.getWitness(
//                 MemberStorage.calculateLevel1Index(committeeIndex),
//                 MemberStorage.calculateLevel2Index(Field(i))
//             );

//             let tx = await Mina.transaction(members[i].publicKey, () => {
//                 round1Contract.contribute(
//                     action.committeeId,
//                     action.keyId,
//                     contribution.C,
//                     round1AddressStorage.getZkAppRef(
//                         ZkAppEnum.COMMITTEE,
//                         contracts[Contract.COMMITTEE].contract.address
//                     ),
//                     memberWitness
//                 );
//             });
//             await proveAndSend(tx, members[i], 'Round1Contract', 'contribute');
//             contracts[Contract.ROUND1].actionStates.push(
//                 round1Contract.account.actionState.get()
//             );
//         }
//         publicKeys.push(
//             calculatePublicKey(round1Actions.map((e) => e.contribution))
//         );
//     });

//     it('Should reduce round 1 successfully', async () => {
//         let round1Contract = contracts[Contract.ROUND1]
//             .contract as Round1Contract;
//         let initialReduceState = round1Contract.reduceState.get();
//         let initialActionState = contracts[Contract.ROUND1].actionStates[0];

//         console.log('Generate first step proof ReduceRound1...');
//         if (profiling) DKGProfiler.start('ReduceRound1.firstStep');
//         let reduceProof = await ReduceRound1.firstStep(
//             round1Actions[0],
//             initialReduceState,
//             initialActionState
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         for (let i = 0; i < N; i++) {
//             let action = round1Actions[i];
//             console.log(`Generate step ${i + 1}  proof ReduceRound1...`);
//             if (profiling) DKGProfiler.start('ReduceRound1.nextStep');
//             reduceProof = await ReduceRound1.nextStep(
//                 action,
//                 reduceProof,
//                 round1ReduceStorage.getWitness(
//                     contracts[Contract.ROUND1].actionStates[i + 1]
//                 )
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');

//             round1ReduceStorage.updateLeaf(
//                 round1ReduceStorage.calculateIndex(
//                     contracts[Contract.ROUND1].actionStates[i + 1]
//                 ),
//                 round1ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
//             );
//         }

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             round1Contract.reduce(reduceProof);
//         });
//         await proveAndSend(tx, feePayerKey, 'Round1Contract', 'reduce');
//     });

//     it('Should finalize round 1 and update key correctly', async () => {
//         let round1Contract = contracts[Contract.ROUND1]
//             .contract as Round1Contract;
//         let initialContributionRoot = round1Contract.contributions.get();
//         let initialPublicKeyRoot = round1Contract.publicKeys.get();
//         let reduceStateRoot = round1Contract.reduceState.get();

//         console.log('Generate first step proof FinalizeRound1...');
//         if (profiling) DKGProfiler.start('FinalizeRound1.firstStep');
//         let finalizeProof = await FinalizeRound1.firstStep(
//             new Round1Input({
//                 previousActionState: Field(0),
//                 action: Round1Action.empty(),
//             }),
//             Field(T),
//             Field(N),
//             initialContributionRoot,
//             initialPublicKeyRoot,
//             reduceStateRoot,
//             Round1ContributionStorage.calculateLevel1Index({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//             }),
//             round1ContributionStorage.getLevel1Witness(
//                 Round1ContributionStorage.calculateLevel1Index({
//                     committeeId: Field(0),
//                     keyId: Field(0),
//                 })
//             ),
//             publicKeyStorage.getLevel1Witness(
//                 PublicKeyStorage.calculateLevel1Index({
//                     committeeId: Field(0),
//                     keyId: Field(0),
//                 })
//             )
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         round1ContributionStorage.updateInternal(
//             Round1ContributionStorage.calculateLevel1Index({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//             }),
//             DKG_LEVEL_2_TREE()
//         );

//         publicKeyStorage.updateInternal(
//             PublicKeyStorage.calculateLevel1Index({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//             }),
//             DKG_LEVEL_2_TREE()
//         );

//         for (let i = 0; i < N; i++) {
//             let action = round1Actions[i];
//             console.log(`Generate step ${i + 1} proof FinalizeRound1...`);
//             if (profiling) DKGProfiler.start('FinalizeRound1.nextStep');
//             finalizeProof = await FinalizeRound1.nextStep(
//                 new Round1Input({
//                     previousActionState:
//                         contracts[Contract.ROUND1].actionStates[i],
//                     action: action,
//                 }),
//                 finalizeProof,
//                 round1ContributionStorage.getWitness(
//                     Round1ContributionStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: action.keyId,
//                     }),
//                     Round1ContributionStorage.calculateLevel2Index(Field(i))
//                 ),
//                 publicKeyStorage.getWitness(
//                     PublicKeyStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: action.keyId,
//                     }),
//                     PublicKeyStorage.calculateLevel2Index(Field(i))
//                 ),
//                 round1ReduceStorage.getWitness(
//                     contracts[Contract.ROUND1].actionStates[i + 1]
//                 )
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');

//             round1ContributionStorage.updateLeaf(
//                 {
//                     level1Index: Round1ContributionStorage.calculateLevel1Index(
//                         {
//                             committeeId: action.committeeId,
//                             keyId: action.keyId,
//                         }
//                     ),
//                     level2Index: Round1ContributionStorage.calculateLevel2Index(
//                         action.memberId
//                     ),
//                 },
//                 Round1ContributionStorage.calculateLeaf(action.contribution)
//             );

//             publicKeyStorage.updateLeaf(
//                 {
//                     level1Index: PublicKeyStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: action.keyId,
//                     }),
//                     level2Index: PublicKeyStorage.calculateLevel2Index(
//                         action.memberId
//                     ),
//                 },
//                 PublicKeyStorage.calculateLeaf(
//                     action.contribution.C.get(Field(0))
//                 )
//             );
//         }

//         finalizeProof.publicOutput.publicKey.assertEquals(publicKeys[0]);

//         let dkgContract = contracts[Contract.DKG].contract as DkgContract;
//         let initialDKGActionState = dkgContract.account.actionState.get();
//         let initialKeyCounter = dkgContract.keyCounter.get();
//         let initialKeyStatus = dkgContract.keyStatus.get();
//         let action = new DKGAction({
//             committeeId: committeeIndex,
//             keyId: Field(0),
//             mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_1],
//         });
//         dkgActions[ActionEnum.FINALIZE_ROUND_1].push(action);

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             round1Contract.finalize(
//                 finalizeProof,
//                 round1AddressStorage.getZkAppRef(
//                     ZkAppEnum.COMMITTEE,
//                     contracts[Contract.COMMITTEE].contract.address
//                 ),
//                 round1AddressStorage.getZkAppRef(
//                     ZkAppEnum.DKG,
//                     contracts[Contract.DKG].contract.address
//                 ),
//                 settingStorage.getWitness(committeeIndex),
//                 keyStatusStorage.getWitness(
//                     KeyStatusStorage.calculateLevel1Index({
//                         committeeId: Field(0),
//                         keyId: Field(0),
//                     })
//                 )
//             );
//         });
//         await proveAndSend(tx, feePayerKey, 'Round1Contract', 'finalize');
//         contracts[Contract.DKG].actionStates.push(
//             dkgContract.account.actionState.get()
//         );

//         console.log('Generate first step proof RollupDkg...');
//         if (profiling) DKGProfiler.start('RollupDkg.firstStep');
//         let updateKeyProof = await RollupDkg.firstStep(
//             DKGAction.empty(),
//             initialKeyCounter,
//             initialKeyStatus,
//             initialDKGActionState
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         console.log(`Generate next step proof RollupDkg...`);
//         if (profiling) DKGProfiler.start('RollupDkg.nextStep');
//         updateKeyProof = await RollupDkg.nextStep(
//             action,
//             updateKeyProof,
//             keyStatusStorage.getWitness(
//                 KeyStatusStorage.calculateLevel1Index({
//                     committeeId: action.committeeId,
//                     keyId: action.keyId,
//                 })
//             )
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         keyStatusStorage.updateLeaf(
//             {
//                 level1Index: KeyStatusStorage.calculateLevel1Index({
//                     committeeId: action.committeeId,
//                     keyId: action.keyId,
//                 }),
//             },
//             Provable.switch(action.mask.values, Field, [
//                 Field(KeyStatus.ROUND_1_CONTRIBUTION),
//                 Field(KeyStatus.ROUND_2_CONTRIBUTION),
//                 Field(KeyStatus.ACTIVE),
//                 Field(KeyStatus.DEPRECATED),
//             ])
//         );

//         tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             dkgContract.updateKeys(updateKeyProof);
//         });
//         await proveAndSend(tx, feePayerKey, 'DkgContract', 'updateKeys');
//         dkgContract.keyStatus.get().assertEquals(keyStatusStorage.root);
//     });

//     it('Should contribute round 2 successfully', async () => {
//         let round2Contract = contracts[Contract.ROUND2]
//             .contract as Round2Contract;
//         for (let i = 0; i < N; i++) {
//             let randoms = [...Array(N).keys()].map(() => Scalar.random());
//             let round2Contribution = getRound2Contribution(
//                 secrets[i],
//                 i,
//                 round1Actions.map((e) => e.contribution),
//                 randoms
//             );
//             let action = new Round2Action({
//                 committeeId: committeeIndex,
//                 keyId: Field(0),
//                 memberId: Field(i),
//                 contribution: round2Contribution,
//             });
//             round2Actions.push(action);

//             console.log(`Generate proof BatchEncryption...`);
//             if (profiling) DKGProfiler.start('BatchEncryption.encrypt');
//             let encryptionProof = await BatchEncryption.encrypt(
//                 new BatchEncryptionInput({
//                     publicKeys: new CArray(
//                         round1Actions.map((e) => e.contribution.C.get(Field(0)))
//                     ),
//                     c: action.contribution.c,
//                     U: action.contribution.U,
//                     memberId: Field(i),
//                 }),
//                 new PlainArray(
//                     secrets[i].f.map((e) => CustomScalar.fromScalar(e))
//                 ),
//                 new RandomArray(randoms.map((e) => CustomScalar.fromScalar(e)))
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');
//             encryptionProofs.push(encryptionProof);

//             let memberWitness = memberStorage.getWitness(
//                 MemberStorage.calculateLevel1Index(committeeIndex),
//                 MemberStorage.calculateLevel2Index(Field(i))
//             );

//             let tx = await Mina.transaction(members[i].publicKey, () => {
//                 round2Contract.contribute(
//                     action.committeeId,
//                     action.keyId,
//                     encryptionProof,
//                     round2AddressStorage.getZkAppRef(
//                         ZkAppEnum.COMMITTEE,
//                         contracts[Contract.COMMITTEE].contract.address
//                     ),
//                     round2AddressStorage.getZkAppRef(
//                         ZkAppEnum.ROUND1,
//                         contracts[Contract.ROUND1].contract.address
//                     ),
//                     memberWitness,
//                     publicKeyStorage.getLevel1Witness(
//                         PublicKeyStorage.calculateLevel1Index({
//                             committeeId: committeeIndex,
//                             keyId: Field(0),
//                         })
//                     )
//                 );
//             });
//             await proveAndSend(tx, members[i], 'Round2Contract', 'contribute');
//             contracts[Contract.ROUND2].actionStates.push(
//                 round2Contract.account.actionState.get()
//             );
//         }
//     });

//     it('Should reduce round 2 successfully', async () => {
//         let round2Contract = contracts[Contract.ROUND2]
//             .contract as Round2Contract;
//         let initialReduceState = round2Contract.reduceState.get();
//         let initialActionState = contracts[Contract.ROUND2].actionStates[0];

//         console.log('Generate first step proof ReduceRound2...');
//         if (profiling) DKGProfiler.start('ReduceRound2.firstStep');
//         let reduceProof = await ReduceRound2.firstStep(
//             round2Actions[0],
//             initialReduceState,
//             initialActionState
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         for (let i = 0; i < N; i++) {
//             let action = round2Actions[i];
//             console.log(`Generate step ${i + 1} proof ReduceRound2...`);
//             if (profiling) DKGProfiler.start('ReduceRound2.nextStep');
//             reduceProof = await ReduceRound2.nextStep(
//                 action,
//                 reduceProof,
//                 round2ReduceStorage.getWitness(
//                     contracts[Contract.ROUND2].actionStates[i + 1]
//                 )
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');

//             round2ReduceStorage.updateLeaf(
//                 round2ReduceStorage.calculateIndex(
//                     contracts[Contract.ROUND2].actionStates[i + 1]
//                 ),
//                 round2ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
//             );
//         }

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             round2Contract.reduce(reduceProof);
//         });
//         await proveAndSend(tx, feePayerKey, 'Round2Contract', 'reduce');
//     });

//     it('Should finalize round 2 and update key correctly', async () => {
//         let round2Contract = contracts[Contract.ROUND2]
//             .contract as Round2Contract;
//         let initialContributionRoot = round2Contract.contributions.get();
//         let reduceStateRoot = round2Contract.reduceState.get();
//         let initialHashArray = new EncryptionHashArray(
//             [...Array(N).keys()].map(() => Field(0))
//         );

//         console.log('Generate first step proof FinalizeRound2...');
//         if (profiling) DKGProfiler.start('FinalizeRound2.firstStep');
//         let finalizeProof = await FinalizeRound2.firstStep(
//             new Round2Input({
//                 previousActionState: Field(0),
//                 action: Round2Action.empty(),
//             }),
//             Field(T),
//             Field(N),
//             initialContributionRoot,
//             reduceStateRoot,
//             Round2ContributionStorage.calculateLevel1Index({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//             }),
//             initialHashArray,
//             round2ContributionStorage.getLevel1Witness(
//                 Round2ContributionStorage.calculateLevel1Index({
//                     committeeId: committeeIndex,
//                     keyId: Field(0),
//                 })
//             )
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         round2ContributionStorage.updateInternal(
//             Round2ContributionStorage.calculateLevel1Index({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//             }),
//             DKG_LEVEL_2_TREE()
//         );

//         encryptionStorage.updateInternal(
//             EncryptionStorage.calculateLevel1Index({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//             }),
//             DKG_LEVEL_2_TREE()
//         );

//         for (let i = 0; i < N; i++) {
//             let action = round2Actions[i];
//             console.log(`Generate step ${i + 1} proof FinalizeRound2...`);
//             if (profiling) DKGProfiler.start('FinalizeRound2.nextStep');
//             finalizeProof = await FinalizeRound2.nextStep(
//                 new Round2Input({
//                     previousActionState:
//                         contracts[Contract.ROUND2].actionStates[i],
//                     action: action,
//                 }),
//                 finalizeProof,
//                 round2ContributionStorage.getWitness(
//                     Round2ContributionStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: action.keyId,
//                     }),
//                     Round2ContributionStorage.calculateLevel2Index(
//                         action.memberId
//                     )
//                 ),
//                 round2ReduceStorage.getWitness(
//                     round2ReduceStorage.calculateIndex(
//                         contracts[Contract.ROUND2].actionStates[i + 1]
//                     )
//                 )
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');

//             round2ContributionStorage.updateLeaf(
//                 {
//                     level1Index: Round2ContributionStorage.calculateLevel1Index(
//                         {
//                             committeeId: action.committeeId,
//                             keyId: action.keyId,
//                         }
//                     ),
//                     level2Index: Round2ContributionStorage.calculateLevel2Index(
//                         action.memberId
//                     ),
//                 },
//                 Round2ContributionStorage.calculateLeaf(action.contribution)
//             );

//             encryptionStorage.updateLeaf(
//                 {
//                     level1Index: EncryptionStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: action.keyId,
//                     }),
//                     level2Index: EncryptionStorage.calculateLevel2Index(
//                         action.memberId
//                     ),
//                 },
//                 EncryptionStorage.calculateLeaf({
//                     contributions: round2Actions.map((e) => e.contribution),
//                     memberId: action.memberId,
//                 })
//             );
//         }

//         let dkgContract = contracts[Contract.DKG].contract as DkgContract;
//         let initialDKGActionState = dkgContract.account.actionState.get();
//         let initialKeyCounter = dkgContract.keyCounter.get();
//         let initialKeyStatus = dkgContract.keyStatus.get();
//         let action = new DKGAction({
//             committeeId: committeeIndex,
//             keyId: Field(0),
//             mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_2],
//         });
//         dkgActions[ActionEnum.FINALIZE_ROUND_2].push(action);

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             round2Contract.finalize(
//                 finalizeProof,
//                 encryptionStorage.getLevel1Witness(
//                     EncryptionStorage.calculateLevel1Index({
//                         committeeId: committeeIndex,
//                         keyId: Field(0),
//                     })
//                 ),
//                 round2AddressStorage.getZkAppRef(
//                     ZkAppEnum.COMMITTEE,
//                     contracts[Contract.COMMITTEE].contract.address
//                 ),
//                 round2AddressStorage.getZkAppRef(
//                     ZkAppEnum.DKG,
//                     contracts[Contract.DKG].contract.address
//                 ),
//                 settingStorage.getWitness(committeeIndex),
//                 keyStatusStorage.getWitness(
//                     KeyStatusStorage.calculateLevel1Index({
//                         committeeId: Field(0),
//                         keyId: Field(0),
//                     })
//                 )
//             );
//         });
//         await proveAndSend(tx, feePayerKey, 'Round2Contract', 'finalize');
//         contracts[Contract.DKG].actionStates.push(
//             dkgContract.account.actionState.get()
//         );

//         console.log('Generate first step proof RollupDkg...');
//         if (profiling) DKGProfiler.start('RollupDkg.firstStep');
//         let updateKeyProof = await RollupDkg.firstStep(
//             DKGAction.empty(),
//             initialKeyCounter,
//             initialKeyStatus,
//             initialDKGActionState
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         console.log(`Generate next step proof RollupDkg...`);
//         if (profiling) DKGProfiler.start('RollupDkg.nextStep');
//         updateKeyProof = await RollupDkg.nextStep(
//             action,
//             updateKeyProof,
//             keyStatusStorage.getWitness(
//                 KeyStatusStorage.calculateLevel1Index({
//                     committeeId: action.committeeId,
//                     keyId: action.keyId,
//                 })
//             )
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         keyStatusStorage.updateLeaf(
//             {
//                 level1Index: KeyStatusStorage.calculateLevel1Index({
//                     committeeId: action.committeeId,
//                     keyId: action.keyId,
//                 }),
//             },
//             Provable.switch(action.mask.values, Field, [
//                 Field(KeyStatus.ROUND_1_CONTRIBUTION),
//                 Field(KeyStatus.ROUND_2_CONTRIBUTION),
//                 Field(KeyStatus.ACTIVE),
//                 Field(KeyStatus.DEPRECATED),
//             ])
//         );

//         tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             dkgContract.updateKeys(updateKeyProof);
//         });
//         await proveAndSend(tx, feePayerKey, 'DkgContract', 'updateKeys');
//         dkgContract.keyStatus.get().assertEquals(keyStatusStorage.root);
//     });

//     it('Should contribute response successfully', async () => {
//         let responseContract = contracts[Contract.RESPONSE]
//             .contract as ResponseContract;
//         for (let i = 0; i < mockRequests.length; i++) {
//             let encryptedVector = generateEncryption(
//                 calculatePublicKey(round1Actions.map((e) => e.contribution)),
//                 mockRequests[i]
//             );
//             R.push(encryptedVector.R);
//             M.push(encryptedVector.M);
//         }

//         let accumulatedEncryption = accumulateEncryption(R, M);
//         sumR = accumulatedEncryption.sumR;
//         sumM = accumulatedEncryption.sumM;

//         for (let i = 0; i < T; i++) {
//             let memberId = responsedMembers[i];
//             let [contribution, ski] = getResponseContribution(
//                 secrets[memberId],
//                 memberId,
//                 round2Actions.map(
//                     (e) =>
//                         ({
//                             c: e.contribution.c.get(Field(memberId)),
//                             U: e.contribution.U.get(Field(memberId)),
//                         } as Round2Data)
//                 ),
//                 sumR
//             );
//             let action = new ResponseAction({
//                 committeeId: Field(0),
//                 keyId: Field(0),
//                 memberId: Field(memberId),
//                 requestId: requestId,
//                 contribution: contribution,
//             });
//             responseActions.push(action);

//             D.push(contribution.D.values);

//             console.log(`Generate proof BatchDecryption...`);
//             if (profiling) DKGProfiler.start('BatchDecryption.decrypt');
//             let decryptionProof = await BatchDecryption.decrypt(
//                 new BatchDecryptionInput({
//                     publicKey: secrets[memberId].C[0],
//                     c: new cArray(
//                         round2Actions.map((e) =>
//                             e.contribution.c.get(Field(memberId))
//                         )
//                     ),
//                     U: new UArray(
//                         round2Actions.map((e) =>
//                             e.contribution.U.get(Field(memberId))
//                         )
//                     ),
//                     memberId: Field(memberId),
//                 }),
//                 new PlainArray(
//                     secrets.map((e) => CustomScalar.fromScalar(e.f[memberId]))
//                 ),
//                 secrets[memberId].a[0]
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');
//             decryptionProofs.push(decryptionProof);

//             let memberWitness = memberStorage.getWitness(
//                 MemberStorage.calculateLevel1Index(committeeIndex),
//                 MemberStorage.calculateLevel2Index(Field(memberId))
//             );

//             let tx = await Mina.transaction(
//                 members[responsedMembers[i]].publicKey,
//                 () => {
//                     responseContract.contribute(
//                         action.committeeId,
//                         action.keyId,
//                         action.requestId,
//                         decryptionProof,
//                         new RArray(sumR),
//                         ski,
//                         responseAddressStorage.getZkAppRef(
//                             ZkAppEnum.COMMITTEE,
//                             contracts[Contract.COMMITTEE].contract.address
//                         ),
//                         responseAddressStorage.getZkAppRef(
//                             ZkAppEnum.ROUND1,
//                             contracts[Contract.ROUND1].contract.address
//                         ),
//                         responseAddressStorage.getZkAppRef(
//                             ZkAppEnum.ROUND2,
//                             contracts[Contract.ROUND2].contract.address
//                         ),
//                         memberWitness,
//                         publicKeyStorage.getWitness(
//                             PublicKeyStorage.calculateLevel1Index({
//                                 committeeId: action.committeeId,
//                                 keyId: action.keyId,
//                             }),
//                             PublicKeyStorage.calculateLevel2Index(
//                                 action.memberId
//                             )
//                         ),
//                         encryptionStorage.getWitness(
//                             EncryptionStorage.calculateLevel1Index({
//                                 committeeId: action.committeeId,
//                                 keyId: action.keyId,
//                             }),
//                             EncryptionStorage.calculateLevel2Index(
//                                 action.memberId
//                             )
//                         )
//                     );
//                 }
//             );
//             await proveAndSend(
//                 tx,
//                 members[responsedMembers[i]],
//                 'ResponseContract',
//                 'contribute'
//             );
//             contracts[Contract.RESPONSE].actionStates.push(
//                 responseContract.account.actionState.get()
//             );
//         }
//     });

//     it('Should reduce response successfully', async () => {
//         let responseContract = contracts[Contract.RESPONSE]
//             .contract as ResponseContract;
//         let initialReduceState = responseContract.reduceState.get();
//         let initialActionState = contracts[Contract.RESPONSE].actionStates[0];

//         console.log('Generate first step proof ReduceResponse...');
//         if (profiling) DKGProfiler.start('ReduceResponse.firstStep');
//         let reduceProof = await ReduceResponse.firstStep(
//             responseActions[0],
//             initialReduceState,
//             initialActionState
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         for (let i = 0; i < T; i++) {
//             let action = responseActions[i];
//             console.log(`Generate step ${i + 1} proof ReduceResponse...`);
//             if (profiling) DKGProfiler.start('ReduceResponse.nextStep');
//             reduceProof = await ReduceResponse.nextStep(
//                 action,
//                 reduceProof,
//                 responseReduceStorage.getWitness(
//                     contracts[Contract.RESPONSE].actionStates[i + 1]
//                 )
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');

//             responseReduceStorage.updateLeaf(
//                 responseReduceStorage.calculateIndex(
//                     contracts[Contract.RESPONSE].actionStates[i + 1]
//                 ),
//                 responseReduceStorage.calculateLeaf(ActionStatus.REDUCED)
//             );
//         }

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             responseContract.reduce(reduceProof);
//         });
//         await proveAndSend(tx, feePayerKey, 'ResponseContract', 'reduce');
//     });

//     it('Should complete response correctly', async () => {
//         let responseContract = contracts[Contract.RESPONSE]
//             .contract as ResponseContract;
//         let initialContributionRoot = responseContract.contributions.get();
//         let reduceStateRoot = responseContract.reduceState.get();

//         console.log('Generate first step proof FinalizeResponse...');
//         if (profiling) DKGProfiler.start('FinalizeResponse.firstStep');
//         let completeProof = await FinalizeResponse.firstStep(
//             new ResponseInput({
//                 previousActionState: Field(0),
//                 action: ResponseAction.empty(),
//             }),
//             Field(T),
//             Field(N),
//             initialContributionRoot,
//             reduceStateRoot,
//             requestId,
//             Field(mockResult.length),
//             packIndexArray(responsedMembers),
//             responseContributionStorage.getLevel1Witness(
//                 ResponseContributionStorage.calculateLevel1Index(requestId)
//             )
//         );
//         if (profiling) DKGProfiler.stop();
//         console.log('DONE!');

//         responseContributionStorage.updateInternal(
//             ResponseContributionStorage.calculateLevel1Index(requestId),
//             DKG_LEVEL_2_TREE()
//         );

//         for (let i = 0; i < T; i++) {
//             logMemUsage();
//             let action = responseActions[i];
//             console.log(`Generate step ${i + 1} proof FinalizeResponse...`);
//             if (profiling) DKGProfiler.start('FinalizeResponse.nextStep');
//             completeProof = await FinalizeResponse.nextStep(
//                 new ResponseInput({
//                     previousActionState:
//                         contracts[Contract.RESPONSE].actionStates[i],
//                     action: action,
//                 }),
//                 completeProof,
//                 responseContributionStorage.getWitness(
//                     ResponseContributionStorage.calculateLevel1Index(requestId),
//                     ResponseContributionStorage.calculateLevel2Index(
//                         action.memberId
//                     )
//                 ),
//                 responseReduceStorage.getWitness(
//                     responseReduceStorage.calculateIndex(
//                         contracts[Contract.RESPONSE].actionStates[i + 1]
//                     )
//                 )
//             );
//             if (profiling) DKGProfiler.stop();
//             console.log('DONE!');

//             responseContributionStorage.updateLeaf(
//                 {
//                     level1Index:
//                         ResponseContributionStorage.calculateLevel1Index(
//                             requestId
//                         ),
//                     level2Index:
//                         ResponseContributionStorage.calculateLevel2Index(
//                             action.memberId
//                         ),
//                 },
//                 ResponseContributionStorage.calculateLeaf(action.contribution)
//             );
//         }

//         let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//             responseContract.complete(
//                 completeProof,
//                 responseAddressStorage.getZkAppRef(
//                     ZkAppEnum.COMMITTEE,
//                     contracts[Contract.COMMITTEE].contract.address
//                 ),
//                 responseAddressStorage.getZkAppRef(
//                     ZkAppEnum.DKG,
//                     contracts[Contract.DKG].contract.address
//                 ),
//                 responseAddressStorage.getZkAppRef(
//                     ZkAppEnum.REQUEST,
//                     contracts[Contract.REQUEST].contract.address
//                 ),
//                 settingStorage.getWitness(committeeIndex),
//                 keyStatusStorage.getWitness(
//                     KeyStatusStorage.calculateLevel1Index({
//                         committeeId: Field(0),
//                         keyId: Field(0),
//                     })
//                 )
//             );
//         });
//         await proveAndSend(tx, feePayerKey, 'ResponseContract', 'complete');

//         // let resultVector = getResultVector(responsedMembers, D, sumM);
//         // let result = Array<Group>(mockResult.length);
//         // for (let i = 0; i < result.length; i++) {
//         //   result[i] = sumM[i].sub(completeProof.publicOutput.D.get(Field(i)));
//         //   result[i].assertEquals(resultVector[i]);
//         // }
//     });

//     afterAll(async () => {
//         if (profiling) DKGProfiler.store();
//     });
// });
