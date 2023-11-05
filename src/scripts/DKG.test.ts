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
} from '../contracts/DKG.js';
import {
  BatchDecryption,
  BatchEncryption,
  Elgamal,
} from '../contracts/Encryption.js';

const doProofs = false;

describe('Committee', () => {
  const EmptyMerkleMap = new MerkleMap();
  const treeHeight = 6; // setting max 32 member
  const memberMerkleMap = new MerkleMap();
  const dkgAddressMerkleMap = new MerkleMap();
  const settingMerkleMap = new MerkleMap();
  class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {}

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
    // let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    // Mina.setActiveInstance(Local);
    // feePayerKey = Local.testAccounts[0].privateKey;
    // feePayer = Local.testAccounts[0].publicKey;
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

  // beforeEach(() => {});

  it('Should compile all ZK programs', async () => {
    // DKGProfiler.start('GenerateKey.compile');
    // await GenerateKey.compile();
    // DKGProfiler.stop();
    // console.log(GenerateKey.analyzeMethods());
    // DKGProfiler.start('DeprecateKey.compile');
    // await DeprecateKey.compile();
    // DKGProfiler.stop();
    // console.log(DeprecateKey.analyzeMethods());
    // DKGProfiler.start('FinalizeRound1.compile');
    // await FinalizeRound1.compile();
    // DKGProfiler.stop();
    // console.log(FinalizeRound1.analyzeMethods());
    // DKGProfiler.start('Elgamal.compile');
    // await Elgamal.compile();
    // DKGProfiler.stop();
    // console.log(Elgamal.analyzeMethods());
    // DKGProfiler.start('BatchEncryption.compile');
    // await BatchEncryption.compile();
    // DKGProfiler.stop();
    // console.log(BatchEncryption.analyzeMethods());
    // DKGProfiler.start('FinalizeRound2.compile');
    // await FinalizeRound2.compile();
    // DKGProfiler.stop();
    // console.log(FinalizeRound2.analyzeMethods());
    // DKGProfiler.start('BatchDecryption.compile');
    // await BatchDecryption.compile();
    // DKGProfiler.stop();
    // console.log(BatchDecryption.analyzeMethods());
    // DKGProfiler.start('CompleteResponse.compile');
    // await CompleteResponse.compile();
    // DKGProfiler.stop();
    // console.log(CompleteResponse.analyzeMethods());
    DKGProfiler.start('DKGContract.compile');
    await DKGContract.compile();
    DKGProfiler.stop();
    console.log(DKGContract.analyzeMethods());
  });

  afterAll(async () => {
    DKGProfiler.stop().store();
  });
});
