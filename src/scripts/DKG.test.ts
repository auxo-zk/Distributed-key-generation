// import {
//   Field,
//   Mina,
//   AccountUpdate,
//   PrivateKey,
//   PublicKey,
//   Provable,
//   Reducer,
// } from 'o1js';

// import { getProfiler } from './helper/profiler.js';
// import randomAccounts from './helper/randomAccounts.js';
// import {
//   CompleteResponse,
//   DKGContract,
//   UpdateKey,
//   FinalizeRound1,
//   FinalizeRound2,
//   ReduceActions,
//   EMPTY_LEVEL_1_TREE as DKG_LEVEL_1_TREE,
//   EMPTY_LEVEL_2_TREE as DKG_LEVEL_2_TREE,
//   Action,
//   ReduceInput,
//   ActionStatus,
//   KeyUpdateInput,
//   Round1Input,
//   PublicKeyArray,
//   Round2Input,
// } from '../contracts/DKG.js';
// import { BatchDecryption, BatchEncryption } from '../contracts/Encryption.js';
// import { Config, Key } from './helper/config.js';
// import fs from 'fs';
// import {
//   CommitteeContract,
//   CreateCommittee,
//   EMPTY_LEVEL_1_TREE as COMMITTEE_LEVEL_1_TREE,
//   EMPTY_LEVEL_2_TREE as COMMITTEE_LEVEL_2_TREE,
//   Level2Witness,
//   Level1Witness,
// } from '../contracts/Committee.js';
// import {
//   MemberStorage,
//   SettingStorage,
// } from '../contracts/CommitteeStorage.js';
// import { ZkAppStorage } from '../contracts/ZkAppStorage.js';
// import { ActionEnum } from '../contracts/DKG.js';
// import {
//   ResponseContribution,
//   Round1Contribution,
//   Round2Contribution,
//   SecretPolynomial,
// } from '../libs/Committee.js';
// import { getZkAppRef } from '../libs/ZkAppRef.js';
// import {
//   KeyStatusStorage,
//   PublicKeyStorage,
//   ResponseContributionStorage,
//   RollupStateStorage,
//   Round1ContributionStorage,
//   Round2ContributionStorage,
// } from '../contracts/DKGStorage.js';
// import { Committee } from '../libs/index.js';

// describe('DKG', () => {
//   const doProofs = true;
//   let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
//   let feePayerKey: Key;
//   let committeeKey: Key;
//   let dkgKey: Key;
//   let committeeContract: CommitteeContract;
//   let dkgContract: DKGContract;
//   let memberStorage = new MemberStorage(COMMITTEE_LEVEL_1_TREE(), []);
//   let settingStorage = new SettingStorage(COMMITTEE_LEVEL_1_TREE());
//   let zkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE());
//   let rollupStorage = new RollupStateStorage(DKG_LEVEL_1_TREE());
//   let keyStatusStorage = new KeyStatusStorage(DKG_LEVEL_1_TREE());
//   let publicKeyStorage = new PublicKeyStorage(DKG_LEVEL_1_TREE(), []);
//   let round1Storage = new Round1ContributionStorage(DKG_LEVEL_1_TREE(), []);
//   let round2Storage = new Round2ContributionStorage(DKG_LEVEL_1_TREE(), []);
//   let responseStorage = new ResponseContributionStorage(DKG_LEVEL_1_TREE(), []);
//   let members: Key[] = Local.testAccounts.slice(1, 6);
//   let committeeIndex = Field(0);
//   let secrets: SecretPolynomial[] = [];
//   let publicKeys: PublicKey[] = [];
//   let actionStates: Field[] = [Reducer.initialActionState];
//   let numberOfActions = 0;

//   const ACTIONS = {
//     [ActionEnum.GENERATE_KEY]: [
//       new Action({
//         enum: Field(ActionEnum.GENERATE_KEY),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(0),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.GENERATE_KEY),
//         committeeId: Field(0),
//         keyId: Field(1),
//         memberId: Field(1),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.GENERATE_KEY),
//         committeeId: Field(0),
//         keyId: Field(2),
//         memberId: Field(2),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//     ],
//     [ActionEnum.CONTRIBUTE_ROUND_1]: [
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(0),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(1),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(2),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(3),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(4),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//     ],
//     [ActionEnum.CONTRIBUTE_ROUND_2]: [
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(0),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(1),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(2),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(3),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(4),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//     ],
//     [ActionEnum.CONTRIBUTE_RESPONSE]: [
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(0),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(1),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(2),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(3),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//       new Action({
//         enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(4),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//     ],
//     [ActionEnum.DEPRECATE_KEY]: [
//       new Action({
//         enum: Field(ActionEnum.DEPRECATE_KEY),
//         committeeId: Field(0),
//         keyId: Field(0),
//         memberId: Field(0),
//         requestId: Field(0),
//         round1Contribution: Round1Contribution.empty(),
//         round2Contribution: Round2Contribution.empty(),
//         responseContribution: ResponseContribution.empty(),
//       }),
//     ],
//   };

