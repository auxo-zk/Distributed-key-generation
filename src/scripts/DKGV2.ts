import {
  AccountUpdate,
  Cache,
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
  fetchAccount,
  provable,
} from 'o1js';
import { CustomScalar } from '@auxo-dev/auxo-libs';
import fs from 'fs/promises';
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
  EMPTY_LEVEL_2_TREE as COMMITTEE_LEVEL_2_TREE,
  KeyCounterStorage,
  MemberStorage,
  SettingStorage,
} from '../contracts/CommitteeStorage.js';
import {
  EMPTY_LEVEL_2_TREE as DKG_LEVEL_2_TREE,
  EncryptionStorage,
  KeyStatusStorage,
  PublicKeyStorage,
  ResponseContributionStorage,
  Round1ContributionStorage,
  Round2ContributionStorage,
} from '../contracts/DKGStorage.js';
import {
  ActionStatus,
  AddressStorage,
  ReduceStorage,
  getZkAppRef,
} from '../contracts/SharedStorage.js';
import {
  CArray,
  EncryptionHashArray,
  PublicKeyArray,
  Round2Data,
  SecretPolynomial,
  UArray,
  cArray,
  calculatePublicKey,
  generateRandomPolynomial,
  generateRandomPolynomialWithInputRandom,
  getResponseContribution,
  getRound1Contribution,
  getRound2Contribution,
} from '../libs/Committee.js';
import { ZkAppEnum, Contract } from '../constants.js';
import {
  RArray,
  accumulateEncryption,
  generateEncryption,
  generateEncryptionWithRandomInput,
} from '../libs/Requestor.js';

import {
  RequestContract,
  RequestInput,
  UnRequestInput,
  ResolveInput,
  CreateRequest,
  RequestVector,
  RequestFee,
  RollupStateOutput,
  createActionMask,
  RequestAction,
  RequestStatusEnum,
  RequestProof,
  MockResponeContract,
} from '../contracts/Request.js';
import randomAccounts from './helper/randomAccounts.js';
import { fetchActions, fetchMissingData } from 'o1js/dist/node/lib/fetch.js';
import { EMPTY_LEVEL_1_TREE } from '../contracts/CommitteeStorage.js';

const waitTime = 8 * 60 * 1000; // 7m

const sendMoney = false;

function wait(): Promise<void> {
  console.log('Wait time...');
  return new Promise((resolve) => setTimeout(resolve, waitTime));
}

