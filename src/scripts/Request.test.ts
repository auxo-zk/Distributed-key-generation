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
//   let proof: Proof<Void, RollupStateOutput>;
//   let R1: RequestVector = RequestVector.from([
//     addresses.R1.toGroup(),
//     addresses.R1.toGroup(),
//   ]);
//   let commiteeId1 = Field(1);
//   let keyId1 = Field(1);
//   let commiteeId2 = Field(2);
//   let keyId2 = Field(2);
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

//   // beforeEach(() => {});

//   it('compile proof', async () => {
//     // compile proof
//     ActionRequestProfiler.start('CreateRequest.compile');
//     await CreateRequest.compile();
//     ActionRequestProfiler.stop().store();
//   });

//   it('Requester1 requestInput1', async () => {
//     let balanceBefore = Number(Account(addresses.rqter1).balance.get());
//     let tx = await Mina.transaction(addresses.rqter1, () => {
//       requestContract.request(requestInput1);
//     });
//     await tx.prove();
//     await tx.sign([keys.rqter1]).send();
//     let balanceAfter = Number(Account(addresses.rqter1).balance.get());
//     expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));
//   });

//   it('Create proof for requestInput1 and rollup', async () => {
//     console.log('Create CreateRequest.firstStep requestInput1...');
//     ActionRequestProfiler.start('CreateRequest.firstStep');
//     proof = await CreateRequest.firstStep(
//       Reducer.initialActionState,
//       requestStatusMap.getRoot(),
//       requesterMap.getRoot()
//     );
//     ActionRequestProfiler.stop().store();
//     expect(proof.publicOutput.initialActionState).toEqual(
//       Reducer.initialActionState
//     );

//     console.log('Create CreateRequest.nextStep requestInput1...');
//     ActionRequestProfiler.start('CreateRequest.nextStep');
//     proof = await CreateRequest.nextStep(
//       proof,
//       requestAction1,
//       requestStatusMap.getWitness(requestAction1.requestId()),
//       requesterMap.getWitness(requestAction1.requestId())
//     );
//     ActionRequestProfiler.stop().store();

//     let tx = await Mina.transaction(feePayer, () => {
//       requestContract.rollupRequest(proof);
//     });
//     await tx.prove();
//     await tx.sign([feePayerKey]).send();

//     ////// update local state:
//     requesterMap.set(
//       requestAction1.requestId(),
//       RequestVector.hash(addresses.rqter1.toGroup())
//     );
//     // turn to request state
//     requestStatusMap.set(
//       requestAction1.requestId(),
//       Field(RequestStatusEnum.REQUESTING)
//     );
//   });

//   it('Requester1 send requestInput2: Should revert', async () => {
//     console.log('Requester1 send requestInput2: Should revert');
//     let tx = await Mina.transaction(addresses.rqter1, () => {
//       requestContract.request(requestInput2);
//     });
//     await tx.prove();
//     await tx.sign([keys.rqter1]).send();
//     // expect(() => {
//     //   tx.sign([keys.rqter1]).send();
//     // }).toThrowError();
//   });

//   it('DGK send requestInput2', async () => {
//     console.log('DGK send requestInput2');
//     let balanceBefore = Number(Account(addresses.dkg).balance.get());
//     let tx = await Mina.transaction(addresses.dkg, () => {
//       requestContract.request(requestInput2);
//     });
//     await tx.prove();
//     await tx.sign([keys.dkg]).send();
//     let balanceAfter = Number(Account(addresses.dkg).balance.get());
//     expect(balanceAfter - balanceBefore).toEqual(Number(0));
//   });

//   it('Create proof for requestInput2 and rollup', async () => {
//     console.log('Create proof for requestInput2 and rollup');
//     proof = await CreateRequest.firstStep(
//       requestContract.actionState.get(),
//       requestStatusMap.getRoot(),
//       requesterMap.getRoot()
//     );

