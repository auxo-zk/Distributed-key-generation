// import { Field, Mina, Provable, PublicKey, Reducer } from 'o1js';
// import {
//     compile,
//     fetchActions,
//     fetchZkAppState,
//     proveAndSend,
// } from '../../helper/deploy.js';
// import { prepare } from '../prepare.js';
// import {
//     BatchDecryption,
//     BatchEncryption,
//     FinalizeResponse,
//     UpdateRequest,
//     FinalizeRound1,
//     FinalizeRound2,
//     RollupResponse,
//     RollupRound1,
//     RollupRound2,
//     RequestContract,
//     ResponseAction,
//     ResponseContract,
//     Round1Contract,
//     Round2Contract,
// } from '../../../index.js';
// import {
//     RollupStatus,
//     ActionStorage,
// } from '../../../storages/SharedStorage.js';

// async function main() {
//     const { cache, feePayer } = await prepare();

//     // Compile programs
//     await compile(RollupRound1, cache);
//     await compile(FinalizeRound1, cache);
//     await compile(Round1Contract, cache);
//     await compile(RollupRound2, cache);
//     await compile(BatchEncryption, cache);
//     await compile(FinalizeRound2, cache);
//     await compile(Round2Contract, cache);
//     await compile(UpdateRequest, cache);
//     await compile(RequestContract, cache);
//     await compile(RollupResponse, cache);
//     await compile(BatchDecryption, cache);
//     await compile(FinalizeResponse, cache);
//     await compile(ResponseContract, cache);
//     const responseAddress =
//         'B62qoGfSCnimss8Cnt56BMDGUFmiBW4oiD28WfgHG5TuEHjkyv8QAdU';
//     const responseContract = new ResponseContract(
//         PublicKey.fromBase58(responseAddress)
//     );

//     // Fetch storage trees
//     const reduceStorage = new ActionStorage();

//     // Fetch state and actions
//     const rawState = (await fetchZkAppState(responseAddress)) || [];
//     const responseState = {
//         zkApps: rawState[0],
//         reduceState: rawState[1],
//         contributions: rawState[2],
//     };
//     console.log(responseState);

//     const rawActions = await fetchActions(
//         responseAddress,
//         Reducer.initialActionState
//     );
//     const actions: ResponseAction[] = rawActions.map((e) => {
//         let action: Field[] = e.actions[0].map((e) => Field(e));
//         return ResponseAction.fromFields(action);
//     });
//     actions.map((e) => Provable.log(e));
//     const actionHashes: Field[] = rawActions.map((e) => Field(e.hash));
//     Provable.log('Action hashes:', actionHashes);

//     let nextActionId = 0;
//     const reducedActions = actions.slice(0, nextActionId);
//     const notReducedActions = actions.slice(nextActionId);

//     reducedActions.map((action, i) => {
//         Provable.log(`Reduced Action ${i}:`, action);
//         console.log('Adding to storage tree...');
//         reduceStorage.updateLeaf(
//             ActionStorage.calculateIndex(actionHashes[i]),
//             ActionStorage.calculateLeaf(RollupStatus.ROLLUPED)
//         );
//         console.log('Done');
//     });

//     console.log('RollupResponse.init...');
//     let proof = await RollupResponse.init(
//         ResponseAction.empty(),
//         responseState.reduceState,
//         nextActionId == 0
//             ? Reducer.initialActionState
//             : actionHashes[nextActionId - 1]
//     );
//     console.log('Done');

//     for (let i = 0; i < notReducedActions.length; i++) {
//         let action = notReducedActions[i];
//         Provable.log(`Reducing Action ${nextActionId + i}:`, action);
//         console.log('RollupResponse.nextStep...');
//         // proof = await RollupResponse.nextStep(
//         //     action,
//         //     proof,
//         //     reduceStorage.getWitness(actionHashes[nextActionId + i])
//         // );
//         console.log('Done');

//         reduceStorage.updateLeaf(
//             ActionStorage.calculateIndex(actionHashes[nextActionId + i]),
//             ActionStorage.calculateLeaf(RollupStatus.ROLLUPED)
//         );
//     }

//     let tx = await Mina.transaction(
//         {
//             sender: feePayer.key.publicKey,
//             fee: feePayer.fee,
//             nonce: feePayer.nonce++,
//         },
//         () => {
//             responseContract.rollup(proof);
//         }
//     );
//     await proveAndSend(tx, feePayer.key, 'ResponseContract', 'reduce');
// }

// main()
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
