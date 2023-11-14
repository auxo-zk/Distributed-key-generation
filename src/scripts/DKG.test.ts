import {
  Field,
  Mina,
  AccountUpdate,
  PrivateKey,
  PublicKey,
  Provable,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  CompleteResponse,
  DKGContract,
  DeprecateKey,
  FinalizeRound1,
  FinalizeRound2,
  GenerateKey,
  ReduceActions,
  EMPTY_LEVEL_1_TREE as DKG_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE as DKG_LEVEL_2_TREE,
  Action,
  ReduceInput,
  ActionStatus,
} from '../contracts/DKG.js';
import { BatchDecryption, BatchEncryption } from '../contracts/Encryption.js';
import { Config, Key } from './helper/config.js';
import fs from 'fs';
import {
  CommitteeContract,
  CreateCommittee,
  EMPTY_LEVEL_1_TREE as COMMITTEE_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE as COMMITTEE_LEVEL_2_TREE,
} from '../contracts/Committee.js';
import {
  MemberStorage,
  SettingStorage,
} from '../contracts/CommitteeStorage.js';
import { ZkAppStorage } from '../contracts/ZkAppStorage.js';
import { ActionEnum } from '../contracts/DKG.js';
import {
  ResponseContribution,
  Round1Contribution,
  Round2Contribution,
} from '../libs/Committee.js';
import { getZkAppRef } from '../libs/ZkAppRef.js';
import { RollupStateStorage } from '../contracts/DKGStorage.js';

