import {
  Field,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  MerkleMap,
  MerkleWitness,
  Proof,
  Bool,
  Account,
  fetchAccount,
  Void,
  State,
  Provable,
  Poseidon,
  Cache,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  RequestContract,
  RequestInput,
  UnRequestInput,
  ResolveInput,
  CreateRequest,
  RequestVector,
  RequestFee,
  RollupStateOutput,
  ActionEnum,
  createActionMask,
  RequestAction,
  RequestStatusEnum,
  RequestProof,
  MockResponeContract,
} from '../contracts/Request.js';

const doProofs = false;

describe('Testing Request Contract', () => {
  const EmptyMerkleMap = new MerkleMap();

  const statusMerkleMap = new MerkleMap();
  const requesterMerkleMap = new MerkleMap();

  let { keys, addresses } = randomAccounts(
    'request',
    'respone',
    'rqter1',
    'rqteD1',
    'R1',
    'D1'
  );
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let requestContract: RequestContract;
  let responeContract: MockResponeContract;
  let proof: RequestProof;
  let R1: RequestVector = RequestVector.from([
    addresses.R1.toGroup(),
    addresses.R1.toGroup(),
  ]);
  let commiteeId1 = Field(1);
  let keyId1 = Field(1);
  let D1: RequestVector = RequestVector.from([
    addresses.D1.toGroup(),
    addresses.D1.toGroup(),
  ]);

  let input1: RequestInput = new RequestInput({
    committeeId: commiteeId1,
    keyId: keyId1,
    R: R1,
  });

  let action1: RequestAction = new RequestAction({
    requestId: input1.requestId(),
    newRequester: addresses.rqter1,
    R: R1,
    D: RequestVector.empty(),
    actionType: createActionMask(Field(ActionEnum.REQUEST)),
  });

  let input2: ResolveInput = new ResolveInput({
    requestId: input1.requestId(),
    D: D1,
  });

  let action2: RequestAction = new RequestAction({
    requestId: input1.requestId(),
    newRequester: PublicKey.empty(),
    R: RequestVector.empty(),
    D: D1,
    actionType: createActionMask(Field(ActionEnum.RESOLVE)),
  });

  const requestStatusMap = new MerkleMap();
  const requesterMap = new MerkleMap();

  const ActionRequestProfiler = getProfiler('Testing request');

  beforeAll(async () => {
    const cache = Cache.FileSystem('./caches');
    ActionRequestProfiler.start('CreateRequest.compile');
    await CreateRequest.compile({ cache });
    ActionRequestProfiler.stop().store();

    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    requestContract = new RequestContract(addresses.request);
    responeContract = new MockResponeContract(addresses.respone);
    let tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 3);
      requestContract.deploy();
      responeContract.deploy();
      requestContract.responeContractAddress.set(addresses.respone);
      let feePayerAccount = AccountUpdate.createSigned(feePayer);
      feePayerAccount.send({ to: addresses.rqter1, amount: 10 * 10 ** 9 }); // 11 Mina
    });
    await tx.sign([feePayerKey, keys.request, keys.respone]).send();
    if (doProofs) {
      await RequestContract.compile();
      await MockResponeContract.compile();
    } else {
      console.log('AnalyzeMethods...');
      RequestContract.analyzeMethods();
      MockResponeContract.analyzeMethods();
      console.log('Done analyzeMethods');
    }
  });

  beforeEach(() => {});

  it('compile proof', async () => {
    // const cache = Cache.FileSystem('./caches');
    // ActionRequestProfiler.start('CreateRequest.compile');
    // await CreateRequest.compile({ cache });
    // ActionRequestProfiler.stop().store();
  });

  it('Requester1 requestInput1', async () => {
    let balanceBefore = Number(Account(addresses.rqter1).balance.get());
    let tx = await Mina.transaction(addresses.rqter1, () => {
      requestContract.request(input1);
    });
    await tx.prove();
    await tx.sign([keys.rqter1]).send();
    let balanceAfter = Number(Account(addresses.rqter1).balance.get());
    expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));
  });

  it('Create proof for requestInput1 and rollup', async () => {
    console.log('Create CreateRequest.firstStep requestInput1...');
    ActionRequestProfiler.start('CreateRequest.firstStep');
    proof = await CreateRequest.firstStep(
      requestContract.actionState.get(),
      requestStatusMap.getRoot(),
      requesterMap.getRoot()
    );
    ActionRequestProfiler.stop().store();
    expect(proof.publicOutput.initialActionState).toEqual(
      requestContract.actionState.get()
    );

    console.log('Create CreateRequest.nextStep requestInput1...');
    ActionRequestProfiler.start('CreateRequest.nextStep');
    proof = await CreateRequest.nextStep(
      proof,
      action1,
      requestStatusMap.getWitness(input1.requestId()),
      requesterMap.getWitness(input1.requestId()),
      addresses.rqter1
    );
    ActionRequestProfiler.stop().store();

    let tx = await Mina.transaction(feePayer, () => {
      requestContract.rollupRequest(proof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    ////// update local state:
    requesterMap.set(
      input1.requestId(),
      Poseidon.hash(PublicKey.toFields(addresses.rqter1))
    );
    // turn to request state
    requestStatusMap.set(
      input1.requestId(),
      Field(RequestStatusEnum.REQUESTING)
    );
  });

  it('Respone contract send requestInput2', async () => {
    console.log('Respone contract send requestInput2');
    let balanceBefore = Number(Account(addresses.respone).balance.get());
    let tx = await Mina.transaction(feePayer, () => {
      responeContract.resolve(addresses.request, input2);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    let balanceAfter = Number(Account(addresses.respone).balance.get());
    expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // resolved earn fee
  });

  it('Create proof for requestInput2 and rollup', async () => {
    console.log('Create proof for requestInput2 and rollup');
    proof = await CreateRequest.firstStep(
      requestContract.actionState.get(),
      requestStatusMap.getRoot(),
      requesterMap.getRoot()
    );

    Provable.log(
      'proof.publicOutput.finalActionState: ',
      proof.publicOutput.finalActionState
    );

    console.log('Create CreateRequest.nextStep requestInput2...');
    proof = await CreateRequest.nextStep(
      proof,
      action2,
      requestStatusMap.getWitness(input2.requestId),
      requesterMap.getWitness(input2.requestId),
      addresses.rqter1
    );

    ////// update local state:
    // requesterMap doesnt change
    // update request status state
    requestStatusMap.set(input2.requestId, action2.hashD());

    let balanceBefore = Number(Account(addresses.respone).balance.get());
    // rollUp
    console.log('Rollup requestInput2...');
    let tx = await Mina.transaction(feePayer, () => {
      requestContract.rollupRequest(proof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    let balanceAfter = Number(Account(addresses.respone).balance.get());
    expect(balanceAfter - balanceBefore).toEqual(Number(0));
  });
});
