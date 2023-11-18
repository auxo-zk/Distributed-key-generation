import { Mina, PrivateKey, PublicKey, SmartContract } from 'o1js';
import { getProfiler } from './helper/profiler.js';
import {
  DKGContract,
  UpdateKey,
  Action as DKGAction,
  ActionStatus,
} from '../contracts/DKG.js';
import { Config, Key } from './helper/config.js';
import fs from 'fs';
import { CommitteeContract, CreateCommittee } from '../contracts/Committee.js';
import {
  FinalizeRound1,
  ReduceRound1,
  Round1Contract,
} from '../contracts/Round1.js';
import {
  FinalizeRound2,
  ReduceRound2,
  Round2Contract,
} from '../contracts/Round2.js';
import {
  CompleteResponse,
  ReduceResponse,
  ResponseContract,
} from '../contracts/Response.js';

const ZK_PROGRAMS = {
  CreateCommittee: CreateCommittee,
  CommitteeContract: CommitteeContract,

  UpdateKey: UpdateKey,
  DKGContract: DKGContract,

  ReduceRound1: ReduceRound1,
  FinalizeRound1: FinalizeRound1,
  Round1Contract: Round1Contract,

  ReduceRound2: ReduceRound2,
  FinalizeRound2: FinalizeRound2,
  Round2Contract: Round2Contract,

  ReduceResponse: ReduceResponse,
  CompleteResponse: CompleteResponse,
  ResponseContract: ResponseContract,
};

