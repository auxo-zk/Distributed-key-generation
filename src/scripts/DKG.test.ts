import {
  AccountUpdate,
  Field,
  Group,
  Mina,
  Poseidon,
  PrivateKey,
  Provable,
  PublicKey,
  Reducer,
  Scalar,
  SmartContract,
} from 'o1js';
import { CustomScalar } from '@auxo-dev/auxo-libs';
import fs from 'fs';
import { getProfiler } from './helper/profiler.js';
import { Config, Key } from './helper/config.js';
import { CommitteeContract, CreateCommittee } from '../contracts/Committee.js';
import {
  Action as DKGAction,
  ActionEnum,
  ACTION_MASK,
  DKGContract,
  KeyStatus,
  UpdateKey,
} from '../contracts/DKG.js';
import {
  Action as Round1Action,
  FinalizeRound1,
  ReduceRound1,
  Round1Contract,
  Round1Input,
} from '../contracts/Round1.js';
import {
  Action as Round2Action,
  FinalizeRound2,
  ReduceRound2,
  Round2Contract,
  PublicKeyArray,
  Round2Input,
} from '../contracts/Round2.js';
import {
  Action as ResponseAction,
  CompleteResponse,
  ReduceResponse,
  ResponseContract,
  ResponseInput,
} from '../contracts/Response.js';
import {
  BatchDecryption,
  BatchDecryptionInput,
  BatchDecryptionProof,
  BatchEncryption,
  BatchEncryptionInput,
  BatchEncryptionProof,
  PlainArray,
  RandomArray,
} from '../contracts/Encryption.js';
import {
  EMPTY_LEVEL_1_TREE as COMMITTEE_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE as COMMITTEE_LEVEL_2_TREE,
  MemberStorage,
  SettingStorage,
} from '../contracts/CommitteeStorage.js';
import {
  ActionStatus,
  EMPTY_LEVEL_1_TREE as DKG_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE as DKG_LEVEL_2_TREE,
  EncryptionStorage,
  KeyStatusStorage,
  PublicKeyStorage,
  ReduceStorage,
  ResponseContributionStorage,
  Round1ContributionStorage,
  Round2ContributionStorage,
} from '../contracts/DKGStorage.js';
import { ZkAppStorage } from '../contracts/ZkAppStorage.js';
import {
  CArray,
  EncryptionHashArray,
  Round2Data,
  SecretPolynomial,
  UArray,
  cArray,
} from '../libs/Committee.js';
import { getZkAppRef } from '../libs/ZkAppRef.js';
import { Committee } from '../libs/index.js';

