// import {
//   Field,
//   Reducer,
//   Mina,
//   PrivateKey,
//   PublicKey,
//   AccountUpdate,
//   MerkleMap,
//   MerkleWitness,
//   Proof,
//   Bool,
//   Account,
//   fetchAccount,
//   Void,
//   State,
//   Provable,
//   Poseidon,
// } from 'o1js';

// import { getProfiler } from './helper/profiler.js';
// import randomAccounts from './helper/randomAccounts.js';
// import {
//   RequestContract,
//   RequestInput,
//   CreateRequest,
//   RequestVector,
//   RequestFee,
//   RollupStateOutput,
//   ActionEnum,
//   createActionMask,
//   RequestAction,
//   RequestStatusEnum,
//   RequestProof,
// } from '../contracts/Request.js';

// const doProofs = false;

// describe('Testing Request Contract', () => {
//   const EmptyMerkleMap = new MerkleMap();
//   const treeHeight = 6; // setting max 32 member
//   const memberMerkleMap = new MerkleMap();
//   const dkgAddressMerkleMap = new MerkleMap();
//   const settingMerkleMap = new MerkleMap();
//   class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {}

//   let { keys, addresses } = randomAccounts(
//     'request',
//     'dkg',
//     'rqter1',
//     'rqter2',
//     'R1',
//     'R2'
//   );
//   let feePayerKey: PrivateKey;
//   let feePayer: PublicKey;
//   let requestContract: RequestContract;
//   let proof: RequestProof;
//   let R1: RequestVector = RequestVector.from([
//     addresses.R1.toGroup(),
//     addresses.R1.toGroup(),
//   ]);
//   let commiteeId1 = Field(1);
//   let keyId1 = Field(1);
//   let commiteeId2 = Field(2);
//   let keyId2 = Field(2);
//   let commiteeId3 = Field(3);
//   let keyId3 = Field(3);
//   let R2: RequestVector = RequestVector.from([
//     addresses.R2.toGroup(),
//     addresses.R2.toGroup(),
//   ]);

//   let requestInput1: RequestInput = new RequestInput({
//     committeeId: commiteeId1,
//     keyId: keyId1,
//     requester: addresses.rqter1,
//     R: R1,
//     actionType: Field(ActionEnum.REQUEST),
//   });

//   let requestAction1: RequestAction = new RequestAction({
//     committeeId: commiteeId1,
//     keyId: keyId1,
//     requester: addresses.rqter1,
//     R: R1,
//     actionType: createActionMask(Field(ActionEnum.REQUEST)),
//   });

//   let requestInput2: RequestInput = new RequestInput({
//     committeeId: commiteeId1,
//     keyId: keyId1,
//     requester: addresses.rqter1,
//     R: R1,
//     actionType: Field(ActionEnum.RESOLVE),
//   });

//   let requestAction2: RequestAction = new RequestAction({
//     committeeId: commiteeId1,
//     keyId: keyId1,
//     requester: addresses.rqter1,
//     R: R1,
//     actionType: createActionMask(Field(ActionEnum.RESOLVE)),
//   });

//   let requestInput3: RequestInput = new RequestInput({
//     committeeId: commiteeId2,
//     keyId: keyId2,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: Field(ActionEnum.REQUEST),
//   });

//   let requestAction3: RequestAction = new RequestAction({
//     committeeId: commiteeId2,
//     keyId: keyId2,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: createActionMask(Field(ActionEnum.REQUEST)),
//   });

//   let requestInput4: RequestInput = new RequestInput({
//     committeeId: commiteeId2,
//     keyId: keyId2,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: Field(ActionEnum.UNREQUEST),
//   });

//   let requestAction4: RequestAction = new RequestAction({
//     committeeId: commiteeId2,
//     keyId: keyId2,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: createActionMask(Field(ActionEnum.UNREQUEST)),
//   });

//   let requestInput5: RequestInput = new RequestInput({
//     committeeId: commiteeId3,
//     keyId: keyId3,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: Field(ActionEnum.REQUEST),
//   });

//   let requestAction5: RequestAction = new RequestAction({
//     committeeId: commiteeId3,
//     keyId: keyId3,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: createActionMask(Field(ActionEnum.REQUEST)),
//   });

//   let requestInput6: RequestInput = new RequestInput({
//     committeeId: commiteeId3,
//     keyId: keyId3,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: Field(ActionEnum.UNREQUEST),
//   });

