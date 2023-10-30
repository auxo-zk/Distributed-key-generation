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
  Committee,
  createCommitteeProof,
  GroupArray,
  CommitteeRollupState,
  CommitteeMerkleWitness,
  CheckMemberInput,
  CheckConfigInput,
} from '../contracts/Committee.js';

import { MockDKGContract } from '../contracts/MockDKGContract.js';

const doProofs = false;

describe('Committee', () => {
  const EmptyMerkleMap = new MerkleMap();
  const treeHeight = 6; // setting max 32 member
  const memberMerkleMap = new MerkleMap();
  const settingMerkleMap = new MerkleMap();
  class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {}

  let { keys, addresses } = randomAccounts(
    'committee',
    'p1',
    'p2',
    'p3',
    'p4',
    'p5'
  );
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let committeeContract: Committee;
  let proof: Proof<CommitteeRollupState, CommitteeRollupState>;
  let myGroupArray1: GroupArray;
  let threshold1 = Field(1);
  let threshold2 = Field(2);
  let myGroupArray2: GroupArray;
  let tree1: MerkleTree;
  let tree2: MerkleTree;

  const ActionCommitteeProfiler = getProfiler('Testing committee');

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    committeeContract = new Committee(addresses.committee);
    if (doProofs) {
      await Committee.compile();
    } else {
      // createCommitteeProof.analyzeMethods();
      Committee.analyzeMethods();
    }

    let tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 1);
      committeeContract.deploy();
    });
    await tx.sign([feePayerKey, keys.committee]).send();

    if (!doProofs) await MockDKGContract.compile();
  });

  // beforeEach(() => {});

  it('Create commitee consist of 2 people with threshhold 1, and test deploy DKG', async () => {
    let arrayAddress = [];
    arrayAddress.push(addresses.p1, addresses.p2);
    arrayAddress = arrayAddress.map((value) => {
      return value.toGroup();
    });

    myGroupArray1 = new GroupArray(arrayAddress);

    let tx = await Mina.transaction(feePayer, () => {
      committeeContract.createCommittee(myGroupArray1, threshold1);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
  });

  it('Create commitee consist of 3 people with threshhold 2', async () => {
    let arrayAddress = [];
    arrayAddress.push(addresses.p3, addresses.p4, addresses.p5);
    arrayAddress = arrayAddress.map((value) => {
      return value.toGroup();
    });

    myGroupArray2 = new GroupArray(arrayAddress);

    let tx = await Mina.transaction(feePayer, () => {
      committeeContract.createCommittee(myGroupArray2, Field(2));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
  });

  it('compile proof', async () => {
    // compile proof
    await createCommitteeProof.compile();
  });

  it('create proof first step...', async () => {
    // create first step proof
    proof = await createCommitteeProof.firstStep(
      new CommitteeRollupState({
        actionHash: Reducer.initialActionState,
        memberTreeRoot: EmptyMerkleMap.getRoot(),
        settingTreeRoot: EmptyMerkleMap.getRoot(),
        currentCommitteeId: committeeContract.nextCommitteeId.get(),
      })
    );
    expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);
    expect(proof.publicInput.currentCommitteeId).toEqual(Field(0));
  });

  it('create proof next step 1...', async () => {
    proof = await createCommitteeProof.nextStep(
      proof.publicInput,
      proof,
      myGroupArray1,
      memberMerkleMap.getWitness(Field(0)),
      settingMerkleMap.getWitness(Field(0)),
      threshold1
    );

    expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);

    ////// udpate data to local

    // memberMerkleTree.set
    tree1 = new MerkleTree(treeHeight);
    for (let i = 0; i < 32; i++) {
      tree1.setLeaf(BigInt(i), GroupArray.hash(myGroupArray1.get(Field(i))));
    }

    memberMerkleMap.set(Field(0), tree1.getRoot());
    settingMerkleMap.set(
      Field(0),
      Poseidon.hash([Field(1), myGroupArray1.length])
    );
  });

  it('create proof next step 2...', async () => {
    proof = await createCommitteeProof.nextStep(
      proof.publicInput,
      proof,
      myGroupArray2,
      memberMerkleMap.getWitness(Field(1)),
      settingMerkleMap.getWitness(Field(1)),
      threshold2 // threshold
    );

    expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);
    ////// udpate data to local

    // memberMerkleTree.set
    tree2 = new MerkleTree(treeHeight);
    for (let i = 0; i < 32; i++) {
      tree2.setLeaf(BigInt(i), GroupArray.hash(myGroupArray2.get(Field(i))));
    }

    memberMerkleMap.set(Field(1), tree2.getRoot());
    settingMerkleMap.set(
      Field(1),
      Poseidon.hash([Field(2), myGroupArray2.length])
    );
  });

  it('committeeContract rollupIncrements', async () => {
    let tx = await Mina.transaction(feePayer, () => {
      committeeContract.rollupIncrements(proof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
  });

  it('check if p2 belong to committee 0', async () => {
    // check if memerber belong to committeeId
    let checkInput = new CheckMemberInput({
      address: addresses.p2.toGroup(),
      commiteeId: Field(0),
      memberMerkleTreeWitness: new CommitteeMerkleWitness(tree1.getWitness(1n)),
      memberMerkleMapWitness: memberMerkleMap.getWitness(Field(0)),
    });
    let tx = await Mina.transaction(feePayer, () => {
      committeeContract.checkMember(checkInput);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
  });

  it('check if p2 belong to committee 1: to throw error', async () => {
    // check if memerber belong to committeeId
    let checkInput = new CheckMemberInput({
      address: addresses.p2.toGroup(),
      commiteeId: Field(1),
      memberMerkleTreeWitness: new CommitteeMerkleWitness(tree1.getWitness(1n)),
      memberMerkleMapWitness: memberMerkleMap.getWitness(Field(1)),
    });
    expect(() => {
      committeeContract.checkMember(checkInput);
    }).toThrowError();
  });
});