//   // const DKGProfiler = getProfiler('Benchmark DKG');
//   // DKGProfiler.start('DKG test flow');

//   beforeAll(async () => {
//     Mina.setActiveInstance(Local);
//     let configJson: Config = JSON.parse(
//       await fs.readFileSync('config.json', 'utf8')
//     );
//     let dkgConfig = configJson.deployAliases['dkg'];
//     let committeeConfig = configJson.deployAliases['committee'];

//     // let feePayerKeysBase58: { privateKey: string; publicKey: string } =
//     //   JSON.parse(await fs.readFileSync(dkgConfig.feepayerKeyPath, 'utf8'));
//     feePayerKey = {
//       privateKey: Local.testAccounts[0].privateKey,
//       publicKey: Local.testAccounts[0].publicKey,
//     };

//     let dkgKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
//       await fs.readFileSync(dkgConfig.keyPath, 'utf8')
//     );
//     dkgKey = {
//       privateKey: PrivateKey.fromBase58(dkgKeysBase58.privateKey),
//       publicKey: PublicKey.fromBase58(dkgKeysBase58.publicKey),
//     };

//     let committeeKeysBase58: { privateKey: string; publicKey: string } =
//       JSON.parse(await fs.readFileSync(committeeConfig.keyPath, 'utf8'));
//     committeeKey = {
//       privateKey: PrivateKey.fromBase58(committeeKeysBase58.privateKey),
//       publicKey: PublicKey.fromBase58(committeeKeysBase58.publicKey),
//     };

//     committeeContract = new CommitteeContract(committeeKey.publicKey);
//     dkgContract = new DKGContract(dkgKey.publicKey);
//   });

//   it('Should compile all ZK programs', async () => {
//     console.log('Compiling CreateCommittee...');
//     await CreateCommittee.compile();
//     console.log('Done!');
//     console.log('Compiling CommitteeContract...');
//     await CommitteeContract.compile();
//     console.log('Done!');

//     console.log('Compiling ReduceActions...');
//     // DKGProfiler.start('ReduceActions.compile');
//     await ReduceActions.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//     console.log('Compiling UpdateKey...');
//     // DKGProfiler.start('UpdateKey.compile');
//     await UpdateKey.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//     console.log('Compiling FinalizeRound1...');
//     // DKGProfiler.start('FinalizeRound1.compile');
//     await FinalizeRound1.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//     console.log('Compiling BatchEncryption...');
//     // DKGProfiler.start('BatchEncryption.compile');
//     await BatchEncryption.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//     console.log('Compiling FinalizeRound2...');
//     // DKGProfiler.start('FinalizeRound2.compile');
//     await FinalizeRound2.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//     console.log('Compiling BatchDecryption...');
//     // DKGProfiler.start('BatchDecryption.compile');
//     await BatchDecryption.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//     console.log('Compiling CompleteResponse...');
//     // DKGProfiler.start('CompleteResponse.compile');
//     await CompleteResponse.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//     console.log('Compiling DKGContract...');
//     // DKGProfiler.start('DKGContract.compile');
//     await DKGContract.compile();
//     // DKGProfiler.stop();
//     console.log('Done!');
//   }, 1200000);

//   it('Should deploy committee and dkg contract with mock states', async () => {
//     let memberTree = COMMITTEE_LEVEL_2_TREE();
//     for (let i = 0; i < members.length; i++) {
//       memberTree.setLeaf(
//         BigInt(i),
//         memberStorage.calculateLeaf(members[i].publicKey)
//       );
//     }
//     Provable.log('Members tree:', memberTree.getRoot());
//     memberStorage.level1.set(committeeIndex, memberTree.getRoot());
//     memberStorage.level2s[committeeIndex.toString()] = memberTree;
//     settingStorage.level1.set(
//       committeeIndex,
//       settingStorage.calculateLeaf({ T: Field(3), N: Field(5) })
//     );