//   let requestAction6: RequestAction = new RequestAction({
//     committeeId: commiteeId3,
//     keyId: keyId3,
//     requester: addresses.rqter2,
//     R: R2,
//     actionType: createActionMask(Field(ActionEnum.UNREQUEST)),
//   });

//   const requestStatusMap = new MerkleMap();
//   const requesterMap = new MerkleMap();

//   const ActionRequestProfiler = getProfiler('Testing request');

//   beforeAll(async () => {
//     let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
//     Mina.setActiveInstance(Local);
//     feePayerKey = Local.testAccounts[0].privateKey;
//     feePayer = Local.testAccounts[0].publicKey;
//     requestContract = new RequestContract(addresses.request);
//     let tx = await Mina.transaction(feePayer, () => {
//       AccountUpdate.fundNewAccount(feePayer, 4);
//       requestContract.deploy();
//       requestContract.DKG_address.set(addresses.dkg);
//       let feePayerAccount = AccountUpdate.createSigned(feePayer);
//       feePayerAccount.send({ to: addresses.rqter1, amount: 10 * 10 ** 9 }); // 11 Mina
//       feePayerAccount.send({ to: addresses.rqter2, amount: 10 * 10 ** 9 }); // 11 Mina
//       feePayerAccount.send({ to: addresses.dkg, amount: 10 * 10 ** 9 }); // 11 Mina
//     });
//     await tx.sign([feePayerKey, keys.request]).send();
//     if (doProofs) {
//       await RequestContract.compile();
//     } else {
//       console.log('AnalyzeMethods...');
//       RequestContract.analyzeMethods();
//       console.log('Done analyzeMethods');
//     }
//   });

// beforeEach(() => {});

it('compile proof', async () => {
  // compile proof
  // const cache = Cache.FileSystem('./cache');
  // ActionRequestProfiler.start('CreateRequest.compile');
  // await CreateRequest.compile({ cache });
  // ActionRequestProfiler.stop().store();
});

// it('Requester1 requestInput1', async () => {
//   let balanceBefore = Number(Account(addresses.rqter1).balance.get());
//   let tx = await Mina.transaction(addresses.rqter1, () => {
//     requestContract.requestOrUnrequest(requestInput1);
//   });
//   await tx.prove();
//   await tx.sign([keys.rqter1]).send();
//   let balanceAfter = Number(Account(addresses.rqter1).balance.get());
//   expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));
// });

// it('Create proof for requestInput1 and rollup', async () => {
//   console.log('Create CreateRequest.firstStep requestInput1...');
//   ActionRequestProfiler.start('CreateRequest.firstStep');
//   proof = await CreateRequest.firstStep(
//     requestContract.actionState.get(),
//     requestStatusMap.getRoot(),
//     requesterMap.getRoot()
//   );
//   ActionRequestProfiler.stop().store();
//   expect(proof.publicOutput.initialActionState).toEqual(
//     requestContract.actionState.get()
//   );

//   console.log('Create CreateRequest.nextStep requestInput1...');
//   ActionRequestProfiler.start('CreateRequest.nextStep');
//   proof = await CreateRequest.nextStep(
//     proof,
//     requestAction1,
//     requestStatusMap.getWitness(requestAction1.requestId()),
//     requesterMap.getWitness(requestAction1.requestId())
//   );
//   ActionRequestProfiler.stop().store();

//   let tx = await Mina.transaction(feePayer, () => {
//     requestContract.rollupRequest(proof);
//   });
//   await tx.prove();
//   await tx.sign([feePayerKey]).send();

//   ////// update local state:
//   requesterMap.set(
//     requestAction1.requestId(),
//     Poseidon.hash(PublicKey.toFields(addresses.rqter1))
//   );
//   // turn to request state
//   requestStatusMap.set(
//     requestAction1.requestId(),
//     Field(RequestStatusEnum.REQUESTING)
//   );
// });

// it('DGK send requestInput2', async () => {
//   console.log('DGK send requestInput2');
//   let balanceBefore = Number(Account(addresses.dkg).balance.get());
//   let tx = await Mina.transaction(addresses.dkg, () => {
//     requestContract.resolveRequest(requestInput2);
//   });
//   await tx.prove();
//   await tx.sign([keys.dkg]).send();
//   let balanceAfter = Number(Account(addresses.dkg).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // resolved earn fee
// });

// it('Create proof for requestInput2 and rollup', async () => {
//   console.log('Create proof for requestInput2 and rollup');
//   proof = await CreateRequest.firstStep(
//     requestContract.actionState.get(),
//     requestStatusMap.getRoot(),
//     requesterMap.getRoot()
//   );

