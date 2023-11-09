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
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    // committeeContract = new Committee(addresses.committee);
    // if (doProofs) {
    //   await Committee.compile();
    // } else {
    //   // createCommitteeProof.analyzeMethods();
    //   Committee.analyzeMethods();
    // }
    // let tx = await Mina.transaction(feePayer, () => {
    //   AccountUpdate.fundNewAccount(feePayer, 1);
    //   committeeContract.deploy();
    // });
    // await tx.sign([feePayerKey, keys.committee]).send();
    // if (!doProofs) await MockDKGContract.compile();
    // // set verification key
    // tx = await Mina.transaction(feePayer, () => {
    //   committeeContract.setVkDKGHash(MockDKGContract._verificationKey!);
    // });
    // await tx.prove();
    // await tx.sign([feePayerKey]).send();
  });

  // beforeEach(() => {jest.setTimeout(2000000)});

  it('Should compile all ZK programs', async () => {
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
    // DKGProfiler.start('Elgamal.compile');
    // await Elgamal.compile();
    // DKGProfiler.stop();
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
    // console.log(DKGContract.analyzeMethods());
  });

  afterAll(async () => {
    DKGProfiler.stop().store();
  });
});