function waitConfig(time: number): Promise<void> {
  console.log('Wait time...');
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function main() {
  console.time('runTime');
  const logMemUsage = () => {
    console.log(
      'Current memory usage:',
      Math.floor(process.memoryUsage().rss / 1024 / 1024),
      'MB'
    );
  };

  const compile = async (
    prg: any,
    name: string,
    profiling: boolean = false
  ) => {
    if (logMemory) logMemUsage();
    console.log(`Compiling ${name}...`);
    if (profiling) DKGProfiler.start(`${name}.compile`);
    await prg.compile({ cache });
    if (profiling) DKGProfiler.stop();
    console.log('Done!');
  };

  const deploy = async (
    feePayer: Key,
    name: string,
    initArgs: [string, Field][],
    fee?: number,
    nonce?: number
  ) => {
    console.log(`Deploying ${name}...`);
    let ct = name.toLowerCase().replace('contract', '');
    let { contract, key } = contracts[ct];
    let sender;
    if (nonce) {
      sender = { sender: feePayer.publicKey, fee: fee, nonce: nonce };
    } else {
      sender = { sender: feePayer.publicKey, fee: fee };
    }
    let tx = await Mina.transaction(sender, () => {
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
    if (logMemory) logMemUsage();
    console.log(
      `Generate proof and submit tx for ${contractName}.${methodName}()...`
    );
    let retries = 3; // Number of retries

    while (retries > 0) {
      try {
        if (profiling) DKGProfiler.start(`${contractName}.${methodName}.prove`);
        await tx.prove();
        if (profiling) DKGProfiler.stop();

        await tx.sign([feePayer.privateKey]).send();
        console.log('DONE!');
        break; // Exit the loop if successful
      } catch (error) {
        console.error('Error:', error);
        retries--; // Decrement the number of retries
        if (retries === 0) {
          throw error; // Throw the error if no more retries left
        }
        console.log(`Retrying... (${retries} retries left)`);
      }
    }
  };

  const fetchAllContract = async (contracts: {
    [key: string]: {
      key: Key;
      contract: SmartContract;
      actionStates: Field[];
    };
  }) => {
    const maxAttempts = 10; // Maximum number of attempts
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const entries = Object.entries(contracts);
        for (const [key, { contract }] of entries) {
          const [fetchedActions, fetchedAccount] = await Promise.all([
            Mina.fetchActions(contract.address),
            fetchAccount({ publicKey: contract.address }),
          ]);

          if (Array.isArray(fetchedActions)) {
            contracts[key].actionStates = [
              Reducer.initialActionState,
              ...fetchedActions.map((e) => Field(e.hash)),
            ];
          }
        }

        console.log('Fetch all info success');

        // If the code succeeds, break out of the loop
        break;
      } catch (error) {
        console.log('Error: ', error);
        attempts++;

        // Wait for some time before retrying (e.g., 1 second)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (attempts === maxAttempts) {
      console.log('Maximum number of attempts reached. Code failed.');
    }
  };

  let feePayerKey: Key;
  let contracts: {
    [key: string]: {
      key: Key;
      contract: SmartContract;
      actionStates: Field[];
    };
  } = {};

  let round1Actions: Round1Action[] = [];
  let round2Actions: Round2Action[] = [];
  let encryptionProofs: BatchEncryptionProof[] = [];
  let responseActions: ResponseAction[] = [];
  let decryptionProofs: BatchDecryptionProof[] = [];

  let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));

  let acc1: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(configJson.deployAliases['acc1'].keyPath, 'utf8')
  );
  let acc2: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(configJson.deployAliases['acc2'].keyPath, 'utf8')
  );
  let acc3: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(configJson.deployAliases['acc3'].keyPath, 'utf8')
  );

  // let feepayerKeysBase58: { privateKey: string; publicKey: string } =
  // JSON.parse(
  //   await fs.readFile(configJson.deployAliases['dkg'].feepayerKeyPath, 'utf8')
  // );
  // feePayerKey = {
  //   privateKey: PrivateKey.fromBase58(feepayerKeysBase58.privateKey),
  //   publicKey: PrivateKey.fromBase58(
  //     feepayerKeysBase58.privateKey
  //   ).toPublicKey(),
  // };

  feePayerKey = {
    privateKey: PrivateKey.fromBase58(
      'EKFM6UX4RTsCfXmSjdqUkLxVrHi5mDPmJBt9oh5gQ7KhJpw6t56E'
    ),
    publicKey: PublicKey.fromBase58(
      'B62qrr1aGjDr4mRmTvaB3dYLyEhrMgLtcNffcHNELmbVXDG93YcdZx4'
    ),
  };

  console.log('pb: ', feePayerKey.publicKey.toBase58());

  const doProofs = false;
  const profiling = false;
  const logMemory = true;
  const cache = Cache.FileSystem('./caches');
  const DKGProfiler = getProfiler('Benchmark DKG');

  const fee = 0.101 * 1e9; // in nanomina (1 billion = 1.0 mina)

  // const MINAURL = 'https://proxy.berkeley.minaexplorer.com/graphql';
  // const ARCHIVEURL = 'https://archive.berkeley.minaexplorer.com';

  // const MINAURL = 'http://35.215.131.117:8080/graphql';
  // const ARCHIVEURL = 'http://35.215.131.117:8282';

  // const MINAURL = 'https://network.auxo.fund/graphql';
  // const ARCHIVEURL = 'https://network.auxo.fund/archive';

  const MINAURL = 'https://api.minascan.io/node/berkeley/v1/graphql';
  const ARCHIVEURL = 'https://api.minascan.io/archive/berkeley/v1/graphql/';

  const network = Mina.Network({
    mina: MINAURL,
    archive: ARCHIVEURL,
  });
  Mina.setActiveInstance(network);

  let sender = await fetchAccount({ publicKey: feePayerKey.publicKey });
  let feePayerNonce = Number(sender.account?.nonce) - 1;

  let committeeIndex = Field(0);
  let T = 1,
    N = 2;

  let members: Key[] = [
    {
      privateKey: PrivateKey.fromBase58(acc1.privateKey),
      publicKey: PublicKey.fromBase58(acc1.publicKey),
    },
    {
      privateKey: PrivateKey.fromBase58(acc2.privateKey),
      publicKey: PublicKey.fromBase58(acc2.publicKey),
    },
    // {
    //   privateKey: PrivateKey.fromBase58(acc3.privateKey),
    //   publicKey: PublicKey.fromBase58(acc3.publicKey),
    // },
  ];

  console.log('fetch all account');
  console.time('accounts');
  const promises = members.map(async (member) => {
    const sender = await fetchAccount({ publicKey: member.publicKey });
    return Number(sender.account?.nonce) - 1;
  });
  console.timeEnd('accounts');

  const memberNonces: number[] = await Promise.all(promises);

  let responsedMembers = [0];
  let secrets: SecretPolynomial[] = [];
  let randomInputs: Scalar[][] = [];
  randomInputs = [[Scalar.from(1)], [Scalar.from(2)]];

  let randoms: Scalar[][] = [
    [Scalar.from(69), Scalar.from(70)],
    [Scalar.from(71), Scalar.from(72)],
  ];

  let publicKeys: Group[] = [];
  let requestId = Field(0);
  let mockRequests = [
    [1000n, 2000n, 3000n],
    [4000n, 3000n, 2000n],
  ];
  let randomForGenerateEncyption = [
    [Scalar.from(100), Scalar.from(200), Scalar.from(300)],
    [Scalar.from(400), Scalar.from(500), Scalar.from(600)],
  ];
  let R: Group[][] = [];
  let M: Group[][] = [];
  let sumR: Group[] = [];
  let sumM: Group[] = [];
  let D: Group[][] = [];

  await Promise.all(
    Object.keys(Contract)
      .filter((item) => isNaN(Number(item)))
      .map(async (e) => {
        let config = configJson.deployAliases[e.toLowerCase()];
        // console.log(config);
        let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
          await fs.readFile(config.keyPath, 'utf8')
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
            case Contract.REQUEST:
              return new RequestContract(key.publicKey);
            default:
              console.log('Contract not valid');
              return new SmartContract(key.publicKey);
          }
        })();
        contracts[e.toLowerCase()] = {
          key: key,
          contract: contract,
          actionStates: [Reducer.initialActionState],
        };
      })
  );

  // CommitteeContract storage
  let memberStorage = new MemberStorage();
  let settingStorage = new SettingStorage();
  let commmitteeAddressStorage = new AddressStorage();

  // DKGContract storage
  let keyCounterStorage = new KeyCounterStorage();
  let keyStatusStorage = new KeyStatusStorage();
  let dkgAddressStorage = new AddressStorage();

  // Round1Contract storage
  let round1ReduceStorage = new ReduceStorage();
  let round1ContributionStorage = new Round1ContributionStorage();
  let publicKeyStorage = new PublicKeyStorage();
  let round1AddressStorage = new AddressStorage();

  // Round2Contract storage
  let round2ReduceStorage = new ReduceStorage();
  let round2ContributionStorage = new Round2ContributionStorage();
  let encryptionStorage = new EncryptionStorage();
  let round2AddressStorage = new AddressStorage();

  // Response storage
  let responseReduceStorage = new ReduceStorage();
  let responseContributionStorage = new ResponseContributionStorage();
  let responseAddressStorage = new AddressStorage();

  let dkgActions = {
    [ActionEnum.GENERATE_KEY]: [
      new DKGAction({
        committeeId: committeeIndex,
        keyId: Field(-1),
        mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
      }),
      new DKGAction({
        committeeId: committeeIndex,
        keyId: Field(-1),
        mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
      }),
      new DKGAction({
        committeeId: committeeIndex,
        keyId: Field(-1),
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

  await fetchAllContract(contracts);
  Provable.log('action: ', contracts[Contract.ROUND1].actionStates);

  if (sendMoney) {
    let tx = await Mina.transaction(
      { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
      () => {
        AccountUpdate.fundNewAccount(feePayerKey.publicKey, members.length);
        let feePayerAccount = AccountUpdate.createSigned(feePayerKey.publicKey);
        for (let i = 0; i < members.length; i++) {
          feePayerAccount.send({
            to: members[i].publicKey,
            amount: 5 * 10 ** 9,
          }); // 5 Mina
        }
      }
    );
    await tx.sign([feePayerKey.privateKey]).send();
    await waitConfig(2 * 60 * 1000);
  }

  if (true) {
    await compile(UpdateKey, 'UpdateKey', profiling);

    await compile(ReduceRound1, 'ReduceRound1', profiling);
    await compile(FinalizeRound1, 'FinalizeRound1', profiling);

    await compile(ReduceRound2, 'ReduceRound2', profiling);
    await compile(BatchEncryption, 'BatchEncryption', profiling);
    await compile(FinalizeRound2, 'FinalizeRound2', profiling);

    await compile(ReduceResponse, 'ReduceResponse', profiling);
    await compile(BatchDecryption, 'BatchDecryption', profiling);
    await compile(CompleteResponse, 'CompleteResponse', profiling);

    await compile(CreateCommittee, 'CreateCommittee', profiling);

    await compile(CreateRequest, 'CreateRequest', profiling);

    await compile(CommitteeContract, 'CommitteeContract', profiling);
    await compile(DKGContract, 'DKGContract', profiling);
    await compile(Round1Contract, 'Round1Contract', profiling);
    await compile(Round2Contract, 'Round2Contract', profiling);
    await compile(ResponseContract, 'ResponseContract', profiling);
    await compile(RequestContract, 'RequestContract', profiling);
  }

  let tx;

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
  await deploy(
    feePayerKey,
    'CommitteeContract',
    [
      ['nextCommitteeId', committeeIndex.add(Field(1))],
      ['memberTreeRoot', memberStorage.level1.getRoot()],
      ['settingTreeRoot', settingStorage.level1.getRoot()],
    ],
    fee,
    ++feePayerNonce
  );
  dkgAddressStorage.addresses.setLeaf(
    dkgAddressStorage.calculateIndex(ZkAppEnum.COMMITTEE).toBigInt(),
    dkgAddressStorage.calculateLeaf(
      contracts[Contract.COMMITTEE].contract.address
    )
  );
  round1AddressStorage.addresses.setLeaf(
    round1AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE).toBigInt(),
    round1AddressStorage.calculateLeaf(
      contracts[Contract.COMMITTEE].contract.address
    )
  );
  round2AddressStorage.addresses.setLeaf(
    round2AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE).toBigInt(),
    round2AddressStorage.calculateLeaf(
      contracts[Contract.COMMITTEE].contract.address
    )
  );
  responseAddressStorage.addresses.setLeaf(
    responseAddressStorage.calculateIndex(ZkAppEnum.COMMITTEE).toBigInt(),
    responseAddressStorage.calculateLeaf(
      contracts[Contract.COMMITTEE].contract.address
    )
  );

  // Deploy dkg contract
  await deploy(
    feePayerKey,
    'DKGContract',
    [['zkApps', dkgAddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );
  round1AddressStorage.addresses.setLeaf(
    round1AddressStorage.calculateIndex(ZkAppEnum.DKG).toBigInt(),
    round1AddressStorage.calculateLeaf(contracts[Contract.DKG].contract.address)
  );
  round2AddressStorage.addresses.setLeaf(
    round2AddressStorage.calculateIndex(ZkAppEnum.DKG).toBigInt(),
    round2AddressStorage.calculateLeaf(contracts[Contract.DKG].contract.address)
  );
  responseAddressStorage.addresses.setLeaf(
    responseAddressStorage.calculateIndex(ZkAppEnum.DKG).toBigInt(),
    responseAddressStorage.calculateLeaf(
      contracts[Contract.DKG].contract.address
    )
  );

  // Deploy round 1 contract
  await deploy(
    feePayerKey,
    'Round1Contract',
    [['zkApps', round1AddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );
  round2AddressStorage.addresses.setLeaf(
    round2AddressStorage.calculateIndex(ZkAppEnum.ROUND1).toBigInt(),
    round2AddressStorage.calculateLeaf(
      contracts[Contract.ROUND1].contract.address
    )
  );
  responseAddressStorage.addresses.setLeaf(
    responseAddressStorage.calculateIndex(ZkAppEnum.ROUND1).toBigInt(),
    responseAddressStorage.calculateLeaf(
      contracts[Contract.ROUND1].contract.address
    )
  );

  // Deploy round 2 contract
  await deploy(
    feePayerKey,
    'Round2Contract',
    [['zkApps', round2AddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );
  responseAddressStorage.addresses.setLeaf(
    responseAddressStorage.calculateIndex(ZkAppEnum.ROUND2).toBigInt(),
    responseAddressStorage.calculateLeaf(
      contracts[Contract.ROUND2].contract.address
    )
  );

  responseAddressStorage.addresses.setLeaf(
    responseAddressStorage.calculateIndex(ZkAppEnum.REQUEST).toBigInt(),
    responseAddressStorage.calculateLeaf(
      contracts[Contract.REQUEST].contract.address
    )
  );

  // Deploy response contract
  await deploy(
    feePayerKey,
    'ResponseContract',
    [['zkApps', responseAddressStorage.addresses.getRoot()]],
    fee,
    ++feePayerNonce
  );

  let requestContract = contracts[Contract.REQUEST].contract as RequestContract;

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      AccountUpdate.fundNewAccount(feePayerKey.publicKey);
      requestContract.deploy();
      requestContract.responeContractAddress.set(
        contracts[Contract.REQUEST].contract.address
      );
      let feePayerAccount = AccountUpdate.createSigned(feePayerKey.publicKey);
      feePayerAccount.send({
        to: contracts[Contract.REQUEST].contract,
        amount: 10 * 10 ** 9,
      }); // 10 Mina
    }
  );
  await tx
    .sign([feePayerKey.privateKey, contracts[Contract.REQUEST].key.privateKey])
    .send();

  await wait();

  console.log('Should reduce dkg actions and generate new keys');
  await fetchAllContract(contracts);
  let dkgContract = contracts[Contract.DKG].contract as DKGContract;
  let initialActionState = Reducer.initialActionState;
  let initialKeyCounter = EMPTY_LEVEL_1_TREE().getRoot();
  let initialKeyStatus = EMPTY_LEVEL_1_TREE().getRoot();

  for (let i = 0; i < 1; i++) {
    let action = dkgActions[ActionEnum.GENERATE_KEY][i];
    let memberWitness = memberStorage.getWitness(
      memberStorage.calculateLevel1Index(committeeIndex),
      memberStorage.calculateLevel2Index(Field(i))
    );
    let tx = await Mina.transaction(
      { sender: members[i].publicKey, fee, nonce: ++memberNonces[i] },
      () => {
        dkgContract.committeeAction(
          action.committeeId,
          action.keyId,
          Field(i),
          Field(ActionEnum.GENERATE_KEY),
          getZkAppRef(
            commmitteeAddressStorage.addresses,
            ZkAppEnum.COMMITTEE,
            contracts[Contract.COMMITTEE].contract.address
          ),
          memberWitness
        );
      }
    );
    await proveAndSend(tx, members[i], 'DKGContract', 'committeeAction');
  }
  await wait();
  await fetchAllContract(contracts);

  console.log('Generate first step proof UpdateKey...');
  if (profiling) DKGProfiler.start('UpdateKey.firstStep');
  let updateKeyProof = await UpdateKey.firstStep(
    DKGAction.empty(),
    initialKeyCounter,
    initialKeyStatus,
    initialActionState
  );
  if (profiling) DKGProfiler.stop();
  console.log('DONE!');

  for (let i = 0; i < 1; i++) {
    let action = dkgActions[ActionEnum.GENERATE_KEY][i];
    console.log(`Generate step ${i + 1} proof UpdateKey...`);
    if (profiling) DKGProfiler.start('UpdateKey.nextStepGeneration');
    updateKeyProof = await UpdateKey.nextStepGeneration(
      action,
      updateKeyProof,
      Field(i),
      keyCounterStorage.getWitness(
        keyCounterStorage.calculateLevel1Index(action.committeeId)
      ),
      keyStatusStorage.getWitness(
        keyStatusStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: Field(i),
        })
      )
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    keyCounterStorage.updateLeaf(
      keyCounterStorage.calculateLeaf(Field(i + 1)),
      keyCounterStorage.calculateLevel1Index(action.committeeId)
    );

    keyStatusStorage.updateLeaf(
      Provable.switch(action.mask.values, Field, [
        Field(KeyStatus.ROUND_1_CONTRIBUTION),
        Field(KeyStatus.ROUND_2_CONTRIBUTION),
        Field(KeyStatus.ACTIVE),
        Field(KeyStatus.DEPRECATED),
      ]),
      keyStatusStorage.calculateLevel1Index({
        committeeId: action.committeeId,
        keyId: Field(i),
      })
    );
  }

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      dkgContract.updateKeys(updateKeyProof);
    }
  );
  await proveAndSend(tx, feePayerKey, 'DKGContract', 'updateKeys');

  await wait();
  await fetchAllContract(contracts);

  console.log('Should contribute round 1 successfully');

  let round1Contract = contracts[Contract.ROUND1].contract as Round1Contract;
  for (let i = 0; i < N; i++) {
    let secret = generateRandomPolynomialWithInputRandom(randomInputs[i], T, N);
    secrets.push(secret);
    let contribution = getRound1Contribution(secret);
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

    let tx = await Mina.transaction(
      { sender: members[i].publicKey, fee, nonce: ++memberNonces[i] },
      () => {
        round1Contract.contribute(
          action.committeeId,
          action.keyId,
          contribution.C,
          getZkAppRef(
            round1AddressStorage.addresses,
            ZkAppEnum.COMMITTEE,
            contracts[Contract.COMMITTEE].contract.address
          ),
          memberWitness
        );
      }
    );
    await proveAndSend(tx, members[i], 'Round1Contract', 'contribute');
  }
  await wait();
  await fetchAllContract(contracts);

  publicKeys.push(calculatePublicKey(round1Actions.map((e) => e.contribution)));

  console.log('Should reduce round 1 successfully');

  round1Contract = contracts[Contract.ROUND1].contract as Round1Contract;

  await fetchAllContract(contracts);

  let initialReduceState = round1Contract.reduceState.get();
  initialActionState = contracts[Contract.ROUND1].actionStates[0];

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
      round1ReduceStorage.calculateIndex(
        contracts[Contract.ROUND1].actionStates[i + 1]
      ),
      round1ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
    );
  }

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      round1Contract.reduce(reduceProof);
    }
  );
  await proveAndSend(tx, feePayerKey, 'Round1Contract', 'reduce');
  await wait();

  console.log('Should finalize round 1 and update key correctly');
  await fetchAllContract(contracts);
  round1Contract = contracts[Contract.ROUND1].contract as Round1Contract;
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
    round1ContributionStorage.calculateLevel1Index({
      committeeId: Field(0),
      keyId: Field(0),
    }),
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

  await fetchAllContract(contracts);
  dkgContract = contracts[Contract.DKG].contract as DKGContract;
  let initialDKGActionState = dkgContract.account.actionState.get();
  // Fix cung tam thoi
  // let initialDKGActionState = Field.from(
  //   '8886431337458661261465179973317790197997432504792388514835180722603612099406'
  // );
  initialKeyCounter = dkgContract.keyCounter.get();
  initialKeyStatus = dkgContract.keyStatus.get();
  let action = new DKGAction({
    committeeId: committeeIndex,
    keyId: Field(0),
    mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_1],
  });
  dkgActions[ActionEnum.FINALIZE_ROUND_1].push(action);

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      round1Contract.finalize(
        finalizeProof,
        getZkAppRef(
          round1AddressStorage.addresses,
          ZkAppEnum.COMMITTEE,
          contracts[Contract.COMMITTEE].contract.address
        ),
        getZkAppRef(
          round1AddressStorage.addresses,
          ZkAppEnum.DKG,
          contracts[Contract.DKG].contract.address
        ),
        settingStorage.getWitness(committeeIndex),
        keyStatusStorage.getWitness(
          keyStatusStorage.calculateLevel1Index({
            committeeId: Field(0),
            keyId: Field(0),
          })
        )
      );
    }
  );
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  await proveAndSend(tx, feePayerKey, 'Round1Contract', 'finalize');

  await wait();

  await fetchAllContract(contracts);

  console.log('Generate first step proof UpdateKey...');
  if (profiling) DKGProfiler.start('UpdateKey.firstStep');
  updateKeyProof = await UpdateKey.firstStep(
    DKGAction.empty(),
    initialKeyCounter,
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

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      dkgContract.updateKeys(updateKeyProof);
    }
  );
  await proveAndSend(tx, feePayerKey, 'DKGContract', 'updateKeys');
  await wait();
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  await fetchAllContract(contracts);

  console.log('Should contribute round 2 successfully');
  let round2Contract = contracts[Contract.ROUND2].contract as Round2Contract;
  for (let i = 0; i < N; i++) {
    // let randoms = [...Array(N).keys()].map((e) => Scalar.random());
    let round2Contribution = getRound2Contribution(
      secrets[i],
      i + 1,
      round1Actions.map((e) => e.contribution),
      randoms[i]
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
      new PlainArray(secrets[i].f.map((e) => CustomScalar.fromScalar(e))),
      new RandomArray(randoms[i].map((e) => CustomScalar.fromScalar(e)))
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');
    encryptionProofs.push(encryptionProof);

    let memberWitness = memberStorage.getWitness(
      memberStorage.calculateLevel1Index(committeeIndex),
      memberStorage.calculateLevel2Index(Field(i))
    );

    let tx = await Mina.transaction(
      { sender: members[i].publicKey, fee, nonce: ++memberNonces[i] },
      () => {
        round2Contract.contribute(
          action.committeeId,
          action.keyId,
          encryptionProof,
          getZkAppRef(
            round2AddressStorage.addresses,
            ZkAppEnum.COMMITTEE,
            contracts[Contract.COMMITTEE].contract.address
          ),
          getZkAppRef(
            round1AddressStorage.addresses,
            ZkAppEnum.ROUND1,
            contracts[Contract.ROUND1].contract.address
          ),
          memberWitness,
          publicKeyStorage.getLevel1Witness(
            publicKeyStorage.calculateLevel1Index({
              committeeId: committeeIndex,
              keyId: Field(0),
            })
          )
        );
      }
    );
    await proveAndSend(tx, members[i], 'Round2Contract', 'contribute');
  }
  await wait();
  await fetchAllContract(contracts);

  console.log('Should reduce round 2 successfully');
  round2Contract = contracts[Contract.ROUND2].contract as Round2Contract;
  await fetchAllContract(contracts);
  initialReduceState = round2Contract.reduceState.get();
  initialActionState = contracts[Contract.ROUND2].actionStates[0];

  console.log('Generate first step proof ReduceRound2...');
  if (profiling) DKGProfiler.start('ReduceRound2.firstStep');
  let reduceProof2 = await ReduceRound2.firstStep(
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
    reduceProof2 = await ReduceRound2.nextStep(
      action,
      reduceProof2,
      round2ReduceStorage.getWitness(
        contracts[Contract.ROUND2].actionStates[i + 1]
      )
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    round2ReduceStorage.updateLeaf(
      round2ReduceStorage.calculateIndex(
        contracts[Contract.ROUND2].actionStates[i + 1]
      ),
      round2ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
    );
  }

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      round2Contract.reduce(reduceProof2);
    }
  );

  await proveAndSend(tx, feePayerKey, 'Round2Contract', 'reduce');
  await wait();
  await fetchAllContract(contracts);

  console.log('Should finalize round 2 and update key correctly');
  round2Contract = contracts[Contract.ROUND2].contract as Round2Contract;
  initialContributionRoot = round2Contract.contributions.get();
  reduceStateRoot = round2Contract.reduceState.get();
  let initialHashArray = new EncryptionHashArray(
    [...Array(N).keys()].map((e) => Field(0))
  );

  console.log('Generate first step proof FinalizeRound2...');
  if (profiling) DKGProfiler.start('FinalizeRound2.firstStep');
  let finalizeProof2 = await FinalizeRound2.firstStep(
    new Round2Input({
      previousActionState: Field(0),
      action: Round2Action.empty(),
    }),
    Field(T),
    Field(N),
    initialContributionRoot,
    reduceStateRoot,
    round2ContributionStorage.calculateLevel1Index({
      committeeId: Field(0),
      keyId: Field(0),
    }),
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

  encryptionStorage.updateInternal(
    encryptionStorage.calculateLevel1Index({
      committeeId: Field(0),
      keyId: Field(0),
    }),
    DKG_LEVEL_2_TREE()
  );

  for (let i = 0; i < N; i++) {
    let action = round2Actions[i];
    console.log(`Generate step ${i + 1} proof FinalizeRound2...`);
    if (profiling) DKGProfiler.start('FinalizeRound2.nextStep');
    finalizeProof2 = await FinalizeRound2.nextStep(
      new Round2Input({
        previousActionState: contracts[Contract.ROUND2].actionStates[i],
        action: action,
      }),
      finalizeProof2,
      round2ContributionStorage.getWitness(
        round2ContributionStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        round2ContributionStorage.calculateLevel2Index(action.memberId)
      ),
      round2ReduceStorage.getWitness(
        round2ReduceStorage.calculateIndex(
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
        memberId: action.memberId,
      }),
      encryptionStorage.calculateLevel1Index({
        committeeId: action.committeeId,
        keyId: action.keyId,
      }),
      encryptionStorage.calculateLevel2Index(action.memberId)
    );
  }

  dkgContract = contracts[Contract.DKG].contract as DKGContract;
  await fetchAllContract(contracts);
  initialDKGActionState = dkgContract.account.actionState.get();
  initialKeyCounter = dkgContract.keyCounter.get();
  initialKeyStatus = dkgContract.keyStatus.get();
  action = new DKGAction({
    committeeId: committeeIndex,
    keyId: Field(0),
    mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_2],
  });
  dkgActions[ActionEnum.FINALIZE_ROUND_2].push(action);

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      round2Contract.finalize(
        finalizeProof2,
        encryptionStorage.getLevel1Witness(
          encryptionStorage.calculateLevel1Index({
            committeeId: committeeIndex,
            keyId: Field(0),
          })
        ),
        getZkAppRef(
          round2AddressStorage.addresses,
          ZkAppEnum.COMMITTEE,
          contracts[Contract.COMMITTEE].contract.address
        ),
        getZkAppRef(
          round2AddressStorage.addresses,
          ZkAppEnum.DKG,
          contracts[Contract.DKG].contract.address
        ),
        settingStorage.getWitness(committeeIndex),
        keyStatusStorage.getWitness(
          keyStatusStorage.calculateLevel1Index({
            committeeId: Field(0),
            keyId: Field(0),
          })
        )
      );
    }
  );

  await proveAndSend(tx, feePayerKey, 'Round2Contract', 'finalize');
  await wait();

  await fetchAllContract(contracts);

  console.log('Generate first step proof UpdateKey...');
  if (profiling) DKGProfiler.start('UpdateKey.firstStep');
  updateKeyProof = await UpdateKey.firstStep(
    DKGAction.empty(),
    initialKeyCounter,
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

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      dkgContract.updateKeys(updateKeyProof);
    }
  );

  await proveAndSend(tx, feePayerKey, 'DKGContract', 'updateKeys');
  await wait();
  await fetchAllContract(contracts);
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  console.log('Should contribute response successfully');
  let responseContract = contracts[Contract.RESPONSE]
    .contract as ResponseContract;
  for (let i = 0; i < mockRequests.length; i++) {
    let encryptedVector = generateEncryptionWithRandomInput(
      randomForGenerateEncyption[i],
      calculatePublicKey(round1Actions.map((e) => e.contribution)),
      mockRequests[i]
    );
    R.push(encryptedVector.R);
    M.push(encryptedVector.M);
  }

  let accumulatedEncryption = accumulateEncryption(R, M);
  sumR = accumulatedEncryption.sumR;
  sumM = accumulatedEncryption.sumM;

  for (let i = 0; i < T; i++) {
    let memberId = responsedMembers[i];
    let [contribution, ski] = getResponseContribution(
      secrets[memberId],
      memberId,
      round2Actions.map(
        (e) =>
          ({
            c: e.contribution.c.get(Field(memberId)),
            U: e.contribution.U.get(Field(memberId)),
          } as Round2Data)
      ),
      sumR
    );
    let action = new ResponseAction({
      committeeId: Field(0),
      keyId: Field(0),
      memberId: Field(memberId),
      requestId: requestId,
      contribution: contribution,
    });
    responseActions.push(action);

    console.log(`Generate proof BatchDecryption...`);
    if (profiling) DKGProfiler.start('BatchDecryption.decrypt');
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
      new PlainArray(
        secrets.map((e) => CustomScalar.fromScalar(e.f[memberId]))
      ),
      secrets[memberId].a[0]
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');
    decryptionProofs.push(decryptionProof);

    let memberWitness = memberStorage.getWitness(
      memberStorage.calculateLevel1Index(committeeIndex),
      memberStorage.calculateLevel2Index(Field(memberId))
    );

    let tx = await Mina.transaction(
      { sender: members[i].publicKey, fee, nonce: ++memberNonces[i] },
      () => {
        responseContract.contribute(
          action.committeeId,
          action.keyId,
          action.requestId,
          decryptionProof,
          new RArray(sumR),
          ski,
          getZkAppRef(
            responseAddressStorage.addresses,
            ZkAppEnum.COMMITTEE,
            contracts[Contract.COMMITTEE].contract.address
          ),
          getZkAppRef(
            responseAddressStorage.addresses,
            ZkAppEnum.ROUND1,
            contracts[Contract.ROUND1].contract.address
          ),
          getZkAppRef(
            responseAddressStorage.addresses,
            ZkAppEnum.ROUND2,
            contracts[Contract.ROUND2].contract.address
          ),
          memberWitness,
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
          )
        );
      }
    );
    await proveAndSend(
      tx,
      members[responsedMembers[i]],
      'ResponseContract',
      'contribute'
    );
  }
  await wait();
  await fetchAllContract(contracts);

  console.log('Should reduce response successfully');
  responseContract = contracts[Contract.RESPONSE].contract as ResponseContract;
  await fetchAllContract(contracts);
  initialReduceState = responseContract.reduceState.get();
  initialActionState = contracts[Contract.RESPONSE].actionStates[0];

  console.log('Generate first step proof ReduceResponse...');
  if (profiling) DKGProfiler.start('ReduceResponse.firstStep');
  let reduceProof3 = await ReduceResponse.firstStep(
    responseActions[0],
    initialReduceState,
    initialActionState
  );
  if (profiling) DKGProfiler.stop();
  console.log('DONE!');

  for (let i = 0; i < T; i++) {
    let action = responseActions[i];
    console.log(`Generate step ${i + 1} proof ReduceResponse...`);
    if (profiling) DKGProfiler.start('ReduceResponse.nextStep');
    reduceProof3 = await ReduceResponse.nextStep(
      action,
      reduceProof3,
      responseReduceStorage.getWitness(
        contracts[Contract.RESPONSE].actionStates[i + 1]
      )
    );
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');

    responseReduceStorage.updateLeaf(
      responseReduceStorage.calculateIndex(
        contracts[Contract.RESPONSE].actionStates[i + 1]
      ),
      responseReduceStorage.calculateLeaf(ActionStatus.REDUCED)
    );
  }

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      responseContract.reduce(reduceProof3);
    }
  );
  await proveAndSend(tx, feePayerKey, 'ResponseContract', 'reduce');
  await wait();

  console.log('Should complete response correctly');
  responseContract = contracts[Contract.RESPONSE].contract as ResponseContract;
  await fetchAllContract(contracts);
  initialContributionRoot = responseContract.contributions.get();
  reduceStateRoot = responseContract.reduceState.get();

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
    reduceStateRoot,
    requestId,
    responseContributionStorage.getLevel1Witness(
      responseContributionStorage.calculateLevel1Index(requestId)
    )
  );
  if (profiling) DKGProfiler.stop();
  console.log('DONE!');

  responseContributionStorage.updateInternal(
    responseContributionStorage.calculateLevel1Index(requestId),
    DKG_LEVEL_2_TREE()
  );

  for (let i = 0; i < T; i++) {
    logMemUsage();
    let action = responseActions[i];
    console.log(`Generate step ${i + 1} proof CompleteResponse...`);
    if (profiling) DKGProfiler.start('CompleteResponse.nextStep');
    completeProof = await CompleteResponse.nextStep(
      new ResponseInput({
        previousActionState: contracts[Contract.RESPONSE].actionStates[i],
        action: action,
      }),
      completeProof,
      responseContributionStorage.getWitness(
        responseContributionStorage.calculateLevel1Index(requestId),
        responseContributionStorage.calculateLevel2Index(action.memberId)
      ),
      responseReduceStorage.getWitness(
        responseReduceStorage.calculateIndex(
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

  tx = await Mina.transaction(
    { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    () => {
      responseContract.complete(
        completeProof,
        getZkAppRef(
          responseAddressStorage.addresses,
          ZkAppEnum.COMMITTEE,
          contracts[Contract.COMMITTEE].contract.address
        ),
        getZkAppRef(
          responseAddressStorage.addresses,
          ZkAppEnum.DKG,
          contracts[Contract.DKG].contract.address
        ),
        getZkAppRef(
          responseAddressStorage.addresses,
          ZkAppEnum.REQUEST,
          contracts[Contract.REQUEST].contract.address
        ),
        settingStorage.getWitness(committeeIndex),
        keyStatusStorage.getWitness(
          keyStatusStorage.calculateLevel1Index({
            committeeId: Field(0),
            keyId: Field(0),
          })
        )
      );
    }
  );
  await proveAndSend(tx, feePayerKey, 'ResponseContract', 'contribute');
  console.log('DONE ALLLLLLLLLLLLLLLLLLLLLL');
  console.timeEnd('runTime');
}

main();