//     console.log('Deploy CommitteeContract...');
//     let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//       AccountUpdate.fundNewAccount(feePayerKey.publicKey, 1);
//       committeeContract.deploy();
//       committeeContract.nextCommitteeId.set(committeeIndex.add(Field(1)));
//       committeeContract.memberTreeRoot.set(memberStorage.level1.getRoot());
//       committeeContract.settingTreeRoot.set(settingStorage.level1.getRoot());
//     });
//     await tx.sign([feePayerKey.privateKey, committeeKey.privateKey]).send();
//     console.log('CommitteeContract deployed!');

//     zkAppStorage.addressMap.set(
//       zkAppStorage.calculateIndex('committee'),
//       zkAppStorage.calculateLeaf(committeeKey.publicKey)
//     );

//     console.log('Deploy DKGContract...');
//     tx = await Mina.transaction(feePayerKey.publicKey, () => {
//       AccountUpdate.fundNewAccount(feePayerKey.publicKey, 1);
//       dkgContract.deploy();
//       dkgContract.zkApps.set(zkAppStorage.addressMap.getRoot());
//     });
//     await tx.sign([feePayerKey.privateKey, dkgKey.privateKey]).send();
//     console.log('DKGContract deployed!');
//   });

//   it('Should reduce actions', async () => {
//     let initialActionState = dkgContract.account.actionState.get();
//     let initialRollupState = dkgContract.rollupState.get();
//     let actions = [];
//     Provable.log('Member tree root:', memberStorage.level1.get(committeeIndex));
//     let memberTree = memberStorage.level2s[committeeIndex.toString()];
//     Provable.log('Member tree root:', memberTree.getRoot());
//     for (let i = 0; i < 3; i++) {
//       let action = ACTIONS[ActionEnum.GENERATE_KEY][i];
//       actions.push(action);
//       // FIXME - storage api doesn't work
//       // let memberWitness = memberStorage.getWitness({
//       //   level1Index: memberStorage.calculateLevel1Index(committeeIndex),
//       //   level2Index: memberStorage.calculateLevel2Index(Field(i)),
//       // });
//       let tx = await Mina.transaction(members[i].publicKey, () => {
//         dkgContract.committeeAction(
//           action,
//           getZkAppRef(
//             zkAppStorage.addressMap,
//             'committee',
//             committeeKey.publicKey
//           ),
//           new Level2Witness(memberTree.getWitness(Field(i).toBigInt())),
//           memberStorage.level1.getWitness(committeeIndex) as Level1Witness
//         );
//       });
//       await tx.prove();
//       await tx.sign([members[i].privateKey]).send();
//       actionStates.push(dkgContract.account.actionState.get());
//     }

//     console.log('DKG rollup state:', initialRollupState);

//     let reduceProof = await ReduceActions.firstStep(
//       new ReduceInput({
//         initialRollupState: dkgContract.rollupState.get(),
//         action: Action.empty(),
//       }),
//       initialActionState
//     );

//     for (let i = 0; i < 3; i++) {
//       let action = actions[i];
//       reduceProof = await ReduceActions.nextStep(
//         new ReduceInput({
//           initialRollupState: initialRollupState,
//           action: action,
//         }),
//         reduceProof,
//         rollupStorage.getWitness(
//           rollupStorage.calculateLevel1Index(actionStates[i + 1])
//         )
//       );

//       rollupStorage.level1.set(
//         actionStates[i + 1],
//         rollupStorage.calculateLeaf(ActionStatus.REDUCED)
//       );
//     }

//     let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//       dkgContract.reduce(reduceProof);
//     });
//     await tx.prove();
//     await tx.sign([feePayerKey.privateKey]).send();
//   });

//   xit('Should generate new keys', async () => {
//     let initialKeyStatus = dkgContract.keyStatus.get();
//     let initialRollupState = dkgContract.rollupState.get();

//     let generateKeyProof = await UpdateKey.firstStep(
//       new KeyUpdateInput({
//         initialKeyStatus: initialKeyStatus,
//         initialRollupState: initialRollupState,
//         previousActionState: Field(0),
//         action: Action.empty(),
//       })
//     );