//     console.log('Create CreateRequest.nextStep requestInput1...');
//     proof = await CreateRequest.nextStep(
//       proof,
//       requestAction2,
//       requestStatusMap.getWitness(requestAction2.requestId()),
//       requesterMap.getWitness(requestAction2.requestId())
//     );

//     ////// update local state:
//     // requesterMap doesnt change
//     // update request status state
//     requestStatusMap.set(
//       requestAction2.requestId(),
//       Field(RequestStatusEnum.RESOLVED)
//     );

//     let balanceBefore = Number(Account(addresses.dkg).balance.get());
//     // rollUp
//     let tx = await Mina.transaction(feePayer, () => {
//       requestContract.rollupRequest(proof);
//     });
//     await tx.prove();
//     await tx.sign([feePayerKey]).send();
//     let balanceAfter = Number(Account(addresses.dkg).balance.get());
//     expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // resolved earn fee
//   });

//   it('Requester2 requestInput3 and requestInput4', async () => {
//     let balanceBefore = Number(Account(addresses.rqter2).balance.get());
//     let tx = await Mina.transaction(addresses.rqter2, () => {
//       requestContract.request(requestInput3);
//     });
//     await tx.prove();
//     await tx.sign([keys.rqter2]).send();
//     let balanceAfter = Number(Account(addresses.rqter2).balance.get());
//     expect(balanceBefore - balanceAfter).toEqual(Number(RequestFee));

//     balanceBefore = Number(Account(addresses.rqter2).balance.get());
//     tx = await Mina.transaction(addresses.rqter2, () => {
//       requestContract.request(requestInput4);
//     });
//     await tx.prove();
//     await tx.sign([keys.rqter2]).send();
//     balanceAfter = Number(Account(addresses.rqter2).balance.get());
//     expect(balanceBefore - balanceAfter).toEqual(Number(0));
//   });

//   it('Create proof for requestInput3 and requestInput4 and rollup', async () => {
//     console.log('Create CreateRequest.firstStep...');
//     ActionRequestProfiler.start('CreateRequest.firstStep');
//     proof = await CreateRequest.firstStep(
//       requestContract.actionState.get(),
//       requestStatusMap.getRoot(),
//       requesterMap.getRoot()
//     );
//     ActionRequestProfiler.stop().store();

//     console.log('Create CreateRequest.nextStep requestInput3...');
//     ActionRequestProfiler.start('CreateRequest.nextStep');
//     proof = await CreateRequest.nextStep(
//       proof,
//       requestAction3,
//       requestStatusMap.getWitness(requestAction3.requestId()),
//       requesterMap.getWitness(requestAction3.requestId())
//     );
//     ActionRequestProfiler.stop().store();

//     ////// update local state:
//     requesterMap.set(
//       requestAction3.requestId(),
//       RequestVector.hash(addresses.rqter2.toGroup())
//     );
//     // turn to request state
//     requestStatusMap.set(
//       requestAction3.requestId(),
//       Field(RequestStatusEnum.REQUESTING)
//     );

//     console.log('Create CreateRequest.nextStep requestInput4...');
//     ActionRequestProfiler.start('CreateRequest.nextStep');
//     proof = await CreateRequest.nextStep(
//       proof,
//       requestAction4,
//       requestStatusMap.getWitness(requestAction4.requestId()),
//       requesterMap.getWitness(requestAction4.requestId())
//     );
//     ActionRequestProfiler.stop().store();

//     ////// update local state:
//     requesterMap.set(requestAction4.requestId(), Field(0));
//     // turn to request state
//     requestStatusMap.set(
//       requestAction4.requestId(),
//       Field(RequestStatusEnum.NOT_YET_REQUESTED)
//     );

//     let balanceBefore = Number(Account(addresses.rqter2).balance.get());
//     let tx = await Mina.transaction(feePayer, () => {
//       requestContract.rollupRequest(proof);
//     });
//     await tx.prove();
//     await tx.sign([feePayerKey]).send();
//     let balanceAfter = Number(Account(addresses.rqter2).balance.get());
//     expect(balanceAfter - balanceBefore).toEqual(Number(RequestFee)); // refunded
//   });
// });
