import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
  MerkleMap,
  MerkleTree,
  MerkleWitness,
  Proof,
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
} from '../contracts/DKG.js';
import {
  BatchDecryption,
  BatchEncryption,
  Elgamal,
} from '../contracts/Encryption.js';
import { Config, Key } from './helper/config.js';
import fs from 'fs';
import { Committee } from '../contracts/index.js';
import { CommitteeContract } from '../contracts/Committee.js';

const doProofs = false;

describe('DKG', () => {
  const EmptyMerkleMap = new MerkleMap();
  const treeHeight = 6; // setting max 32 member
  const memberMerkleMap = new MerkleMap();
  const dkgAddressMerkleMap = new MerkleMap();
  const settingMerkleMap = new MerkleMap();
  class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {}
  let feePayerKey: any;
  let feePayer: any;
  let contractKey: any;
  let committeeContract: any;
  let dkgContract: any;

  let { keys, addresses } = randomAccounts(
    'committee',
    'dkg1',
    'dkg2',
    'p1',
    'p2',
    'p3',
    'p4',
    'p5'
  );

  const DKGProfiler = getProfiler('Benchmark DKG');
  DKGProfiler.start('DKG test flow');

  beforeAll(async () => {
    let configJson: Config = JSON.parse(await fs.readFileSync('config.json', 'utf8'));
    let dkgConfig = configJson.deployAliases['dkg'];
    let committeeConfig = configJson.deployAliases['committee'];

    let feePayerKeysBase58: { privateKey: string; publicKey: string } =
    JSON.parse(await fs.readFileSync(dkgConfig.feepayerKeyPath, 'utf8'));
    let feePayer: Key = {
      privateKey: PrivateKey.fromBase58(feePayerKeysBase58.privateKey),
      publicKey: PublicKey.fromBase58(feePayerKeysBase58.publicKey),
    }

    let dkgKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
      await fs.readFileSync(dkgConfig.keyPath, 'utf8')
    );
    let dkg: Key = {
      privateKey: PrivateKey.fromBase58(dkgKeysBase58.privateKey),
      publicKey: PublicKey.fromBase58(dkgKeysBase58.publicKey),
    }

    let committeeKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
      await fs.readFileSync(committeeConfig.keyPath, 'utf8')
    );
    let committee: Key = {
      privateKey: PrivateKey.fromBase58(committeeKeysBase58.privateKey),
      publicKey: PublicKey.fromBase58(committeeKeysBase58.publicKey),
    }

    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    // const Network = Mina.Network(dkgConfig.url);
    // const fee = Number(dkgConfig.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
    // Mina.setActiveInstance(Network);
    let committeeContract = new CommitteeContract(committee.publicKey);
    let dkgContract = new DKGContract(dkg.publicKey);
  });

  xit('Should compile all ZK programs', async () => {
    console.log('Compiling ReduceActions...');
    DKGProfiler.start('ReduceActions.compile');
    await ReduceActions.compile();
    DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling GenerateKey...');
    DKGProfiler.start('GenerateKey.compile');
    await GenerateKey.compile();
    DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling DeprecateKey...');
    DKGProfiler.start('DeprecateKey.compile');
    await DeprecateKey.compile();
    DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling FinalizeRound1...');
    DKGProfiler.start('FinalizeRound1.compile');
    await FinalizeRound1.compile();
    DKGProfiler.stop();
    console.log('Done!');
    DKGProfiler.start('Elgamal.compile');
    await Elgamal.compile();
    DKGProfiler.stop();
    console.log('Compiling BatchEncryption...');
    DKGProfiler.start('BatchEncryption.compile');
    await BatchEncryption.compile();
    DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling FinalizeRound2...');
    DKGProfiler.start('FinalizeRound2.compile');
    await FinalizeRound2.compile();
    DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling BatchDecryption...');
    DKGProfiler.start('BatchDecryption.compile');
    await BatchDecryption.compile();
    DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling CompleteResponse...');
    DKGProfiler.start('CompleteResponse.compile');
    await CompleteResponse.compile();
    DKGProfiler.stop();
    console.log('Done!');
    console.log('Compiling DKGContract...');
    DKGProfiler.start('DKGContract.compile');
    await DKGContract.compile();
    DKGProfiler.stop();
    console.log('Done!');
  });

  afterAll(async () => {
    DKGProfiler.stop().store();
  });
});