describe('DKG', () => {
  const doProofs = true;
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  let feePayerKey: Key;
  let contracts: {
    [key: string]: {
      key: Key;
      contract: SmartContract;
    };
  } = {};

  // let memberStorage = new MemberStorage(COMMITTEE_LEVEL_1_TREE(), []);
  // let settingStorage = new SettingStorage(COMMITTEE_LEVEL_1_TREE());
  // let zkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE());
  // let rollupStorage = new RollupStateStorage(DKG_LEVEL_1_TREE());
  // let keyStatusStorage = new KeyStatusStorage(DKG_LEVEL_1_TREE());
  // let publicKeyStorage = new PublicKeyStorage(DKG_LEVEL_1_TREE(), []);
  // let round1Storage = new Round1ContributionStorage(DKG_LEVEL_1_TREE(), []);
  // let round2Storage = new Round2ContributionStorage(DKG_LEVEL_1_TREE(), []);
  // let responseStorage = new ResponseContributionStorage(DKG_LEVEL_1_TREE(), []);
  // let members: Key[] = Local.testAccounts.slice(1, 6);
  // let committeeIndex = Field(0);
  // let secrets: SecretPolynomial[] = [];
  // let publicKeys: PublicKey[] = [];
  // let actionStates: Field[] = [Reducer.initialActionState];
  // let numberOfActions = 0;

  // const ACTIONS = {
  //   [ActionEnum.GENERATE_KEY]: [
  //     new Action({
  //       enum: Field(ActionEnum.GENERATE_KEY),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(0),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.GENERATE_KEY),
  //       committeeId: Field(0),
  //       keyId: Field(1),
  //       memberId: Field(1),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.GENERATE_KEY),
  //       committeeId: Field(0),
  //       keyId: Field(2),
  //       memberId: Field(2),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //   ],
  //   [ActionEnum.CONTRIBUTE_ROUND_1]: [
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(0),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(1),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(2),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(3),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_1),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(4),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //   ],
  //   [ActionEnum.CONTRIBUTE_ROUND_2]: [
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(0),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(1),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(2),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(3),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_ROUND_2),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(4),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //   ],
  //   [ActionEnum.CONTRIBUTE_RESPONSE]: [
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(0),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(1),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(2),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(3),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //     new Action({
  //       enum: Field(ActionEnum.CONTRIBUTE_RESPONSE),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(4),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //   ],
  //   [ActionEnum.DEPRECATE_KEY]: [
  //     new Action({
  //       enum: Field(ActionEnum.DEPRECATE_KEY),
  //       committeeId: Field(0),
  //       keyId: Field(0),
  //       memberId: Field(0),
  //       requestId: Field(0),
  //       round1Contribution: Round1Contribution.empty(),
  //       round2Contribution: Round2Contribution.empty(),
  //       responseContribution: ResponseContribution.empty(),
  //     }),
  //   ],
  // };

  const DKGProfiler = getProfiler('Benchmark DKG');
  DKGProfiler.start('DKG test flow');

  const compile = async (
    prg: any,
    name: string,
    profiling: boolean = false
  ) => {
    console.log(`Compiling ${name}...`);
    if (profiling) DKGProfiler.start(`${name}.compile`);
    await prg.compile();
    if (profiling) DKGProfiler.stop();
    console.log('Done!');
  };

  beforeAll(async () => {
    Mina.setActiveInstance(Local);
    let configJson: Config = JSON.parse(
      await fs.readFileSync('config.json', 'utf8')
    );

    // let feePayerKeysBase58: { privateKey: string; publicKey: string } =
    //   JSON.parse(await fs.readFileSync(dkgConfig.feepayerKeyPath, 'utf8'));
    feePayerKey = {
      privateKey: Local.testAccounts[0].privateKey,
      publicKey: Local.testAccounts[0].publicKey,
    };

    ['committee', 'dkg', 'round1', 'round2', 'response'].map(async (e) => {
      let config = configJson.deployAliases[e];
      let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
        await fs.readFileSync(config.keyPath, 'utf8')
      );
      let key = {
        privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
        publicKey: PublicKey.fromBase58(keyBase58.publicKey),
      };
      let contract = (() => {
        switch (e) {
          case 'committee':
            return new CommitteeContract(key.publicKey);
          case 'dkg':
            return new CommitteeContract(key.publicKey);
          case 'round1':
            return new CommitteeContract(key.publicKey);
          case 'round2':
            return new CommitteeContract(key.publicKey);
          case 'response':
            return new CommitteeContract(key.publicKey);
          default:
            return new SmartContract(key.publicKey);
        }
      })();
      contracts[e] = {
        key: key,
        contract: contract,
      };
    });
  });

  it('Should compile all ZK programs', async () => {
    await compile(CreateCommittee, 'CreateCommittee', true);
    await compile(CommitteeContract, 'CommitteeContract', true);

    await compile(UpdateKey, 'UpdateKey', true);
    await compile(DKGContract, 'DKGContract', true);

    await compile(ReduceRound1, 'ReduceRound1', true);
    await compile(FinalizeRound1, 'FinalizeRound1', true);
    await compile(Round1Contract, 'Round1Contract', true);

    await compile(ReduceRound2, 'ReduceRound2', true);
    await compile(FinalizeRound2, 'FinalizeRound2', true);
    await compile(Round2Contract, 'Round2Contract', true);

    await compile(ReduceResponse, 'ReduceResponse', true);
    await compile(CompleteResponse, 'CompleteResponse', true);
    await compile(ResponseContract, 'ResponseContract', true);
  }, 1200000);

  // it('Should deploy committee and dkg contract with mock states', async () => {
  //   let memberTree = COMMITTEE_LEVEL_2_TREE();
  //   for (let i = 0; i < members.length; i++) {
  //     memberTree.setLeaf(
  //       BigInt(i),
  //       memberStorage.calculateLeaf(members[i].publicKey)
  //     );
  //   }
  //   Provable.log('Members tree:', memberTree.getRoot());
  //   memberStorage.level1.set(committeeIndex, memberTree.getRoot());
  //   memberStorage.level2s[committeeIndex.toString()] = memberTree;
  //   settingStorage.level1.set(
  //     committeeIndex,
  //     settingStorage.calculateLeaf({ T: Field(3), N: Field(5) })
  //   );

  //   console.log('Deploy CommitteeContract...');
  //   let tx = await Mina.transaction(feePayerKey.publicKey, () => {
  //     AccountUpdate.fundNewAccount(feePayerKey.publicKey, 1);
  //     committeeContract.deploy();
  //     committeeContract.nextCommitteeId.set(committeeIndex.add(Field(1)));
  //     committeeContract.memberTreeRoot.set(memberStorage.level1.getRoot());
  //     committeeContract.settingTreeRoot.set(settingStorage.level1.getRoot());
  //   });
  //   await tx.sign([feePayerKey.privateKey, committeeKey.privateKey]).send();
  //   console.log('CommitteeContract deployed!');

  //   zkAppStorage.addressMap.set(
  //     zkAppStorage.calculateIndex('committee'),
  //     zkAppStorage.calculateLeaf(committeeKey.publicKey)
  //   );

  //   console.log('Deploy DKGContract...');
  //   tx = await Mina.transaction(feePayerKey.publicKey, () => {
  //     AccountUpdate.fundNewAccount(feePayerKey.publicKey, 1);
  //     dkgContract.deploy();
  //     dkgContract.zkApps.set(zkAppStorage.addressMap.getRoot());
  //   });
  //   await tx.sign([feePayerKey.privateKey, dkgKey.privateKey]).send();
  //   console.log('DKGContract deployed!');
  // });

  // xit('Should reduce actions', async () => {
  //   let initialActionState = dkgContract.account.actionState.get();
  //   let initialRollupState = dkgContract.rollupState.get();
  //   let actions = [];
  //   Provable.log('Member tree root:', memberStorage.level1.get(committeeIndex));
  //   let memberTree = memberStorage.level2s[committeeIndex.toString()];
  //   Provable.log('Member tree root:', memberTree.getRoot());
  //   for (let i = 0; i < 3; i++) {
  //     let action = ACTIONS[ActionEnum.GENERATE_KEY][i];
  //     actions.push(action);
  //     // FIXME - storage api doesn't work
  //     // let memberWitness = memberStorage.getWitness({
  //     //   level1Index: memberStorage.calculateLevel1Index(committeeIndex),
  //     //   level2Index: memberStorage.calculateLevel2Index(Field(i)),
  //     // });
  //     let tx = await Mina.transaction(members[i].publicKey, () => {
  //       dkgContract.committeeAction(
  //         action,
  //         getZkAppRef(
  //           zkAppStorage.addressMap,
  //           'committee',
  //           committeeKey.publicKey
  //         ),
  //         new Level2Witness(memberTree.getWitness(Field(i).toBigInt())),
  //         memberStorage.level1.getWitness(committeeIndex) as Level1Witness
  //       );
  //     });
  //     await tx.prove();
  //     await tx.sign([members[i].privateKey]).send();
  //     actionStates.push(dkgContract.account.actionState.get());
  //   }

  //   console.log('DKG rollup state:', initialRollupState);

  //   let reduceProof = await ReduceActions.firstStep(
  //     new ReduceInput({
  //       initialRollupState: dkgContract.rollupState.get(),
  //       action: Action.empty(),
  //     }),
  //     initialActionState
  //   );

  //   for (let i = 0; i < 3; i++) {
  //     let action = actions[i];
  //     reduceProof = await ReduceActions.nextStep(
  //       new ReduceInput({
  //         initialRollupState: initialRollupState,
  //         action: action,
  //       }),
  //       reduceProof,
  //       rollupStorage.getWitness(
  //         rollupStorage.calculateLevel1Index(actionStates[i + 1])
  //       )
  //     );

  //     rollupStorage.level1.set(
  //       actionStates[i + 1],
  //       rollupStorage.calculateLeaf(ActionStatus.REDUCED)
  //     );
  //   }

  //   let tx = await Mina.transaction(feePayerKey.publicKey, () => {
  //     dkgContract.reduce(reduceProof);
  //   });
  //   await tx.prove();
  //   await tx.sign([feePayerKey.privateKey]).send();
  // });

  // xit('Should generate new keys', async () => {
  //   let initialKeyStatus = dkgContract.keyStatus.get();
  //   let initialRollupState = dkgContract.rollupState.get();

  //   let generateKeyProof = await UpdateKey.firstStep(
  //     new KeyUpdateInput({
  //       initialKeyStatus: initialKeyStatus,
  //       initialRollupState: initialRollupState,
  //       previousActionState: Field(0),
  //       action: Action.empty(),
  //     })
  //   );

  //   for (let i = 0; i < 3; i++) {
  //     let action = ACTIONS[ActionEnum.GENERATE_KEY][i];
  //     generateKeyProof = await UpdateKey.nextStep(
  //       new KeyUpdateInput({
  //         initialKeyStatus: initialKeyStatus,
  //         initialRollupState: initialRollupState,
  //         previousActionState: actionStates[i],
  //         action: action,
  //       }),
  //       generateKeyProof,
  //       keyStatusStorage.getWitness(
  //         keyStatusStorage.calculateLevel1Index({
  //           committeeId: action.committeeId,
  //           keyId: action.keyId,
  //         })
  //       ),
  //       rollupStorage.getWitness(
  //         rollupStorage.calculateLevel1Index(actionStates[i + 1])
  //       )
  //     );
  //     let tx = await Mina.transaction(feePayerKey.publicKey, () => {
  //       dkgContract.updateKeys(generateKeyProof);
  //     });
  //     await tx.prove();
  //     await tx.sign([feePayerKey.privateKey]).send();
  //     rollupStorage.level1.set(
  //       actionStates[i + 1],
  //       rollupStorage.calculateLeaf(ActionStatus.ROLLUPED)
  //     );
  //   }
  // });

  // xit('Should contribute round 1 successfully', async () => {
  //   let round1Contributions: Round1Contribution[] = [];
  //   for (let i = 0; i < 5; i++) {
  //     let secret = Committee.generateRandomPolynomial(3, 5);
  //     secrets.push(secret);
  //     let round1Contribution = Committee.getRound1Contribution(secret);
  //     round1Contributions.push(round1Contribution);
  //     ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i].round1Contribution =
  //       round1Contribution;
  //     let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i];
  //     let memberWitness = memberStorage.getWitness({
  //       level1Index: memberStorage.calculateLevel1Index(committeeIndex),
  //       level2Index: memberStorage.calculateLevel2Index(Field(i)),
  //     });
  //     let tx = await Mina.transaction(members[i].publicKey, () => {
  //       dkgContract.committeeAction(
  //         action,
  //         getZkAppRef(
  //           zkAppStorage.addressMap,
  //           'committee',
  //           committeeKey.publicKey
  //         ),
  //         memberWitness.level2,
  //         memberWitness.level1
  //       );
  //     });
  //     await tx.prove();
  //     await tx.sign([members[i].privateKey]).send();
  //     actionStates.push(dkgContract.account.actionState.get());
  //   }
  //   publicKeys.push(Committee.calculatePublicKey(round1Contributions));
  // });

  // xit('Should finalize round 1 correctly', async () => {
  //   let keyStatusRoot = dkgContract.keyStatus.get();
  //   let initialContributionRoot = dkgContract.round1Contribution.get();
  //   let initialPublicKeyRoot = dkgContract.publicKey.get();
  //   let initialRollupState = dkgContract.rollupState.get();

  //   let finalizeProof = await FinalizeRound1.firstStep(
  //     new Round1Input({
  //       T: Field(3),
  //       N: Field(5),
  //       keyStatusRoot: keyStatusRoot,
  //       initialContributionRoot: initialContributionRoot,
  //       initialPublicKeyRoot: initialPublicKeyRoot,
  //       initialRollupState: initialRollupState,
  //       previousActionState: Field(0),
  //       action: Action.empty(),
  //     })
  //   );

  //   for (let i = 0; i < 5; i++) {
  //     let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i];
  //     finalizeProof = await FinalizeRound1.nextStep(
  //       new Round1Input({
  //         T: Field(3),
  //         N: Field(5),
  //         keyStatusRoot: keyStatusRoot,
  //         initialContributionRoot: initialContributionRoot,
  //         initialPublicKeyRoot: initialPublicKeyRoot,
  //         initialRollupState: initialRollupState,
  //         previousActionState: actionStates[3 + i],
  //         action: action,
  //       }),
  //       finalizeProof,
  //       keyStatusStorage.getWitness(
  //         keyStatusStorage.calculateLevel1Index({
  //           committeeId: action.committeeId,
  //           keyId: action.keyId,
  //         })
  //       ),
  //       round1Storage.getWitness({
  //         level1Index: round1Storage.calculateLevel1Index({
  //           committeeId: action.committeeId,
  //           keyId: action.keyId,
  //         }),
  //         level2Index: round1Storage.calculateLevel2Index(Field(i)),
  //       }),
  //       publicKeyStorage.getWitness({
  //         level1Index: publicKeyStorage.calculateLevel1Index({
  //           committeeId: action.committeeId,
  //           keyId: action.keyId,
  //         }),
  //         level2Index: publicKeyStorage.calculateLevel2Index(Field(i)),
  //       }),
  //       rollupStorage.getWitness(actionStates[4 + i])
  //     );
  //   }

  //   finalizeProof.publicOutput.publicKey.assertEquals(publicKeys[0]);

  //   let tx = await Mina.transaction(feePayerKey.publicKey, () => {
  //     dkgContract.finalizeRound1(
  //       finalizeProof,
  //       getZkAppRef(
  //         zkAppStorage.addressMap,
  //         'committee',
  //         committeeKey.publicKey
  //       ),
  //       settingStorage.getWitness(committeeIndex)
  //     );
  //   });
  //   await tx.prove();
  //   await tx.sign([feePayerKey.privateKey]).send();
  // });

  // xit('Should contribute round 2 successfully', async () => {
  //   for (let i = 0; i < 5; i++) {
  //     let round2Contribution = Committee.getRound2Contribution(
  //       secrets[i],
  //       i + 1,
  //       [...Array(5).keys()].map(
  //         (e) => ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][i].round1Contribution
  //       )
  //     );
  //     ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][i].round2Contribution =
  //       round2Contribution;
  //     let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][i];
  //     let memberWitness = memberStorage.getWitness({
  //       level1Index: memberStorage.calculateLevel1Index(committeeIndex),
  //       level2Index: memberStorage.calculateLevel2Index(Field(i)),
  //     });
  //     let tx = await Mina.transaction(members[i].publicKey, () => {
  //       dkgContract.committeeAction(
  //         action,
  //         getZkAppRef(
  //           zkAppStorage.addressMap,
  //           'committee',
  //           committeeKey.publicKey
  //         ),
  //         memberWitness.level2,
  //         memberWitness.level1
  //       );
  //     });
  //     await tx.prove();
  //     await tx.sign([members[i].privateKey]).send();
  //     actionStates.push(dkgContract.account.actionState.get());
  //   }
  // });

  // xit('Should finalize round 2 correctly', async () => {
  //   let keyStatusRoot = dkgContract.keyStatus.get();
  //   let publicKeyRoot = dkgContract.publicKey.get();
  //   let memberPublicKeys = new PublicKeyArray(
  //     [...Array(5).keys()].map((e) =>
  //       ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][e].round1Contribution.C.get(
  //         Field(0)
  //       )
  //     )
  //   );
  //   let initialContributionRoot = dkgContract.round2Contribution.get();
  //   let initialRollupState = dkgContract.rollupState.get();

  //   let finalizeProof = await FinalizeRound2.firstStep(
  //     new Round2Input({
  //       T: Field(3),
  //       N: Field(5),
  //       keyStatusRoot: keyStatusRoot,
  //       publicKeyRoot: publicKeyRoot,
  //       publicKeys: memberPublicKeys,
  //       initialContributionRoot: initialContributionRoot,
  //       initialRollupState: initialRollupState,
  //       previousActionState: Field(0),
  //       action: Action.empty(),
  //     })
  //   );

  //   // for (let i = 0; i < 5; i++) {
  //   //   let action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][i];
  //   //   finalizeProof = await FinalizeRound2.nextStep(
  //   //     new Round2Input({
  //   //       T: Field(3),
  //   //       N: Field(5),
  //   //       keyStatusRoot: keyStatusRoot,
  //   //       publicKeyRoot: publicKeyRoot,
  //   //       publicKeys: memberPublicKeys,
  //   //       initialContributionRoot: initialContributionRoot,
  //   //       initialRollupState: initialRollupState,
  //   //       previousActionState: actionStates[8 + i],
  //   //       action: action,
  //   //     }),
  //   //     finalizeProof,
  //   //     keyStatusStorage.getWitness(
  //   //       keyStatusStorage.calculateLevel1Index({
  //   //         committeeId: action.committeeId,
  //   //         keyId: action.keyId,
  //   //       })
  //   //     ),
  //   //     publicKeyStorage.level1.getWitness(committeeIndex),
  //   //   );
  //   // }
  // });

  // xit('Should contribute response successfully', async () => {});

  // xit('Should complete response correctly', async () => {});

  // xit('Should serialize action & event correctly', async () => {
  //   let action = ACTIONS[ActionEnum.GENERATE_KEY][0] || undefined;
  //   if (action !== undefined) {
  //     let serialized = action.toFields();
  //     let deserialized = Action.fromFields(serialized) as Action;
  //     deserialized.hash().assertEquals(action.hash());
  //   }

  //   action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_1][0] || undefined;
  //   if (action !== undefined) {
  //     let serialized = action.toFields();
  //     let deserialized = Action.fromFields(serialized) as Action;
  //     deserialized.hash().assertEquals(action.hash());
  //   }

  //   action = ACTIONS[ActionEnum.CONTRIBUTE_ROUND_2][0] || undefined;
  //   if (action !== undefined) {
  //     let serialized = action.toFields();
  //     let deserialized = Action.fromFields(serialized) as Action;
  //     deserialized.hash().assertEquals(action.hash());
  //   }
  // });

  afterAll(async () => {
    // DKGProfiler.stop().store();
  });
});