//     for (let i = 0; i < 3; i++) {
//       let action = ACTIONS[ActionEnum.GENERATE_KEY][i];
//       generateKeyProof = await UpdateKey.nextStep(
//         new KeyUpdateInput({
//           initialKeyStatus: initialKeyStatus,
//           initialRollupState: initialRollupState,
//           previousActionState: actionStates[i],
//           action: action,
//         }),
//         generateKeyProof,
//         keyStatusStorage.getWitness(
//           keyStatusStorage.calculateLevel1Index({
//             committeeId: action.committeeId,
//             keyId: action.keyId,
//           })
//         ),
//         rollupStorage.getWitness(
//           rollupStorage.calculateLevel1Index(actionStates[i + 1])
//         )
//       );
//       let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//         dkgContract.updateKeys(generateKeyProof);
//       });
//       await tx.prove();
//       await tx.sign([feePayerKey.privateKey]).send();
//       rollupStorage.level1.set(
//         actionStates[i + 1],
//         rollupStorage.calculateLeaf(ActionStatus.ROLLUPED)
//       );
//     }
//   });

//   xit('Should contribute round 1 successfully', async () => {
//     let round1Contributions: Round1Contribution[] = [];
//     for (let i = 0; i < 5; i++) {
//       let secret = Committee.generateRandomPolynomial(3, 5);
//       secrets.push(secret);
//       let round1Contribution = Committee.getRound1Contribution(secret);
//       round1Contributions.push(round1Contribution);
//       ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i].round1Contribution =
//         round1Contribution;
//       let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i];
//       let memberWitness = memberStorage.getWitness({
//         level1Index: memberStorage.calculateLevel1Index(committeeIndex),
//         level2Index: memberStorage.calculateLevel2Index(Field(i)),
//       });
//       let tx = await Mina.transaction(members[i].publicKey, () => {
//         dkgContract.committeeAction(
//           action,
//           getZkAppRef(
//             zkAppStorage.addressMap,
//             'committee',
//             committeeKey.publicKey
//           ),
//           memberWitness.level2,
//           memberWitness.level1
//         );
//       });
//       await tx.prove();
//       await tx.sign([members[i].privateKey]).send();
//       actionStates.push(dkgContract.account.actionState.get());
//     }
//     publicKeys.push(Committee.calculatePublicKey(round1Contributions));
//   });

//   xit('Should finalize round 1 correctly', async () => {
//     let keyStatusRoot = dkgContract.keyStatus.get();
//     let initialContributionRoot = dkgContract.round1Contribution.get();
//     let initialPublicKeyRoot = dkgContract.publicKey.get();
//     let initialRollupState = dkgContract.rollupState.get();

//     let finalizeProof = await FinalizeRound1.firstStep(
//       new Round1Input({
//         T: Field(3),
//         N: Field(5),
//         keyStatusRoot: keyStatusRoot,
//         initialContributionRoot: initialContributionRoot,
//         initialPublicKeyRoot: initialPublicKeyRoot,
//         initialRollupState: initialRollupState,
//         previousActionState: Field(0),
//         action: Action.empty(),
//       })
//     );

//     for (let i = 0; i < 5; i++) {
//       let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i];
//       finalizeProof = await FinalizeRound1.nextStep(
//         new Round1Input({
//           T: Field(3),
//           N: Field(5),
//           keyStatusRoot: keyStatusRoot,
//           initialContributionRoot: initialContributionRoot,
//           initialPublicKeyRoot: initialPublicKeyRoot,
//           initialRollupState: initialRollupState,
//           previousActionState: actionStates[3 + i],
//           action: action,
//         }),
//         finalizeProof,
//         keyStatusStorage.getWitness(
//           keyStatusStorage.calculateLevel1Index({
//             committeeId: action.committeeId,
//             keyId: action.keyId,
//           })
//         ),
//         round1Storage.getWitness({
//           level1Index: round1Storage.calculateLevel1Index({
//             committeeId: action.committeeId,
//             keyId: action.keyId,
//           }),
//           level2Index: round1Storage.calculateLevel2Index(Field(i)),
//         }),
//         publicKeyStorage.getWitness({
//           level1Index: publicKeyStorage.calculateLevel1Index({
//             committeeId: action.committeeId,
//             keyId: action.keyId,
//           }),
//           level2Index: publicKeyStorage.calculateLevel2Index(Field(i)),
//         }),
//         rollupStorage.getWitness(actionStates[4 + i])
//       );
//     }

//     finalizeProof.publicOutput.publicKey.assertEquals(publicKeys[0]);