//   Provable.log(
//     'proof.publicOutput.finalActionState: ',
//     proof.publicOutput.finalActionState
//   );

//   console.log('Create CreateRequest.nextStep requestInput2...');
//   proof = await CreateRequest.nextStep(
//     proof,
//     requestAction2,
//     requestStatusMap.getWitness(requestAction2.requestId()),
//     requesterMap.getWitness(requestAction2.requestId())
//   );

//   ////// update local state:
//   // requesterMap doesnt change
//   // update request status state
//   requestStatusMap.set(
//     requestAction2.requestId(),
//     Field(RequestStatusEnum.RESOLVED)
//   );

//   let balanceBefore = Number(Account(addresses.dkg).balance.get());
//   // rollUp
//   console.log('Rollup requestInput2...');
//   let tx = await Mina.transaction(feePayer, () => {
//     requestContract.rollupRequest(proof);
//   });
//   await tx.prove();
//   await tx.sign([feePayerKey]).send();
//   let balanceAfter = Number(Account(addresses.dkg).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(0));
// });

// it('Requester2 requestInput3', async () => {
//   let balanceBefore = Number(Account(addresses.rqter2).balance.get());
//   let tx = await Mina.transaction(addresses.rqter2, () => {
//     requestContract.requestOrUnrequest(requestInput3);
//   });
//   await tx.prove();
//   await tx.sign([keys.rqter2]).send();
//   let balanceAfter = Number(Account(addresses.rqter2).balance.get());
//   expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));
// });

// it('Create proof for requestInput3 and rollup', async () => {
//   console.log('Create proof for requestInput3 and rollup');
//   proof = await CreateRequest.firstStep(
//     requestContract.actionState.get(),
//     requestStatusMap.getRoot(),
//     requesterMap.getRoot()
//   );

//   Provable.log(
//     'proof.publicOutput.finalActionState: ',
//     proof.publicOutput.finalActionState
//   );

//   console.log('Create CreateRequest.nextStep requestInput3...');
//   proof = await CreateRequest.nextStep(
//     proof,
//     requestAction3,
//     requestStatusMap.getWitness(requestAction3.requestId()),
//     requesterMap.getWitness(requestAction3.requestId())
//   );

//   ////// update local state:
//   // update requester map
//   requesterMap.set(
//     requestAction3.requestId(),
//     Poseidon.hash(PublicKey.toFields(requestAction3.requester))
//   );
//   // update request status state
//   requestStatusMap.set(
//     requestAction3.requestId(),
//     Field(RequestStatusEnum.REQUESTING)
//   );

//   let balanceBefore = Number(Account(addresses.dkg).balance.get());
//   // rollUp
//   console.log('Rollup requestInput3...');
//   let tx = await Mina.transaction(feePayer, () => {
//     requestContract.rollupRequest(proof);
//   });
//   await tx.prove();
//   await tx.sign([feePayerKey]).send();
//   let balanceAfter = Number(Account(addresses.dkg).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(0));
// });

// it('Requester2 requestInput4', async () => {
//   let balanceBefore = Number(Account(addresses.rqter2).balance.get());
//   let tx = await Mina.transaction(addresses.rqter2, () => {
//     requestContract.requestOrUnrequest(requestInput4);
//   });
//   await tx.prove();
//   await tx.sign([keys.rqter2]).send();
//   let balanceAfter = Number(Account(addresses.rqter2).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // Refund
// });

// it('Create proof for requestInput4 and rollup', async () => {
//   console.log('Create proof for requestInput4 and rollup');
//   proof = await CreateRequest.firstStep(
//     requestContract.actionState.get(),
//     requestStatusMap.getRoot(),
//     requesterMap.getRoot()
//   );

//   Provable.log(
//     'proof.publicOutput.finalActionState: ',
//     proof.publicOutput.finalActionState
//   );

//   console.log('Create CreateRequest.nextStep requestInput4...');
//   proof = await CreateRequest.nextStep(
//     proof,
//     requestAction4,
//     requestStatusMap.getWitness(requestAction4.requestId()),
//     requesterMap.getWitness(requestAction4.requestId())
//   );

//   ////// update local state:
//   // update requester map
//   requesterMap.set(requestAction4.requestId(), Field(0));
//   // update request status state
//   requestStatusMap.set(
//     requestAction4.requestId(),
//     Field(RequestStatusEnum.NOT_YET_REQUESTED)
//   );