describe('DKG', () => {
  const doProofs = false;
  const profiling = false;
  const DKGProfiler = getProfiler('Benchmark DKG');
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  let feePayerKey: Key;
  let contracts: {
    [key: string]: {
      key: Key;
      contract: SmartContract;
      actionStates: Field[];
    };
  } = {};
  enum Contract {
    COMMITTEE = 'committee',
    DKG = 'dkg',
    ROUND1 = 'round1',
    ROUND2 = 'round2',
    RESPONSE = 'response',
    REQUEST = 'request',
  }

  // CommitteeContract storage
  let memberStorage = new MemberStorage(COMMITTEE_LEVEL_1_TREE());
  let settingStorage = new SettingStorage(COMMITTEE_LEVEL_1_TREE());
  let commmitteeZkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE());

  // DKGContract storage
  let keyStatusStorage = new KeyStatusStorage(DKG_LEVEL_1_TREE());
  let dkgZkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE());

  // Round1Contract storage
  let round1ReduceStorage = new ReduceStorage(DKG_LEVEL_1_TREE());
  let round1ContributionStorage = new Round1ContributionStorage(
    DKG_LEVEL_1_TREE()
  );
  let publicKeyStorage = new PublicKeyStorage(DKG_LEVEL_1_TREE());
  let round1ZkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE());

  // Round2Contract storage
  let round2ReduceStorage = new ReduceStorage(DKG_LEVEL_1_TREE());
  let round2ContributionStorage = new Round2ContributionStorage(
    DKG_LEVEL_1_TREE()
  );
  let encryptionStorage = new EncryptionStorage(DKG_LEVEL_1_TREE());
  let round2ZkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE());

  // Response storage
  let responseReduceStorage = new ReduceStorage(DKG_LEVEL_1_TREE());
  let responseContributionStorage = new ResponseContributionStorage(
    DKG_LEVEL_1_TREE()
  );
  let responseZkAppStorage = new ZkAppStorage(DKG_LEVEL_1_TREE());

  let committeeIndex = Field(0);
  let T = 2,
    N = 3;
  let members: Key[] = Local.testAccounts.slice(1, N + 1);
  let responsedMembers = [2, 0];
  let secrets: SecretPolynomial[] = [];
  let publicKeys: Group[] = [];
  let requestId = Field.random();

  let dkgActions = {
    [ActionEnum.GENERATE_KEY]: [
      new DKGAction({
        committeeId: Field(0),
        keyId: Field(0),
        mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
      }),
      new DKGAction({
        committeeId: Field(0),
        keyId: Field(1),
        mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
      }),
      new DKGAction({
        committeeId: Field(0),
        keyId: Field(2),
        mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
      }),
    ],
    [ActionEnum.FINALIZE_ROUND_1]: [
      new DKGAction({
        committeeId: Field(0),
        keyId: Field(0),
        mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_1],
      }),
    ],
    [ActionEnum.FINALIZE_ROUND_2]: [
      new DKGAction({
        committeeId: Field(0),
        keyId: Field(0),
        mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_2],
      }),
    ],
    [ActionEnum.DEPRECATE_KEY]: [
      new DKGAction({
        committeeId: Field(0),
        keyId: Field(0),
        mask: ACTION_MASK[ActionEnum.DEPRECATE_KEY],
      }),
    ],
  };

  let round1Actions: Round1Action[] = [];
  let round2Actions: Round2Action[] = [];
  let encryptionProofs: BatchEncryptionProof[] = [];
  let responseActions: ResponseAction[] = [];
  let decryptionProofs: BatchDecryptionProof[] = [];

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

  const deploy = async (
    feePayer: Key,
    name: string,
    initArgs: [string, Field][]
  ) => {
    console.log(`Deploying ${name}...`);
    let ct = name.toLowerCase().replace('contract', '');
    let { contract, key } = contracts[ct];
    let tx = await Mina.transaction(feePayer.publicKey, () => {
      AccountUpdate.fundNewAccount(feePayer.publicKey, 1);
      contract.deploy();
      for (let i = 0; i < initArgs.length; i++) {
        (contract as any)[initArgs[i][0]].set(initArgs[i][1]);
      }
    });
    await tx.sign([feePayer.privateKey, key.privateKey]).send();
    console.log(`${name} deployed!`);
    Object.assign(contracts[ct], {
      contract: contract,
    });
  };

  const proveAndSend = async (
    tx: Mina.Transaction,
    feePayer: Key,
    contractName: string,
    methodName: string,
    profiling: boolean = true
  ) => {
    console.log(
      `Generate proof and submit tx for ${contractName}.${methodName}()...`
    );
    if (profiling) DKGProfiler.start(`${contractName}.${methodName}.prove`);
    await tx.prove();
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');
    await tx.sign([feePayer.privateKey]).send();
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

    Object.keys(Contract)
      .filter((item) => isNaN(Number(item)))
      .map(async (e) => {
        let config = configJson.deployAliases[e.toLowerCase()];
        // console.log(config);
        let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
          await fs.readFileSync(config.keyPath, 'utf8')
        );
        let key = {
          privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
          publicKey: PublicKey.fromBase58(keyBase58.publicKey),
        };
        let contract = (() => {
          switch (e.toLowerCase()) {
            case Contract.COMMITTEE:
              return new CommitteeContract(key.publicKey);
            case Contract.DKG:
              return new DKGContract(key.publicKey);
            case Contract.ROUND1:
              return new Round1Contract(key.publicKey);
            case Contract.ROUND2:
              return new Round2Contract(key.publicKey);
            case Contract.RESPONSE:
              return new ResponseContract(key.publicKey);
            default:
              return new SmartContract(key.publicKey);
          }
        })();
        contracts[e.toLowerCase()] = {
          key: key,
          contract: contract,
          actionStates: [Reducer.initialActionState],
        };
      });
  });

  it('Should compile all ZK programs', async () => {
    await compile(CreateCommittee, 'CreateCommittee', profiling);
    await compile(CommitteeContract, 'CommitteeContract', profiling);

    await compile(UpdateKey, 'UpdateKey', profiling);
    await compile(DKGContract, 'DKGContract', profiling);

    await compile(ReduceRound1, 'ReduceRound1', profiling);
    await compile(FinalizeRound1, 'FinalizeRound1', profiling);
    await compile(Round1Contract, 'Round1Contract', profiling);

    await compile(ReduceRound2, 'ReduceRound2', profiling);
    await compile(BatchEncryption, 'BatchEncryption', profiling);
    await compile(FinalizeRound2, 'FinalizeRound2', profiling);
    await compile(Round2Contract, 'Round2Contract', profiling);

    // await compile(ReduceResponse, 'ReduceResponse', profiling);
    // await compile(BatchDecryption, 'BatchDecryption', profiling);
    // await compile(CompleteResponse, 'CompleteResponse', profiling);
    // await compile(ResponseContract, 'ResponseContract', profiling);
  });

  it('Should deploy contracts successfully', async () => {
    // Calculate mock committee trees
    let memberTree = COMMITTEE_LEVEL_2_TREE();
    for (let i = 0; i < members.length; i++) {
      memberTree.setLeaf(
        BigInt(i),
        memberStorage.calculateLeaf(members[i].publicKey)
      );
    }
    memberStorage.updateInternal(committeeIndex, memberTree);
    settingStorage.updateLeaf(
      settingStorage.calculateLeaf({ T: Field(T), N: Field(N) }),
      settingStorage.calculateLevel1Index(committeeIndex)
    );

    // Deploy committee contract
    await deploy(feePayerKey, 'CommitteeContract', [
      ['nextCommitteeId', committeeIndex.add(Field(1))],
      ['memberTreeRoot', memberStorage.level1.getRoot()],
      ['settingTreeRoot', settingStorage.level1.getRoot()],
    ]);
    dkgZkAppStorage.addressMap.set(
      dkgZkAppStorage.calculateIndex(Contract.COMMITTEE),
      dkgZkAppStorage.calculateLeaf(
        contracts[Contract.COMMITTEE].contract.address
      )
    );
    round1ZkAppStorage.addressMap.set(
      round1ZkAppStorage.calculateIndex(Contract.COMMITTEE),
      round1ZkAppStorage.calculateLeaf(
        contracts[Contract.COMMITTEE].contract.address
      )
    );
    round2ZkAppStorage.addressMap.set(
      round2ZkAppStorage.calculateIndex(Contract.COMMITTEE),
      round2ZkAppStorage.calculateLeaf(
        contracts[Contract.COMMITTEE].contract.address
      )
    );
    responseZkAppStorage.addressMap.set(
      responseZkAppStorage.calculateIndex(Contract.COMMITTEE),
      responseZkAppStorage.calculateLeaf(
        contracts[Contract.COMMITTEE].contract.address
      )
    );

    // Deploy dkg contract
    await deploy(feePayerKey, 'DKGContract', [
      ['zkApps', dkgZkAppStorage.addressMap.getRoot()],
    ]);
    round1ZkAppStorage.addressMap.set(
      round1ZkAppStorage.calculateIndex(Contract.DKG),
      round1ZkAppStorage.calculateLeaf(contracts[Contract.DKG].contract.address)
    );
    round2ZkAppStorage.addressMap.set(
      round2ZkAppStorage.calculateIndex(Contract.DKG),
      round2ZkAppStorage.calculateLeaf(contracts[Contract.DKG].contract.address)
    );
    responseZkAppStorage.addressMap.set(
      responseZkAppStorage.calculateIndex(Contract.DKG),
      responseZkAppStorage.calculateLeaf(
        contracts[Contract.DKG].contract.address
      )
    );

    // Deploy round 1 contract
    await deploy(feePayerKey, 'Round1Contract', [
      ['zkApps', round1ZkAppStorage.addressMap.getRoot()],
    ]);
    round2ZkAppStorage.addressMap.set(
      round2ZkAppStorage.calculateIndex(Contract.ROUND1),
      round2ZkAppStorage.calculateLeaf(
        contracts[Contract.ROUND1].contract.address
      )
    );
    responseZkAppStorage.addressMap.set(
      responseZkAppStorage.calculateIndex(Contract.ROUND1),
      responseZkAppStorage.calculateLeaf(
        contracts[Contract.ROUND1].contract.address
      )
    );

    // Deploy round 2 contract
    await deploy(feePayerKey, 'Round2Contract', [
      ['zkApps', round2ZkAppStorage.addressMap.getRoot()],
    ]);
    responseZkAppStorage.addressMap.set(
      responseZkAppStorage.calculateIndex('round2'),
      responseZkAppStorage.calculateLeaf(
        contracts[Contract.ROUND2].contract.address
      )
    );

    // Deploy response
    // await deploy(feePayerKey, 'ResponseContract', [
    //   ['zkApps', responseZkAppStorage.addressMap.getRoot()],
    // ]);
  });

  it('Should reduce dkg actions and generate new keys', async () => {
    let dkgContract = contracts[Contract.DKG].contract as DKGContract;
    let initialActionState = dkgContract.account.actionState.get();
    let initialKeyStatus = dkgContract.keyStatus.get();
    for (let i = 0; i < 1; i++) {
      let action = dkgActions[ActionEnum.GENERATE_KEY][i];
      let memberWitness = memberStorage.getWitness(
        memberStorage.calculateLevel1Index(committeeIndex),
        memberStorage.calculateLevel2Index(Field(i))
      );
      let tx = await Mina.transaction(members[i].publicKey, () => {
        dkgContract.committeeAction(
          action.committeeId,
          action.keyId,
          Field(ActionEnum.GENERATE_KEY),
          getZkAppRef(
            commmitteeZkAppStorage.addressMap,
            'committee',
            contracts[Contract.COMMITTEE].contract.address
          ),
          memberWitness.level2,
          memberWitness.level1,
          Field(i)
        );
      });
      await proveAndSend(tx, members[i], 'DKGContract', 'committeeAction');
      contracts[Contract.DKG].actionStates.push(
        dkgContract.account.actionState.get()
      );
    }

    console.log('Generate first step proof UpdateKey...');
    if (profiling) DKGProfiler.start('UpdateKey.firstStep');
    let updateKeyProof = await UpdateKey.firstStep(
      DKGAction.empty(),
      initialKeyStatus,
      initialActionState
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    for (let i = 0; i < 1; i++) {
      let action = dkgActions[ActionEnum.GENERATE_KEY][i];
      console.log(`Generate step ${i + 1} proof UpdateKey...`);
      if (profiling) DKGProfiler.start('UpdateKey.nextStep');
      updateKeyProof = await UpdateKey.nextStep(
        action,
        updateKeyProof,
        keyStatusStorage.getWitness(
          keyStatusStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: action.keyId,
          })
        )
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');

      keyStatusStorage.updateLeaf(
        Provable.switch(action.mask.values, Field, [
          Field(KeyStatus.ROUND_1_CONTRIBUTION),
          Field(KeyStatus.ROUND_2_CONTRIBUTION),
          Field(KeyStatus.ACTIVE),
          Field(KeyStatus.DEPRECATED),
        ]),
        keyStatusStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        })
      );
    }

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      dkgContract.updateKeys(updateKeyProof);
    });
    await proveAndSend(tx, feePayerKey, 'DKGContract', 'updateKeys');
    dkgContract.keyStatus.get().assertEquals(keyStatusStorage.level1.getRoot());
  });

  it('Should contribute round 1 successfully', async () => {
    let round1Contract = contracts[Contract.ROUND1].contract as Round1Contract;
    for (let i = 0; i < N; i++) {
      let secret = Committee.generateRandomPolynomial(T, N);
      secrets.push(secret);
      let contribution = Committee.getRound1Contribution(secret);
      let action = new Round1Action({
        committeeId: Field(0),
        keyId: Field(0),
        memberId: Field(i),
        contribution: contribution,
      });
      round1Actions.push(action);

      let memberWitness = memberStorage.getWitness(
        memberStorage.calculateLevel1Index(committeeIndex),
        memberStorage.calculateLevel2Index(Field(i))
      );

      let tx = await Mina.transaction(members[i].publicKey, () => {
        round1Contract.contribute(
          action,
          getZkAppRef(
            round1ZkAppStorage.addressMap,
            Contract.COMMITTEE,
            contracts[Contract.COMMITTEE].contract.address
          ),
          memberWitness,
          getZkAppRef(
            round1ZkAppStorage.addressMap,
            Contract.DKG,
            contracts[Contract.DKG].contract.address
          ),
          keyStatusStorage.getWitness(
            keyStatusStorage.calculateLevel1Index({
              committeeId: Field(0),
              keyId: Field(0),
            })
          )
        );
      });
      await proveAndSend(tx, members[i], 'Round1Contract', 'contribute');
      contracts[Contract.ROUND1].actionStates.push(
        round1Contract.account.actionState.get()
      );
    }
    publicKeys.push(
      Committee.calculatePublicKey(round1Actions.map((e) => e.contribution))
    );
  });

  it('Should reduce round 1 successfully', async () => {
    let round1Contract = contracts[Contract.ROUND1].contract as Round1Contract;
    let initialReduceState = round1Contract.reduceState.get();
    let initialActionState = contracts[Contract.ROUND1].actionStates[0];

    console.log('Generate first step proof ReduceRound1...');
    if (profiling) DKGProfiler.start('ReduceRound1.firstStep');
    let reduceProof = await ReduceRound1.firstStep(
      round1Actions[0],
      initialReduceState,
      initialActionState
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    for (let i = 0; i < N; i++) {
      let action = round1Actions[i];
      console.log(`Generate step ${i + 1}  proof ReduceRound1...`);
      if (profiling) DKGProfiler.start('ReduceRound1.nextStep');
      reduceProof = await ReduceRound1.nextStep(
        action,
        reduceProof,
        round1ReduceStorage.getWitness(
          contracts[Contract.ROUND1].actionStates[i + 1]
        )
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');

      round1ReduceStorage.updateLeaf(
        round1ReduceStorage.calculateLeaf(ActionStatus.REDUCED),
        round1ReduceStorage.calculateLevel1Index(
          contracts[Contract.ROUND1].actionStates[i + 1]
        )
      );
    }

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      round1Contract.reduce(reduceProof);
    });
    await proveAndSend(tx, feePayerKey, 'Round1Contract', 'reduce');
  });

  it('Should finalize round 1 correctly', async () => {
    let round1Contract = contracts[Contract.ROUND1].contract as Round1Contract;
    let initialContributionRoot = round1Contract.contributions.get();
    let initialPublicKeyRoot = round1Contract.publicKeys.get();
    let reduceStateRoot = round1Contract.reduceState.get();

    console.log('Generate first step proof FinalizeRound1...');
    if (profiling) DKGProfiler.start('FinalizeRound1.firstStep');
    let finalizeProof = await FinalizeRound1.firstStep(
      new Round1Input({
        previousActionState: Field(0),
        action: Round1Action.empty(),
      }),
      Field(T),
      Field(N),
      initialContributionRoot,
      initialPublicKeyRoot,
      reduceStateRoot,
      Poseidon.hash([Field(0), Field(0)]),
      round1ContributionStorage.getLevel1Witness(
        round1ContributionStorage.calculateLevel1Index({
          committeeId: Field(0),
          keyId: Field(0),
        })
      ),
      publicKeyStorage.getLevel1Witness(
        publicKeyStorage.calculateLevel1Index({
          committeeId: Field(0),
          keyId: Field(0),
        })
      )
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    round1ContributionStorage.updateInternal(
      round1ContributionStorage.calculateLevel1Index({
        committeeId: Field(0),
        keyId: Field(0),
      }),
      DKG_LEVEL_2_TREE()
    );

    publicKeyStorage.updateInternal(
      publicKeyStorage.calculateLevel1Index({
        committeeId: Field(0),
        keyId: Field(0),
      }),
      DKG_LEVEL_2_TREE()
    );

    for (let i = 0; i < N; i++) {
      let action = round1Actions[i];
      console.log(`Generate step ${i + 1} proof FinalizeRound1...`);
      if (profiling) DKGProfiler.start('FinalizeRound1.nextStep');
      finalizeProof = await FinalizeRound1.nextStep(
        new Round1Input({
          previousActionState: contracts[Contract.ROUND1].actionStates[i],
          action: action,
        }),
        finalizeProof,
        round1ContributionStorage.getWitness(
          round1ContributionStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: action.keyId,
          }),
          round1ContributionStorage.calculateLevel2Index(Field(i))
        ),
        publicKeyStorage.getWitness(
          publicKeyStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: action.keyId,
          }),
          publicKeyStorage.calculateLevel2Index(Field(i))
        ),
        round1ReduceStorage.getWitness(
          contracts[Contract.ROUND1].actionStates[i + 1]
        )
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');

      round1ContributionStorage.updateLeaf(
        round1ContributionStorage.calculateLeaf(action.contribution),
        round1ContributionStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        round1ContributionStorage.calculateLevel2Index(action.memberId)
      );

      publicKeyStorage.updateLeaf(
        publicKeyStorage.calculateLeaf(action.contribution.C.get(Field(0))),
        publicKeyStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        publicKeyStorage.calculateLevel2Index(action.memberId)
      );
    }

    finalizeProof.publicOutput.publicKey.assertEquals(publicKeys[0]);

    let dkgContract = contracts[Contract.DKG].contract as DKGContract;
    let initialDKGActionState = dkgContract.account.actionState.get();
    let initialKeyStatus = dkgContract.keyStatus.get();
    let action = new DKGAction({
      committeeId: committeeIndex,
      keyId: Field(0),
      mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_1],
    });
    dkgActions[ActionEnum.FINALIZE_ROUND_1].push(action);

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      round1Contract.finalize(
        finalizeProof,
        getZkAppRef(
          round1ZkAppStorage.addressMap,
          'committee',
          contracts[Contract.COMMITTEE].contract.address
        ),
        settingStorage.getWitness(committeeIndex),
        getZkAppRef(
          round1ZkAppStorage.addressMap,
          'dkg',
          contracts[Contract.DKG].contract.address
        )
      );
    });
    await proveAndSend(tx, feePayerKey, 'Round1Contract', 'finalize');
    contracts[Contract.DKG].actionStates.push(
      dkgContract.account.actionState.get()
    );

    console.log('Generate first step proof UpdateKey...');
    if (profiling) DKGProfiler.start('UpdateKey.firstStep');
    let updateKeyProof = await UpdateKey.firstStep(
      DKGAction.empty(),
      initialKeyStatus,
      initialDKGActionState
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    console.log(`Generate next step proof UpdateKey...`);
    if (profiling) DKGProfiler.start('UpdateKey.nextStep');
    updateKeyProof = await UpdateKey.nextStep(
      action,
      updateKeyProof,
      keyStatusStorage.getWitness(
        keyStatusStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        })
      )
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    keyStatusStorage.updateLeaf(
      Provable.switch(action.mask.values, Field, [
        Field(KeyStatus.ROUND_1_CONTRIBUTION),
        Field(KeyStatus.ROUND_2_CONTRIBUTION),
        Field(KeyStatus.ACTIVE),
        Field(KeyStatus.DEPRECATED),
      ]),
      keyStatusStorage.calculateLevel1Index({
        committeeId: action.committeeId,
        keyId: action.keyId,
      })
    );

    tx = await Mina.transaction(feePayerKey.publicKey, () => {
      dkgContract.updateKeys(updateKeyProof);
    });
    await proveAndSend(tx, feePayerKey, 'DKGContract', 'updateKeys');
    dkgContract.keyStatus.get().assertEquals(keyStatusStorage.level1.getRoot());
  });

  it('Should contribute round 2 successfully', async () => {
    let round2Contract = contracts[Contract.ROUND2].contract as Round2Contract;
    for (let i = 0; i < N; i++) {
      let randoms = [...Array(N).keys()].map((e) => Scalar.random());
      let round2Contribution = Committee.getRound2Contribution(
        secrets[i],
        i + 1,
        [...Array(N).keys()].map((e) => round1Actions[e].contribution),
        randoms
      );
      let action = new Round2Action({
        committeeId: committeeIndex,
        keyId: Field(0),
        memberId: Field(i),
        contribution: round2Contribution,
      });
      round2Actions.push(action);

      console.log(`Generate proof BatchEncryption...`);
      if (profiling) DKGProfiler.start('BatchEncryption.encrypt');
      let encryptionProof = await BatchEncryption.encrypt(
        new BatchEncryptionInput({
          publicKeys: new CArray(
            round1Actions.map((e) => e.contribution.C.get(Field(0)))
          ),
          c: action.contribution.c,
          U: action.contribution.U,
          memberId: Field(i),
        }),
        new PlainArray(secrets.map((e) => CustomScalar.fromScalar(e.f[0]))),
        new RandomArray(randoms.map((e) => CustomScalar.fromScalar(e)))
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');
      encryptionProofs.push(encryptionProof);

      let memberWitness = memberStorage.getWitness(
        memberStorage.calculateLevel1Index(committeeIndex),
        memberStorage.calculateLevel2Index(Field(i))
      );

      let tx = await Mina.transaction(members[i].publicKey, () => {
        round2Contract.contribute(
          action,
          getZkAppRef(
            round2ZkAppStorage.addressMap,
            Contract.COMMITTEE,
            contracts[Contract.COMMITTEE].contract.address
          ),
          memberWitness,
          getZkAppRef(
            round2ZkAppStorage.addressMap,
            Contract.DKG,
            contracts[Contract.DKG].contract.address
          ),
          keyStatusStorage.getWitness(
            keyStatusStorage.calculateLevel1Index({
              committeeId: Field(0),
              keyId: Field(0),
            })
          )
        );
      });
      await proveAndSend(tx, members[i], 'Round2Contract', 'contribute');
      contracts[Contract.ROUND2].actionStates.push(
        round2Contract.account.actionState.get()
      );
    }
  });

  xit('Should reduce round 2 successfully', async () => {
    let round2Contract = contracts[Contract.ROUND2].contract as Round2Contract;
    let initialReduceState = round2Contract.reduceState.get();
    let initialActionState = contracts[Contract.ROUND2].actionStates[0];

    console.log('Generate first step proof ReduceRound2...');
    if (profiling) DKGProfiler.start('ReduceRound2.firstStep');
    let reduceProof = await ReduceRound2.firstStep(
      round2Actions[0],
      initialReduceState,
      initialActionState
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    for (let i = 0; i < N; i++) {
      let action = round2Actions[i];
      console.log(`Generate step ${i + 1} proof ReduceRound2...`);
      if (profiling) DKGProfiler.start('ReduceRound2.nextStep');
      reduceProof = await ReduceRound2.nextStep(
        action,
        reduceProof,
        round2ReduceStorage.getWitness(
          contracts[Contract.ROUND2].actionStates[i + 1]
        )
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');

      round2ReduceStorage.updateLeaf(
        round2ReduceStorage.calculateLeaf(ActionStatus.REDUCED),
        round2ReduceStorage.calculateLevel1Index(
          contracts[Contract.ROUND2].actionStates[i + 1]
        )
      );
    }

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      round2Contract.reduce(reduceProof);
    });
    await proveAndSend(tx, feePayerKey, 'Round2Contract', 'reduce');
  });

  xit('Should finalize round 2 correctly', async () => {
    let round2Contract = contracts[Contract.ROUND2].contract as Round2Contract;
    let initialContributionRoot = round2Contract.contributions.get();
    let reduceStateRoot = round2Contract.reduceState.get();
    let memberPublicKeys = new PublicKeyArray(
      [...Array(N).keys()].map((e) =>
        round1Actions[e].contribution.C.get(Field(0))
      )
    );
    let initialHashArray = new EncryptionHashArray(
      [...Array(N).keys()].map((e) => Field(0))
    );

    console.log('Generate first step proof FinalizeRound2...');
    if (profiling) DKGProfiler.start('FinalizeRound2.firstStep');
    let finalizeProof = await FinalizeRound2.firstStep(
      new Round2Input({
        previousActionState: Field(0),
        action: Round2Action.empty(),
      }),
      Field(T),
      Field(N),
      initialContributionRoot,
      memberPublicKeys,
      reduceStateRoot,
      Poseidon.hash([Field(0), Field(0)]),
      initialHashArray,
      round2ContributionStorage.getLevel1Witness(
        round2ContributionStorage.calculateLevel1Index({
          committeeId: committeeIndex,
          keyId: Field(0),
        })
      )
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    round2ContributionStorage.updateInternal(
      round2ContributionStorage.calculateLevel1Index({
        committeeId: Field(0),
        keyId: Field(0),
      }),
      DKG_LEVEL_2_TREE()
    );

    for (let i = 0; i < N; i++) {
      let action = round2Actions[i];
      console.log(`Generate step ${i + 1} proof FinalizeRound2...`);
      if (profiling) DKGProfiler.start('FinalizeRound2.nextStep');
      finalizeProof = await FinalizeRound2.nextStep(
        new Round2Input({
          previousActionState: contracts[Contract.ROUND2].actionStates[i],
          action: action,
        }),
        finalizeProof,
        encryptionProofs[i],
        round2ContributionStorage.getWitness(
          round2ContributionStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: action.keyId,
          }),
          round2ContributionStorage.calculateLevel2Index(action.memberId)
        ),
        round2ReduceStorage.getWitness(
          round2ReduceStorage.calculateLevel1Index(
            contracts[Contract.ROUND2].actionStates[i + 1]
          )
        )
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');

      round2ContributionStorage.updateLeaf(
        round2ContributionStorage.calculateLeaf(action.contribution),
        round2ContributionStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        round2ContributionStorage.calculateLevel2Index(action.memberId)
      );

      encryptionStorage.updateLeaf(
        encryptionStorage.calculateLeaf({
          contributions: round2Actions.map((e) => e.contribution),
          memberId: Field(i),
        }),
        encryptionStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        encryptionStorage.calculateLevel2Index(action.memberId)
      );
    }

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      round2Contract.finalize(
        finalizeProof,
        encryptionStorage.getLevel1Witness(
          encryptionStorage.calculateLevel1Index({
            committeeId: committeeIndex,
            keyId: Field(0),
          })
        ),
        getZkAppRef(
          responseZkAppStorage.addressMap,
          Contract.ROUND1,
          contracts[Contract.ROUND1].contract.address
        ),
        publicKeyStorage.getLevel1Witness(
          publicKeyStorage.calculateLevel1Index({
            committeeId: committeeIndex,
            keyId: Field(0),
          })
        ),
        getZkAppRef(
          responseZkAppStorage.addressMap,
          Contract.COMMITTEE,
          contracts[Contract.COMMITTEE].contract.address
        ),
        settingStorage.getWitness(committeeIndex),
        getZkAppRef(
          responseZkAppStorage.addressMap,
          Contract.DKG,
          contracts[Contract.DKG].contract.address
        )
      );
    });
    await proveAndSend(tx, feePayerKey, 'Round2Contract', 'finalize');
  });

  xit('Should contribute response successfully', async () => {
    let responseContract = contracts[Contract.RESPONSE]
      .contract as ResponseContract;
    for (let i = 0; i < T; i++) {
      let memberId = responsedMembers[i];
      let contribution = Committee.getResponseContribution(
        secrets[memberId],
        memberId,
        round2Actions.map(
          (e) =>
            ({
              c: e.contribution.c.get(Field(memberId)),
              U: e.contribution.U.get(Field(memberId)),
            } as Round2Data)
        ),
        // TODO - mock data
        [Group.generator, Group.generator, Group.generator]
      );
      let action = new ResponseAction({
        committeeId: Field(0),
        keyId: Field(0),
        memberId: Field(memberId),
        requestId: requestId,
        contribution: contribution,
      });
      responseActions.push(action);

      console.log(`Generate proof BatchEncryption...`);
      if (profiling) DKGProfiler.start('BatchEncryption.decrypt');
      let decryptionProof = await BatchDecryption.decrypt(
        new BatchDecryptionInput({
          publicKey: secrets[memberId].C[0],
          c: new cArray(
            round2Actions.map((e) => e.contribution.c.get(Field(memberId)))
          ),
          U: new UArray(
            round2Actions.map((e) => e.contribution.U.get(Field(memberId)))
          ),
          memberId: Field(memberId),
        }),
        new PlainArray(secrets.map((e) => CustomScalar.fromScalar(e.a[0]))),
        secrets[memberId].a[0]
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');
      decryptionProofs.push(decryptionProof);

      let memberWitness = memberStorage.getWitness(
        memberStorage.calculateLevel1Index(committeeIndex),
        memberStorage.calculateLevel2Index(Field(memberId))
      );

      let tx = await Mina.transaction(members[i].publicKey, () => {
        responseContract.contribute(
          action,
          getZkAppRef(
            responseZkAppStorage.addressMap,
            Contract.COMMITTEE,
            contracts[Contract.COMMITTEE].contract.address
          ),
          memberWitness,
          getZkAppRef(
            responseZkAppStorage.addressMap,
            Contract.DKG,
            contracts[Contract.DKG].contract.address
          ),
          keyStatusStorage.getWitness(
            keyStatusStorage.calculateLevel1Index({
              committeeId: Field(0),
              keyId: Field(0),
            })
          )
        );
      });
      await proveAndSend(tx, members[i], 'ResponseContract', 'contribute');
      contracts[Contract.RESPONSE].actionStates.push(
        responseContract.account.actionState.get()
      );
    }
  });

  xit('Should reduce response successfully', async () => {
    let responseContract = contracts[Contract.RESPONSE]
      .contract as ResponseContract;
    let initialReduceState = responseContract.reduceState.get();
    let initialActionState = contracts[Contract.RESPONSE].actionStates[0];

    console.log('Generate first step proof ReduceResponse...');
    if (profiling) DKGProfiler.start('ReduceResponse.firstStep');
    let reduceProof = await ReduceResponse.firstStep(
      responseActions[0],
      initialReduceState,
      initialActionState
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    for (let i = 0; i < N; i++) {
      let action = responseActions[i];
      console.log(`Generate step ${i + 1} proof ReduceResponse...`);
      if (profiling) DKGProfiler.start('ReduceResponse.nextStep');
      reduceProof = await ReduceResponse.nextStep(
        action,
        reduceProof,
        responseReduceStorage.getWitness(
          contracts[Contract.RESPONSE].actionStates[i + 1]
        )
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');

      responseReduceStorage.updateLeaf(
        responseReduceStorage.calculateLeaf(ActionStatus.REDUCED),
        responseReduceStorage.calculateLevel1Index(
          contracts[Contract.RESPONSE].actionStates[i + 1]
        )
      );
    }

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      responseContract.reduce(reduceProof);
    });
    await proveAndSend(tx, feePayerKey, 'ResponseContract', 'reduce');
  });

  xit('Should complete response correctly', async () => {
    let responseContract = contracts[Contract.RESPONSE]
      .contract as ResponseContract;
    let initialContributionRoot = responseContract.contributions.get();
    let reduceStateRoot = responseContract.reduceState.get();

    let round1Contract = contracts[Contract.ROUND1].contract as Round1Contract;
    let publicKeyRoot = round1Contract.publicKeys.get();

    let round2Contract = contracts[Contract.ROUND2].contract as Round2Contract;
    let encryptionRoot = round2Contract.encryptions.get();

    console.log('Generate first step proof CompleteResponse...');
    if (profiling) DKGProfiler.start('CompleteResponse.firstStep');
    let completeProof = await CompleteResponse.firstStep(
      new ResponseInput({
        previousActionState: Field(0),
        action: ResponseAction.empty(),
      }),
      Field(T),
      Field(N),
      initialContributionRoot,
      publicKeyRoot,
      encryptionRoot,
      reduceStateRoot,
      requestId,
      responseContributionStorage.getLevel1Witness(
        responseContributionStorage.calculateLevel1Index(requestId)
      )
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    for (let i = 0; i < T; i++) {
      let action = responseActions[i];
      console.log(`Generate step ${i + 1} proof CompleteResponse...`);
      if (profiling) DKGProfiler.start('CompleteResponse.nextStep');
      completeProof = await CompleteResponse.nextStep(
        new ResponseInput({
          previousActionState: contracts[Contract.RESPONSE].actionStates[i],
          action: action,
        }),
        completeProof,
        decryptionProofs[i],
        responseContributionStorage.getWitness(
          responseContributionStorage.calculateLevel1Index(requestId),
          responseContributionStorage.calculateLevel2Index(action.memberId)
        ),
        publicKeyStorage.getWitness(
          publicKeyStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: action.keyId,
          }),
          publicKeyStorage.calculateLevel2Index(action.memberId)
        ),
        encryptionStorage.getWitness(
          encryptionStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: action.keyId,
          }),
          encryptionStorage.calculateLevel2Index(action.memberId)
        ),
        responseReduceStorage.getWitness(
          responseReduceStorage.calculateLevel1Index(
            contracts[Contract.RESPONSE].actionStates[i + 1]
          )
        )
      );
      if (profiling) DKGProfiler.stop();
      console.log('DONE!');

      responseContributionStorage.updateLeaf(
        responseContributionStorage.calculateLeaf(action.contribution),
        responseContributionStorage.calculateLevel1Index(requestId),
        responseContributionStorage.calculateLevel2Index(action.memberId)
      );
    }
    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      responseContract.complete(
        completeProof,
        getZkAppRef(
          responseZkAppStorage.addressMap,
          Contract.ROUND1,
          contracts[Contract.ROUND1].contract.address
        ),
        getZkAppRef(
          responseZkAppStorage.addressMap,
          Contract.ROUND2,
          contracts[Contract.ROUND2].contract.address
        ),
        getZkAppRef(
          responseZkAppStorage.addressMap,
          Contract.COMMITTEE,
          contracts[Contract.COMMITTEE].contract.address
        ),
        settingStorage.getWitness(committeeIndex)
      );
    });
    await proveAndSend(tx, feePayerKey, 'ResponseContract', 'contribute');
  });

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
    if (profiling) DKGProfiler.store();
  });
});