describe('DKG', () => {
  const doProofs = true;
  let feePayerKey: Key;
  let committeeKey: Key;
  let dkgKey: Key;
  let committeeContract: CommitteeContract;
  let dkgContract: DKGContract;
  let memberStorage = new MemberStorage(
    COMMITTEE_LEVEL_1_TREE,
    COMMITTEE_LEVEL_2_TREE
  );
  let settingStorage = new SettingStorage(COMMITTEE_LEVEL_1_TREE);
  let zkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE);
  let rollupStorage = new RollupStateStorage(DKG_LEVEL_1_TREE);

  let { keys, addresses } = randomAccounts(
    'user0',
    'user1',
    'user2',
    'user3',
    'user4'
  );
  let members: Key[] = [
    { privateKey: keys.user0, publicKey: addresses.user0 },
    { privateKey: keys.user1, publicKey: addresses.user1 },
    { privateKey: keys.user2, publicKey: addresses.user2 },
    { privateKey: keys.user3, publicKey: addresses.user3 },
    { privateKey: keys.user4, publicKey: addresses.user4 },
  ];
  let committeeIndex = Field(0);
  let previousActionStates: { [key: string]: Field } = {};
  let actionStates: { [key: string]: Field } = {};

  const ACTIONS = {
    [ActionEnum.GENERATE_KEY]: [
      new Action({
        enum: Field(ActionEnum.GENERATE_KEY),
        committeeId: Field(0),
        keyId: Field(0),
        memberId: Field(0),
        requestId: Field(0),
        round1Contribution: Round1Contribution.empty(),
        round2Contribution: Round2Contribution.empty(),
        responseContribution: ResponseContribution.empty(),
      }),
      new Action({
        enum: Field(ActionEnum.GENERATE_KEY),
        committeeId: Field(0),
        keyId: Field(1),
        memberId: Field(1),
        requestId: Field(0),
        round1Contribution: Round1Contribution.empty(),
        round2Contribution: Round2Contribution.empty(),
        responseContribution: ResponseContribution.empty(),
      }),
      new Action({
        enum: Field(ActionEnum.GENERATE_KEY),
        committeeId: Field(0),
        keyId: Field(2),
        memberId: Field(2),
        requestId: Field(0),
        round1Contribution: Round1Contribution.empty(),
        round2Contribution: Round2Contribution.empty(),
        responseContribution: ResponseContribution.empty(),
      }),
      new Action({
        enum: Field(ActionEnum.GENERATE_KEY),
        committeeId: Field(0),
        keyId: Field(3),
        memberId: Field(0),
        requestId: Field(0),
        round1Contribution: Round1Contribution.empty(),
        round2Contribution: Round2Contribution.empty(),
        responseContribution: ResponseContribution.empty(),
      }),
      new Action({
        enum: Field(ActionEnum.GENERATE_KEY),
        committeeId: Field(0),
        keyId: Field(4),
        memberId: Field(0),
        requestId: Field(0),
        round1Contribution: Round1Contribution.empty(),
        round2Contribution: Round2Contribution.empty(),
        responseContribution: ResponseContribution.empty(),
      }),
    ],
  };

  // const DKGProfiler = getProfiler('Benchmark DKG');
  // DKGProfiler.start('DKG test flow');

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    let configJson: Config = JSON.parse(
      await fs.readFileSync('config.json', 'utf8')
    );
    let dkgConfig = configJson.deployAliases['dkg'];
    let committeeConfig = configJson.deployAliases['committee'];

    // let feePayerKeysBase58: { privateKey: string; publicKey: string } =
    //   JSON.parse(await fs.readFileSync(dkgConfig.feepayerKeyPath, 'utf8'));
    feePayerKey = {
      privateKey: Local.testAccounts[0].privateKey,
      publicKey: Local.testAccounts[0].publicKey,
    };

    let dkgKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
      await fs.readFileSync(dkgConfig.keyPath, 'utf8')
    );
    dkgKey = {
      privateKey: PrivateKey.fromBase58(dkgKeysBase58.privateKey),
      publicKey: PublicKey.fromBase58(dkgKeysBase58.publicKey),
    };

    let committeeKeysBase58: { privateKey: string; publicKey: string } =
      JSON.parse(await fs.readFileSync(committeeConfig.keyPath, 'utf8'));
    committeeKey = {
      privateKey: PrivateKey.fromBase58(committeeKeysBase58.privateKey),
      publicKey: PublicKey.fromBase58(committeeKeysBase58.publicKey),
    };

    committeeContract = new CommitteeContract(committeeKey.publicKey);
    dkgContract = new DKGContract(dkgKey.publicKey);
  });

  it('Should compile all ZK programs', async () => {
    console.log('Compiling CreateCommittee...');
    await CreateCommittee.compile();
    console.log('Done!');
    console.log('Compiling CommitteeContract...');
    await CommitteeContract.compile();
    console.log('Done!');

    console.log('Compiling ReduceActions...');
    // DKGProfiler.start('ReduceActions.compile');
    await ReduceActions.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling GenerateKey...');
    // DKGProfiler.start('GenerateKey.compile');
    await GenerateKey.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling DeprecateKey...');
    // DKGProfiler.start('DeprecateKey.compile');
    await DeprecateKey.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling FinalizeRound1...');
    // DKGProfiler.start('FinalizeRound1.compile');
    await FinalizeRound1.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling BatchEncryption...');
    // DKGProfiler.start('BatchEncryption.compile');
    await BatchEncryption.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling FinalizeRound2...');
    // DKGProfiler.start('FinalizeRound2.compile');
    await FinalizeRound2.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling BatchDecryption...');
    // DKGProfiler.start('BatchDecryption.compile');
    await BatchDecryption.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling CompleteResponse...');
    // DKGProfiler.start('CompleteResponse.compile');
    await CompleteResponse.compile();
    // DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling DKGContract...');
    // DKGProfiler.start('DKGContract.compile');
    await DKGContract.compile();
    // DKGProfiler.stop();
    console.log('Done!');
  });

  it('Should deploy committee and dkg contract with mock states', async () => {
    let memberTree = COMMITTEE_LEVEL_2_TREE;
    for (let i = 0; i < members.length; i++) {
      memberTree.setLeaf(
        BigInt(i),
        memberStorage.calculateLeaf(members[i].publicKey)
      );
    }
    Provable.log('Members tree:', memberTree.getRoot());
    settingStorage.level1.set(
      committeeIndex,
      settingStorage.calculateLeaf({ T: Field(3), N: Field(5) })
    );
    memberStorage.level1.set(committeeIndex, memberTree.getRoot());

    console.log('Deploy CommitteeContract...');
    Provable.log('Member storage root:', memberStorage.level1.getRoot(), '->');
    Provable.log(
      'Setting storage root:',
      settingStorage.level1.getRoot(),
      '->'
    );
    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      AccountUpdate.fundNewAccount(feePayerKey.publicKey, 1);
      committeeContract.deploy();
      committeeContract.nextCommitteeId.set(committeeIndex.add(Field(1)));
      committeeContract.memberTreeRoot.set(memberStorage.level1.getRoot());
      committeeContract.settingTreeRoot.set(settingStorage.level1.getRoot());
    });
    await tx.sign([feePayerKey.privateKey, committeeKey.privateKey]).send();
    console.log('CommitteeContract deployed!');

    Provable.log(
      '-> next committee id:',
      committeeContract.nextCommitteeId.get()
    );
    Provable.log(
      '-> member tree root:',
      committeeContract.memberTreeRoot.get()
    );
    Provable.log(
      '-> setting tree root:',
      committeeContract.settingTreeRoot.get()
    );

    zkAppStorage.addressMap.set(
      zkAppStorage.calculateIndex('committee'),
      zkAppStorage.calculateLeaf(committeeKey.publicKey)
    );

    console.log('Deploy DKGContract...');
    Provable.log(
      'ZkApp storage root:',
      zkAppStorage.addressMap.getRoot(),
      '->'
    );
    tx = await Mina.transaction(feePayerKey.publicKey, () => {
      AccountUpdate.fundNewAccount(feePayerKey.publicKey, 1);
      dkgContract.deploy();
      dkgContract.zkApps.set(zkAppStorage.addressMap.getRoot());
    });
    await tx.sign([feePayerKey.privateKey, dkgKey.privateKey]).send();
    console.log('DKGContract deployed!');
    Provable.log('-> zkApps:', dkgContract.zkApps.get());
  });

  it('Should reduce actions', async () => {
    let initialActionState = dkgContract.account.actionState.get();
    let initialRollupState = dkgContract.rollupState.get();
    let actions = [];
    for (let i = 0; i < 3; i++) {
      let action = ACTIONS[ActionEnum.GENERATE_KEY][i];
      actions.push(action);
      let memberWitness = memberStorage.getWitness({
        level1Index: memberStorage.calculateLevel1Index(committeeIndex),
        level2Index: memberStorage.calculateLevel2Index(Field(i)),
      });
      Provable.log('Member:', members[i].publicKey);
      previousActionStates[action.hash().toString()] =
        dkgContract.account.actionState.get();
      let tx = await Mina.transaction(members[i].publicKey, () => {
        dkgContract.committeeAction(
          action,
          getZkAppRef(
            zkAppStorage.addressMap,
            'committee',
            committeeKey.publicKey
          ),
          memberWitness.level2,
          memberWitness.level1
        );
      });
      await tx.prove();
      await tx.sign([members[i].privateKey]).send();
      actionStates[action.hash().toString()] =
        dkgContract.account.actionState.get();
    }

    console.log('DKG rollup state:', initialRollupState);

    let reduceProof = await ReduceActions.firstStep(
      new ReduceInput({
        initialRollupState: dkgContract.rollupState.get(),
        action: Action.empty(),
      }),
      initialActionState
    );

    for (let i = 0; i < 3; i++) {
      let action = actions[i];
      reduceProof = await ReduceActions.nextStep(
        new ReduceInput({
          initialRollupState: initialRollupState,
          action: action,
        }),
        reduceProof,
        rollupStorage.getWitness(
          rollupStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: action.keyId,
          })
        )
      );

      rollupStorage.level1.set(
        actionStates[action.hash().toString()],
        Field(ActionStatus.REDUCED)
      );
    }

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      dkgContract.reduce(reduceProof);
    });
    await tx.prove();
    await tx.sign([feePayerKey.privateKey]).send();
  });

  xit('Should generate new keys', async () => {
    let initialKeyStatus = dkgContract.keyStatus.get();
    let initialRollupState = dkgContract.rollupState.get();
  });

  afterAll(async () => {
    // DKGProfiler.stop().store();
  });
});