//   let balanceBefore = Number(Account(addresses.dkg).balance.get());
//   // rollUp
//   console.log('Rollup requestInput4...');
//   let tx = await Mina.transaction(feePayer, () => {
//     requestContract.rollupRequest(proof);
//   });
//   await tx.prove();
//   await tx.sign([feePayerKey]).send();
//   let balanceAfter = Number(Account(addresses.dkg).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(0));
// });

// it('Requester2 requestInput5', async () => {
//   let balanceBefore = Number(Account(addresses.rqter2).balance.get());
//   let tx = await Mina.transaction(addresses.rqter2, () => {
//     requestContract.requestOrUnrequest(requestInput5);
//   });
//   await tx.prove();
//   await tx.sign([keys.rqter2]).send();
//   let balanceAfter = Number(Account(addresses.rqter2).balance.get());
//   expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));
// });

// it('Create proof for requestInput5 and rollup', async () => {
//   console.log('Create proof for requestInput5 and rollup');
//   proof = await CreateRequest.firstStep(
//     requestContract.actionState.get(),
//     requestStatusMap.getRoot(),
//     requesterMap.getRoot()
//   );

//   Provable.log(
//     'proof.publicOutput.finalActionState: ',
//     proof.publicOutput.finalActionState
//   );

//   console.log('Create CreateRequest.nextStep requestInput5...');
//   proof = await CreateRequest.nextStep(
//     proof,
//     requestAction5,
//     requestStatusMap.getWitness(requestAction5.requestId()),
//     requesterMap.getWitness(requestAction5.requestId())
//   );

//   ////// update local state:
//   // update requester map
//   requesterMap.set(
//     requestAction5.requestId(),
//     Poseidon.hash(PublicKey.toFields(requestAction5.requester))
//   );
//   // update request status state
//   requestStatusMap.set(
//     requestAction5.requestId(),
//     Field(RequestStatusEnum.REQUESTING)
//   );

//   let balanceBefore = Number(Account(addresses.dkg).balance.get());
//   // rollUp
//   fetchAccount({ publicKey: addresses.request });
//   fetchAccount({ publicKey: feePayer });
//   console.log('Rollup requestInput5...');
//   let tx = await Mina.transaction(feePayer, () => {
//     requestContract.rollupRequest(proof);
//   });
//   await tx.prove();
//   await tx.sign([feePayerKey]).send();
//   let balanceAfter = Number(Account(addresses.dkg).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(0));
// });

// it('Requester2 requestInput6', async () => {
//   let balanceBefore = Number(Account(addresses.rqter2).balance.get());
//   let tx = await Mina.transaction(addresses.rqter2, () => {
//     requestContract.requestOrUnrequest(requestInput6);
//   });
//   await tx.prove();
//   await tx.sign([keys.rqter2]).send();
//   let balanceAfter = Number(Account(addresses.rqter2).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // Refund
// });

// it('Create proof for requestInput6 and rollup', async () => {
//   console.log('Create proof for requestInput6 and rollup');
//   proof = await CreateRequest.firstStep(
//     requestContract.actionState.get(),
//     requestStatusMap.getRoot(),
//     requesterMap.getRoot()
//   );

//   Provable.log(
//     'proof.publicOutput.finalActionState: ',
//     proof.publicOutput.finalActionState
//   );

//   console.log('Create CreateRequest.nextStep requestInput6...');
//   proof = await CreateRequest.nextStep(
//     proof,
//     requestAction6,
//     requestStatusMap.getWitness(requestAction6.requestId()),
//     requesterMap.getWitness(requestAction6.requestId())
//   );

//   ////// update local state:
//   // update requester map
//   requesterMap.set(requestAction6.requestId(), Field(0));
//   // update request status state
//   requestStatusMap.set(
//     requestAction6.requestId(),
//     Field(RequestStatusEnum.NOT_YET_REQUESTED)
//   );

//   let balanceBefore = Number(Account(addresses.dkg).balance.get());
//   // rollUp
//   console.log('Rollup requestInput6...');
//   let tx = await Mina.transaction(feePayer, () => {
//     requestContract.rollupRequest(proof);
//   });
//   await tx.prove();
//   await tx.sign([feePayerKey]).send();
//   let balanceAfter = Number(Account(addresses.dkg).balance.get());
//   expect(balanceAfter - balanceBefore).toEqual(Number(0));
// });
// });
