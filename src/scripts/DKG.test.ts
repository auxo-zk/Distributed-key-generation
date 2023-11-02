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
import { DKGContract } from '../contracts/DKG.js';

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

  const ActionCommitteeProfiler = getProfiler('Testing committee');

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

  it('Should compile', async () => {
    // await DKGContract.compile();
    DKGContract.analyzeMethods();
  });
});