//     let tx = await Mina.transaction(feePayerKey.publicKey, () => {
//       dkgContract.finalizeRound1(
//         finalizeProof,
//         getZkAppRef(
//           zkAppStorage.addressMap,
//           'committee',
//           committeeKey.publicKey
//         ),
//         settingStorage.getWitness(committeeIndex)
//       );
//     });
//     await tx.prove();
//     await tx.sign([feePayerKey.privateKey]).send();
//   });

//   xit('Should contribute round 2 successfully', async () => {
//     for (let i = 0; i < 5; i++) {
//       let round2Contribution = Committee.getRound2Contribution(
//         secrets[i],
//         i + 1,
//         [...Array(5).keys()].map(
//           (e) => ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i].round1Contribution
//         )
//       );
//       ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][i].round2Contribution =
//         round2Contribution;
//       let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][i];
//       let memberWitness = memberStorage.getWitness({
//         level1Index: memberStorage.calculateLevel1Index(committeeIndex),
//         level2Index: memberStorage.calculateLevel2Index(Field(i)),
//       });
//       let tx = await Mina.transaction(members[i].publicKey, () => {
//         dkgContract.committeeAction(
//           action,
//           getZkAppRef(
//             zkAppStorage.addressMap,
//             'committee',
//             committeeKey.publicKey
//           ),
//           memberWitness.level2,
//           memberWitness.level1
//         );
//       });
//       await tx.prove();
//       await tx.sign([members[i].privateKey]).send();
//       actionStates.push(dkgContract.account.actionState.get());
//     }
//   });

//   xit('Should finalize round 2 correctly', async () => {
//     let keyStatusRoot = dkgContract.keyStatus.get();
//     let publicKeyRoot = dkgContract.publicKey.get();
//     let memberPublicKeys = new PublicKeyArray(
//       [...Array(5).keys()].map((e) =>
//         ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][e].round1Contribution.C.get(
//           Field(0)
//         )
//       )
//     );
//     let initialContributionRoot = dkgContract.round2Contribution.get();
//     let initialRollupState = dkgContract.rollupState.get();

//     let finalizeProof = await FinalizeRound2.firstStep(
//       new Round2Input({
//         T: Field(3),
//         N: Field(5),
//         keyStatusRoot: keyStatusRoot,
//         publicKeyRoot: publicKeyRoot,
//         publicKeys: memberPublicKeys,
//         initialContributionRoot: initialContributionRoot,
//         initialRollupState: initialRollupState,
//         previousActionState: Field(0),
//         action: Action.empty(),
//       })
//     );

//     // for (let i = 0; i < 5; i++) {
//     //   let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][i];
//     //   finalizeProof = await FinalizeRound2.nextStep(
//     //     new Round2Input({
//     //       T: Field(3),
//     //       N: Field(5),
//     //       keyStatusRoot: keyStatusRoot,
//     //       publicKeyRoot: publicKeyRoot,
//     //       publicKeys: memberPublicKeys,
//     //       initialContributionRoot: initialContributionRoot,
//     //       initialRollupState: initialRollupState,
//     //       previousActionState: actionStates[8 + i],
//     //       action: action,
//     //     }),
//     //     finalizeProof,
//     //     keyStatusStorage.getWitness(
//     //       keyStatusStorage.calculateLevel1Index({
//     //         committeeId: action.committeeId,
//     //         keyId: action.keyId,
//     //       })
//     //     ),
//     //     publicKeyStorage.level1.getWitness(committeeIndex),
//     //   );
//     // }
//   });

//   xit('Should contribute response successfully', async () => {});

//   xit('Should complete response correctly', async () => {});

//   xit('Should serialize action & event correctly', async () => {
//     let action = ACTIONS[ActionEnum.GENERATE_KEY][0] || undefined;
//     if (action !== undefined) {
//       let serialized = action.toFields();
//       let deserialized = Action.fromFields(serialized) as Action;
//       deserialized.hash().assertEquals(action.hash());
//     }

//     action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][0] || undefined;
//     if (action !== undefined) {
//       let serialized = action.toFields();
//       let deserialized = Action.fromFields(serialized) as Action;
//       deserialized.hash().assertEquals(action.hash());
//     }

//     action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][0] || undefined;
//     if (action !== undefined) {
//       let serialized = action.toFields();
//       let deserialized = Action.fromFields(serialized) as Action;
//       deserialized.hash().assertEquals(action.hash());
//     }
//   });

//   afterAll(async () => {
//     // DKGProfiler.stop().store();
//   });
// });
