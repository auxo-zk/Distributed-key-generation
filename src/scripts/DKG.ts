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
  getResponseContribution,
  getRound1Contribution,
  getRound2Contribution,
} from '../libs/Committee.js';
import { ZkAppEnum, Contract } from '../constants.js';
import {
  RArray,
  accumulateEncryption,
  generateEncryption,
} from '../libs/Requestor.js';
import { RequestContract, CreateRequest } from '../contracts/Request.js';

let action = 0; // deploy all contract

async function main() {
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
    if (profiling) DKGProfiler.start(`${contractName}.${methodName}.prove`);
    await tx.prove();
    if (profiling) DKGProfiler.stop();
    console.log('DONE!');
    await tx.sign([feePayer.privateKey]).send();
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

  let feepayerKeysBase58: { privateKey: string; publicKey: string } =
    JSON.parse(
      await fs.readFile(configJson.deployAliases['dkg'].feepayerKeyPath, 'utf8')
    );

  feePayerKey = {
    privateKey: PrivateKey.fromBase58(feepayerKeysBase58.privateKey),
    publicKey: PrivateKey.fromBase58(
      feepayerKeysBase58.privateKey
    ).toPublicKey(),
  };

  const doProofs = false;
  const profiling = false;
  const logMemory = true;
  const cache = Cache.FileSystem('./caches');
  const DKGProfiler = getProfiler('Benchmark DKG');

  // just to use local account
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });

  const Network = Mina.Network(configJson.deployAliases['dkg'].url);
  const fee = Number(configJson.deployAliases['dkg'].fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
  Mina.setActiveInstance(Network);

  let sender = await fetchAccount({ publicKey: feePayerKey.publicKey });
  let currentNonce = Number(sender.account?.nonce);

  let committeeIndex = Field(0);
  let T = 2,
    N = 3;

  let members: Key[] = Local.testAccounts.slice(1, N + 1);
  let responsedMembers = [2, 0];
  let secrets: SecretPolynomial[] = [];
  let publicKeys: Group[] = [];
  let requestId = Field(0);
  let mockRequests = [
    [1000n, 2000n, 3000n],
    [4000n, 3000n, 2000n],
  ];
  let R: Group[][] = [];
  let M: Group[][] = [];
  let sumR: Group[] = [];
  let sumM: Group[] = [];
  let D: Group[][] = [];

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
            return new SmartContract(key.publicKey);
        }
      })();
      contracts[e.toLowerCase()] = {
        key: key,
        contract: contract,
        actionStates: [Reducer.initialActionState],
      };
    });

  if (action == 0) {
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

  if (action == 0) {
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
      currentNonce
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
      currentNonce + 1
    );
    round1AddressStorage.addresses.setLeaf(
      round1AddressStorage.calculateIndex(ZkAppEnum.DKG).toBigInt(),
      round1AddressStorage.calculateLeaf(
        contracts[Contract.DKG].contract.address
      )
    );
    round2AddressStorage.addresses.setLeaf(
      round2AddressStorage.calculateIndex(ZkAppEnum.DKG).toBigInt(),
      round2AddressStorage.calculateLeaf(
        contracts[Contract.DKG].contract.address
      )
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
      currentNonce + 2
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
      currentNonce + 3
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
      currentNonce + 4
    );

    let requestContract = contracts[Contract.REQUEST]
      .contract as RequestContract;

    let tx = await Mina.transaction(
      { sender: feePayerKey.publicKey, fee, nonce: currentNonce + 5 },
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
      .sign([
        feePayerKey.privateKey,
        contracts[Contract.REQUEST].key.privateKey,
      ])
      .send();
  }

  if (profiling) DKGProfiler.store();
}

main();
