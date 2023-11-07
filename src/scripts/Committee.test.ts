import {
  Field,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
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
  CommitteeInput,
  CreateCommittee,
  MemberArray,
  CommitteeRollupState,
  CommitteeMerkleWitness,
  CheckMemberInput,
  CheckConfigInput,
} from '../contracts/Committee.js';
import { COMMITTEE_MAX_SIZE } from '../libs/Committee.js';

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
  let myMemberArray1: MemberArray;
  let threshold1 = Field(1);
  let threshold2 = Field(2);
  let myMemberArray2: MemberArray;
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
      // CreateCommittee.analyzeMethods();
      Committee.analyzeMethods();
    }

    let tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 1);
      committeeContract.deploy();
    });
    await tx.sign([feePayerKey, keys.committee]).send();
  });

  // beforeEach(() => {});

  it('Create commitee consist of 2 people with threshhold 1, and test deploy DKG', async () => {
    let arrayAddress = [];
    arrayAddress.push(addresses.p1, addresses.p2);
    myMemberArray1 = new MemberArray(arrayAddress);

    let input = new CommitteeInput({
      addresses: myMemberArray1,
      threshold: threshold1,
    });

    let tx = await Mina.transaction(feePayer, () => {
      committeeContract.createCommittee(input);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
  });

  it('Create commitee consist of 3 people with threshhold 2', async () => {
    let arrayAddress = [];
    arrayAddress.push(addresses.p3, addresses.p4, addresses.p5);
    myMemberArray2 = new MemberArray(arrayAddress);

    let input = new CommitteeInput({
      addresses: myMemberArray2,
      threshold: threshold2,
    });

    let tx = await Mina.transaction(feePayer, () => {
      committeeContract.createCommittee(input);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
  });

  it('compile proof', async () => {
    // compile proof
    await CreateCommittee.compile();
  });

  it('create proof first step...', async () => {
    // create first step proof
    proof = await CreateCommittee.firstStep(
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
    proof = await CreateCommittee.nextStep(
      proof.publicInput,
      proof,
      myMemberArray1,
      memberMerkleMap.getWitness(Field(0)),
      settingMerkleMap.getWitness(Field(0)),
      threshold1
    );

    expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);

    ////// udpate data to local

    // memberMerkleTree.set
    tree1 = new MerkleTree(treeHeight);
    for (let i = 0; i < Number(myMemberArray1.length); i++) {
      tree1.setLeaf(BigInt(i), MemberArray.hash(myMemberArray1.get(Field(i))));
    }

    memberMerkleMap.set(Field(0), tree1.getRoot());
    settingMerkleMap.set(
      Field(0),
      Poseidon.hash([Field(1), myMemberArray1.length])
    );
  });

  it('create proof next step 2...', async () => {
    proof = await CreateCommittee.nextStep(
      proof.publicInput,
      proof,
      myMemberArray2,
      memberMerkleMap.getWitness(Field(1)),
      settingMerkleMap.getWitness(Field(1)),
      threshold2 // threshold
    );

    expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);
    ////// udpate data to local

    // memberMerkleTree.set
    tree2 = new MerkleTree(treeHeight);
    for (let i = 0; i < Number(myMemberArray2.length); i++) {
      tree2.setLeaf(BigInt(i), MemberArray.hash(myMemberArray2.get(Field(i))));
    }

    memberMerkleMap.set(Field(1), tree2.getRoot());
    settingMerkleMap.set(
      Field(1),
      Poseidon.hash([Field(2), myMemberArray2.length])
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
      address: addresses.p2,
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
      address: addresses.p2,
      commiteeId: Field(1),
      memberMerkleTreeWitness: new CommitteeMerkleWitness(tree1.getWitness(1n)),
      memberMerkleMapWitness: memberMerkleMap.getWitness(Field(1)),
    });
    expect(() => {
      committeeContract.checkMember(checkInput);
    }).toThrowError();
  });
});
