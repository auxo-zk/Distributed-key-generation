// import { Field, Mina, Provable, PublicKey } from 'o1js';
// import {
//   compile,
//   fetchActions,
//   fetchZkAppState,
//   proveAndSend,
// } from '../../helper/deploy.js';
// import { prepare } from '../prepare.js';
// import { DKGContract, KeyStatus, UpdateKey } from '../../../contracts/DKG.js';
// import { CreateRequest, DKGAction, RequestContract } from '../../../index.js';
// import { KeyStatusStorage } from '../../../contracts/DKGStorage.js';
// import { KeyCounterStorage } from '../../../contracts/CommitteeStorage.js';
// import axios from 'axios';

// async function main() {
//   const { cache, feePayer } = await prepare();
//   const commiteeId = Field(0);
//   const keyId = Field(0);

//   // Compile programs
//   await compile(CreateRequest, cache);
//   await compile(RequestContract, cache);
//   const requestAddress = '';
//   const requestContract = new RequestContract(
//     PublicKey.fromBase58(requestAddress)
//   );

//   // Fetch storage trees

//   const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
//     .data;

//   const keys = await Promise.all(
//     [...Array(committees.length).keys()].map(
//       async (e) =>
//         (
//           await axios.get(`https://api.auxo.fund/v0/committees/${e}/keys`)
//         ).data
//     )
//   );
//   const keyCounters = keys.map((e) => e.length);
//   keys.map((e, id) => {
//     if (e.length == 0) return;
//     keyCounterStorage.updateLeaf(
//       KeyCounterStorage.calculateLeaf(Field(keyCounters[id])),
//       KeyCounterStorage.calculateLevel1Index(Field(id))
//     );
//     e.map((key: any) => {
//       keyStatusStorage.updateLeaf(
//         Field(key.status),
//         KeyStatusStorage.calculateLevel1Index({
//           committeeId: Field(key.committeeId),
//           keyId: Field(key.keyId),
//         })
//       );
//     });
//   });

//   // Fetch state and actions
//   const rawState = (await fetchZkAppState(dkgAddress)) || [];
//   const dkgState = {
//     zkApps: rawState[0],
//     keyCounter: rawState[1],
//     keyStatus: rawState[2],
//   };

//   const fromState =
//     Field(
//       25079927036070901246064867767436987657692091363973573142121686150614948079097n
//     );
//   const toState = Field(0n);

//   const rawActions = await fetchActions(
//     dkgAddress,
//     fromState
//     // toState
//   );
//   const actions: DKGAction[] = rawActions.map((e) => {
//     let action: Field[] = e.actions[0].map((e) => Field(e));
//     return DKGAction.fromFields(action);
//   });
//   actions.map((e) => Provable.log(e));

//   console.log('UpdateKey.firstStep...');
//   let proof = await UpdateKey.firstStep(
//     DKGAction.empty(),
//     dkgState.keyCounter,
//     dkgState.keyStatus,
//     fromState
//   );
//   console.log('Done');

//   for (let i = 0; i < actions.length; i++) {
//     let action = actions[i];
//     Provable.log('Action:', action);
//     if (action.keyId.equals(Field(-1)).toBoolean()) {
//       console.log('UpdateKey.nextStepGeneration...');
//       proof = await UpdateKey.nextStepGeneration(
//         action,
//         proof,
//         Field(keyCounters[Number(action.committeeId)]),
//         keyCounterStorage.getWitness(
//           KeyCounterStorage.calculateLevel1Index(action.committeeId)
//         ),
//         keyStatusStorage.getWitness(
//           KeyStatusStorage.calculateLevel1Index({
//             committeeId: action.committeeId,
//             keyId: Field(i),
//           })
//         )
//       );
//       console.log('Done');

//       keyStatusStorage.updateLeaf(
//         Provable.switch(action.mask.values, Field, [
//           Field(KeyStatus.ROUND_1_CONTRIBUTION),
//           Field(KeyStatus.ROUND_2_CONTRIBUTION),
//           Field(KeyStatus.ACTIVE),
//           Field(KeyStatus.DEPRECATED),
//         ]),
//         KeyStatusStorage.calculateLevel1Index({
//           committeeId: action.committeeId,
//           keyId: Field(keyCounters[Number(action.committeeId)]),
//         })
//       );

//       keyCounterStorage.updateLeaf(
//         KeyCounterStorage.calculateLeaf(
//           Field(++keyCounters[Number(action.committeeId)])
//         ),
//         KeyCounterStorage.calculateLevel1Index(action.committeeId)
//       );
//     } else {
//       console.log('UpdateKey.nextStep...');
//       proof = await UpdateKey.nextStep(
//         action,
//         proof,
//         keyStatusStorage.getWitness(
//           KeyStatusStorage.calculateLevel1Index({
//             committeeId: action.committeeId,
//             keyId: Field(0),
//           })
//         )
//       );

//       keyStatusStorage.updateLeaf(
//         Provable.switch(action.mask.values, Field, [
//           Field(KeyStatus.ROUND_1_CONTRIBUTION),
//           Field(KeyStatus.ROUND_2_CONTRIBUTION),
//           Field(KeyStatus.ACTIVE),
//           Field(KeyStatus.DEPRECATED),
//         ]),
//         KeyStatusStorage.calculateLevel1Index({
//           committeeId: action.committeeId,
//           keyId: Field(0),
//         })
//       );
//       console.log('Done');
//     }
//   }

//   let tx = await Mina.transaction(
//     {
//       sender: feePayer.key.publicKey,
//       fee: feePayer.fee,
//       nonce: feePayer.nonce++,
//     },
//     () => {
//       dkgContract.updateKeys(proof);
//     }
//   );
//   await proveAndSend(tx, feePayer.key, 'DKGContract', 'updateKeys');
// }

// main()
//   .then()
//   .catch((err) => {
//     console.error(err);
//     process.exit(1);
//   });
