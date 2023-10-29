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
  fetchAccount,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  Request,
  RequestInput,
  createRequestProof,
  GroupArray,
  RequestRollupState,
  RequestFee,
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
  let proof: Proof<RequestRollupState, RequestRollupState>;
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

    let tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 3);
      requestContract.deploy();
      let feePayerAccount = AccountUpdate.createSigned(feePayer);
      feePayerAccount.send({ to: addresses.rqter1, amount: 10 * 10 ** 9 }); // 11 Mina
      feePayerAccount.send({ to: addresses.rqter2, amount: 10 * 10 ** 9 }); // 11 Mina
    });
    await tx.sign([feePayerKey, keys.request]).send();

    if (doProofs) {
      await Request.compile();
    } else {
      Request.analyzeMethods();
      console.log('Done analyzeMethods');
    }
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    // compile proof
    ActionRequestProfiler.start('createRequestProof.compile');
    await createRequestProof.compile();
    ActionRequestProfiler.stop().store();
  });

  it('Requester 2 requestInput2', async () => {
    let balanceBefore = Number(Account(addresses.rqter2).balance.get());
    let tx = await Mina.transaction(addresses.rqter2, () => {
      requestContract.request(requestInput2);
    });
    await tx.prove();
    await tx.sign([keys.rqter2]).send();
    let balanceAfter = Number(Account(addresses.rqter2).balance.get());
    expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));
  });

  it('Create proof for request2 and rollup', async () => {
    console.log('Create createRequestProof.firstStep...');
    ActionRequestProfiler.start('createRequestProof.firstStep');
    proof = await createRequestProof.firstStep(
      new RequestRollupState({
        actionHash: Reducer.initialActionState,
        requestStateRoot: requestStateMap.getRoot(),
        requesterRoot: requesterMap.getRoot(),
      })
    );
    ActionRequestProfiler.stop().store();
    expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);

    console.log('Create createRequestProof.nextStep requestInput2...');
    ActionRequestProfiler.start('createRequestProof.nextStep');
    proof = await createRequestProof.nextStep(
      proof.publicInput,
      proof,
      requestInput2,
      requestStateMap.getWitness(requestInput2.requestId()),
      requesterMap.getWitness(requestInput2.requestId())
    );
    ActionRequestProfiler.stop().store();

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
    requestStateMap.set(requestInput2.requestId(), Field(1));
  });

  it('Requester 1 requestInput1 and requestInput3', async () => {
    let balanceBefore = Number(Account(addresses.rqter1).balance.get());
    let tx = await Mina.transaction(addresses.rqter1, () => {
      requestContract.request(requestInput1);
    });
    await tx.prove();
    await tx.sign([keys.rqter1]).send();
    let balanceAfter = Number(Account(addresses.rqter1).balance.get());
    expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));

    balanceBefore = Number(Account(addresses.rqter1).balance.get());
    tx = await Mina.transaction(addresses.rqter1, () => {
      requestContract.request(requestInput3);
    });
    await tx.prove();
    await tx.sign([keys.rqter1]).send();
    balanceAfter = Number(Account(addresses.rqter1).balance.get());
    expect(balanceBefore - balanceAfter).toEqual(Number(0));
  });

  it('Create proof for request1 and request3 and rollup', async () => {
    console.log('Create createRequestProof.firstStep...');
    proof = await createRequestProof.firstStep(
      new RequestRollupState({
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
      requestStateMap.getWitness(requestInput1.requestId()),
      requesterMap.getWitness(requestInput1.requestId())
    );

    ////// update local state:
    requesterMap.set(
      requestInput1.requestId(),
      GroupArray.hash(addresses.rqter1.toGroup())
    );
    // turn to request state
    requestStateMap.set(requestInput1.requestId(), Field(1));

    console.log('Create createRequestProof.nextStep requestInput3...');
    proof = await createRequestProof.nextStep(
      proof.publicInput,
      proof,
      requestInput3,
      requestStateMap.getWitness(requestInput3.requestId()),
      requesterMap.getWitness(requestInput3.requestId())
    );

    ////// update local state:
    requesterMap.set(requestInput3.requestId(), Field(0));
    // turn to request state back to 0
    requestStateMap.set(requestInput3.requestId(), Field(0));

    let balanceBefore = Number(Account(addresses.rqter1).balance.get());
    // rollUp
    let tx = await Mina.transaction(feePayer, () => {
      requestContract.rollupRequest(proof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    let balanceAfter = Number(Account(addresses.rqter1).balance.get());
    expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // refunded
  });

  it('check if requestId1 is empty and requestId2 is requester 2', async () => {
    await fetchAccount({ publicKey: addresses.request });
    expect(requestContract.requestStateRoot.get().toString()).toEqual(
      requestStateMap.getRoot().toString()
    );
    expect(requestContract.requesterRoot.get().toString()).toEqual(
      requesterMap.getRoot().toString()
    );
  });
});
