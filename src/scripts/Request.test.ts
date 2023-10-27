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
  Group,
  Bool,
  Account,
  Provable,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  Request,
  RequestInput,
  createRequestProof,
  GroupArray,
  RollupState,
} from '../contracts/Request.js';
import { Committee } from '../contracts/Committee.js';

const doProofs = false;

describe('Testing Request Contract', () => {
  const EmptyMerkleMap = new MerkleMap();
  const treeHeight = 6; // setting max 32 member
  const memberMerkleMap = new MerkleMap();
  const dkgAddressMerkleMap = new MerkleMap();
  const settingMerkleMap = new MerkleMap();
  class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {}

  let { keys, addresses } = randomAccounts(
    'request',
    'rqter1',
    'rqter2',
    'R1',
    'R2'
  );
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let requestContract: Request;
  let proof: Proof<RollupState, RollupState>;
  let R1: GroupArray = GroupArray.from([
    addresses.R1.toGroup(),
    addresses.R1.toGroup(),
  ]);
  let commiteeId1 = Field(1);
  let keyId1 = Field(1);
  let commiteeId2 = Field(2);
  let keyId2 = Field(2);
  let R2: GroupArray = GroupArray.from([
    addresses.R2.toGroup(),
    addresses.R2.toGroup(),
  ]);

  let requestInput1: RequestInput = new RequestInput({
    committeeId: commiteeId1,
    keyId: keyId1,
    requester: addresses.rqter1.toGroup(),
    R: R1,
    isRequest: Bool(true),
  });

  let requestInput2: RequestInput = new RequestInput({
    committeeId: commiteeId2,
    keyId: keyId2,
    requester: addresses.rqter2.toGroup(),
    R: R2,
    isRequest: Bool(true),
  });

  let requestInput3: RequestInput = new RequestInput({
    committeeId: commiteeId1,
    keyId: keyId1,
    requester: addresses.rqter1.toGroup(),
    R: R1,
    isRequest: Bool(false),
  });

  let requestInput4: RequestInput = new RequestInput({
    committeeId: commiteeId1,
    keyId: keyId2,
    requester: addresses.rqter2.toGroup(),
    R: R2,
    isRequest: Bool(false),
  });

  const requestStateMap = new MerkleMap();
  const requesterMap = new MerkleMap();

  const ActionRequestProfiler = getProfiler('Testing request');

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    requestContract = new Request(addresses.request);
    if (doProofs) {
      await Request.compile();
    } else {
      console.log('createRequestProof.analyzeMethods');
      // createRequestProof.analyzeMethods();
      console.log('Request.analyzeMethods');
      Request.analyzeMethods();
      console.log('Done analyzeMethods');
    }

    let tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 1);
      requestContract.deploy();
    });
    await tx.sign([feePayerKey, keys.request]).send();
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    // compile proof
    if (doProofs) await createRequestProof.compile();
  });

  it('Requester 2 requestInput2', async () => {
    Provable.log(
      'Balance before requestInput2: ',
      Account(addresses.rqter2).balance
    );
    let tx = await Mina.transaction(addresses.rqter2, () => {
      requestContract.request(requestInput2);
    });
    await tx.prove();
    await tx.sign([keys.rqter2]).send();
    Provable.log(
      'Balance after requestInput2: ',
      Account(addresses.rqter2).balance
    );
  });

  it('Create proof for request2 and rollup', async () => {
    console.log('Create createRequestProof.firstStep...');
    proof = await createRequestProof.firstStep(
      new RollupState({
        actionHash: Reducer.initialActionState,
        requestStateRoot: requestStateMap.getRoot(),
        requesterRoot: requesterMap.getRoot(),
      })
    );
    expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);

    console.log('Create createRequestProof.nextStep requestInput2...');
    proof = await createRequestProof.nextStep(
      proof.publicInput,
      proof,
      requestInput2,
      requestStateMap.getWitness(requestInput2.requestId()),
      requesterMap.getWitness(requestInput2.requestId())
    );

    let tx = await Mina.transaction(feePayer, () => {
      requestContract.rollupRequest(proof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    ////// update local state:
    requesterMap.set(
      requestInput2.requestId(),
      GroupArray.hash(addresses.rqter2.toGroup())
    );
    // turn to request state
    requesterMap.set(requestInput2.requestId(), Field(1));
  });

  it('Requester 1 requestInput1 and requestInput3', async () => {
    Provable.log(
      'Balance before requestInput1: ',
      Account(addresses.rqter1).balance
    );
    let tx = await Mina.transaction(addresses.rqter1, () => {
      requestContract.request(requestInput1);
    });
    await tx.prove();
    await tx.sign([keys.rqter1]).send();
    Provable.log(
      'Balance after requestInput1: ',
      Account(addresses.rqter1).balance
    );

    Provable.log(
      'Balance before requestInput3: ',
      Account(addresses.rqter1).balance
    );
    tx = await Mina.transaction(addresses.rqter1, () => {
      requestContract.request(requestInput3);
    });
    await tx.prove();
    await tx.sign([keys.rqter1]).send();
    Provable.log(
      'Balance after requestInput3: ',
      Account(addresses.rqter1).balance
    );
  });

  it('Create proof for request1 and request3 and rollup', async () => {
    console.log('Create createRequestProof.firstStep...');
    proof = await createRequestProof.firstStep(
      new RollupState({
        actionHash: requestContract.actionState.get(),
        requestStateRoot: requestStateMap.getRoot(),
        requesterRoot: requesterMap.getRoot(),
      })
    );

    console.log('Create createRequestProof.nextStep requestInput1...');
    proof = await createRequestProof.nextStep(
      proof.publicInput,
      proof,
      requestInput1,
      requestStateMap.getWitness(requestInput2.requestId()),
      requesterMap.getWitness(requestInput2.requestId())
    );

    ////// update local state:
    requesterMap.set(
      requestInput1.requestId(),
      GroupArray.hash(addresses.rqter1.toGroup())
    );
    // turn to request state
    requesterMap.set(requestInput1.requestId(), Field(1));

    console.log('Create createRequestProof.nextStep requestInput3...');
    proof = await createRequestProof.nextStep(
      proof.publicInput,
      proof,
      requestInput3,
      requestStateMap.getWitness(requestInput3.requestId()),
      requesterMap.getWitness(requestInput3.requestId())
    );

    ////// update local state:
    requesterMap.set(
      requestInput3.requestId(),
      GroupArray.hash(addresses.rqter1.toGroup())
    );
    // turn to request state
    requesterMap.set(requestInput3.requestId(), Field(0));

    Provable.log(
      'Balance before requestInput3: ',
      Account(addresses.rqter1).balance
    );
    // rollUp
    let tx = await Mina.transaction(feePayer, () => {
      requestContract.rollupRequest(proof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    Provable.log(
      'Balance before requestInput3: ',
      Account(addresses.rqter1).balance
    );
  });

  // it('check if p2 belong to request 1: to throw error', async () => {
  //   // check if memerber belong to committeeId
  //   expect(() => {
  //     requestContract.checkMember(
  //       addresses.p2.toGroup(),
  //       Field(1),
  //       new MyMerkleWitness(tree1.getWitness(1n)),
  //       memberMerkleMap.getWitness(Field(1))
  //     );
  //   }).toThrowError();
  // });
});
