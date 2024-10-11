// import axios from 'axios';
// import { Field, Provable, UInt8 } from 'o1js';
// import { Utils } from '@auxo-dev/auxo-libs';
// import { prepare } from '../../helper/prepare.js';
// import { Rollup, RollupContract } from '../../../contracts/Rollup.js';
// import {
//     DkgAction,
//     KeyContract,
//     KeyStatus,
//     RollupKey,
//     RollupKeyInput,
// } from '../../../contracts/DKG.js';
// import { Network } from '../../helper/config.js';
// import { KeyStatusStorage, KeyStorage } from '../../../storages/KeyStorage.js';
// import { KeyCounterStorage } from '../../../storages/CommitteeStorage.js';
// import { RollupStorage } from '../../../storages/RollupStorage.js';
// import { ZkAppIndex } from '../../../contracts/constants.js';
// import { ProcessStorage } from '../../../storages/ProcessStorage.js';
// import { fetchAccounts } from '../../helper/index.js';
// import { AddressStorage } from '../../../storages/AddressStorage.js';

// async function main() {
//     const logger: Utils.Logger = {
//         info: true,
//         error: true,
//         memoryUsage: false,
//     };
//     const { accounts, cache, feePayer } = await prepare(
//         './caches',
//         { type: Network.Lightnet, doProofs: true },
//         {
//             aliases: ['rollup', 'committee', 'dkg', 'round1', 'round2'],
//         }
//     );

//     // Compile programs
//     await Utils.compile(Rollup, { cache });
//     await Utils.compile(RollupContract, { cache });
//     await Utils.compile(RollupKey, { cache });
//     await Utils.compile(KeyContract, { cache });

//     // Get zkApps
//     let rollupZkApp = Utils.getZkApp(
//         accounts.rollup,
//         new RollupContract(accounts.rollup.publicKey),
//         { name: RollupContract.name }
//     );
//     let dkgZkApp = Utils.getZkApp(
//         accounts.dkg,
//         new KeyContract(accounts.dkg.publicKey),
//         { name: KeyContract.name }
//     );
//     let dkgContract = dkgZkApp.contract as KeyContract;
//     let rollupContract = rollupZkApp.contract as RollupContract;
//     await fetchAccounts([rollupZkApp.key.publicKey, dkgZkApp.key.publicKey]);

//     // Fetch and rebuild storage trees
//     const sharedAddressStorage = new AddressStorage();
//     const keyStatusStorage = new KeyStatusStorage();
//     const keyCounterStorage = new KeyCounterStorage();
//     const keyStorage = new KeyStorage();
//     const processStorage = new ProcessStorage();
//     const rollupStorage = new RollupStorage();

//     const [
//         addressLeafs,
//         keyStatusLeafs,
//         keyCounterLeafs,
//         keyLeafs,
//         processLeafs,
//         rollupLeafs,
//     ] = await Promise.all([
//         (
//             await axios.get('https://api.auxo.fund/v0/storages/dkg/zkapp/leafs')
//         ).data,
//         (
//             await axios.get(
//                 'https://api.auxo.fund/v0/storages/dkg/key-status/leafs'
//             )
//         ).data,
//         (
//             await axios.get(
//                 'https://api.auxo.fund/v0/storages/dkg/key-counter/leafs'
//             )
//         ).data,
//         // Promise.resolve({
//         //     '0': {
//         //         leaf: '3',
//         //     },
//         // }),
//         // Promise.resolve({
//         //     '0': {
//         //         leaf: '1',
//         //     },
//         // }),
//         (
//             await axios.get('https://api.auxo.fund/v0/storages/dkg/key/leafs')
//         ).data,
//         (
//             await axios.get(
//                 'https://api.auxo.fund/v0/storages/dkg/process/leafs'
//             )
//         ).data,
//         (
//             await axios.get(
//                 'https://api.auxo.fund/v0/storages/rollup/rollup/leafs'
//             )
//         ).data,
//     ]);

//     Object.entries(addressLeafs).map(([index, data]: [string, any]) => {
//         sharedAddressStorage.updateLeaf(
//             { level1Index: Field.from(index) },
//             Field.from(data.leaf)
//         );
//     });
//     Object.entries(keyStatusLeafs).map(([index, data]: [string, any]) => {
//         keyStatusStorage.updateLeaf(
//             { level1Index: Field.from(index) },
//             Field.from(data.leaf)
//         );
//     });
//     Object.entries(keyCounterLeafs).map(([index, data]: [string, any]) => {
//         keyCounterStorage.updateLeaf(
//             { level1Index: Field.from(index) },
//             Field.from(data.leaf)
//         );
//     });
//     Object.entries(keyLeafs).map(([index, data]: [string, any]) => {
//         keyStorage.updateLeaf(
//             { level1Index: Field.from(index) },
//             Field.from(data.leaf)
//         );
//     });
//     Object.entries(processLeafs).map(([index, data]: [string, any]) => {
//         processStorage.updateLeaf(
//             { level1Index: Field.from(index) },
//             Field.from(data.leaf)
//         );
//     });
//     Object.entries(rollupLeafs).map(([index, data]: [string, any]) => {
//         rollupStorage.updateLeaf(
//             { level1Index: Field.from(index) },
//             Field.from(data.leaf)
//         );
//     });

//     // Fetch committees and keys data
//     const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
//         .data;
//     const keys = await Promise.all(
//         [...Array(committees.length).keys()].map(
//             async (e) =>
//                 (
//                     await axios.get(
//                         `https://api.auxo.fund/v0/committees/${e}/keys`
//                     )
//                 ).data
//         )
//     );
//     // const keyCounters = keys.map((e) => e.length);
//     const keyCounters = [1, 0];
//     console.log('Key counters:', keyCounters);

//     // Fetch states and actions
//     const rawState =
//         (await Utils.fetchZkAppState(accounts.dkg.publicKey)) || [];
//     const dkgState = {
//         zkAppRoot: rawState[0],
//         keyCounterRoot: rawState[1],
//         keyStatusRoot: rawState[2],
//         keyRoot: rawState[3],
//         processRoot: rawState[4],
//     };
//     Provable.log('States:', dkgState);

//     const initialActionId = 6;
//     const fromActionState =
//         Field(
//             22126959051895231307405889944910288267532471827757404273048235711007139356000n
//         );
//     const endActionState = Field(0n);
//     const previousActionStates = [
//         22126959051895231307405889944910288267532471827757404273048235711007139356000n,
//     ];
//     const nextActionStates = [
//         18628073894538149679700507158003773732300614559946531559896052254722478125949n,
//     ];

//     const rawActions = await Utils.fetchActions(
//         accounts.dkg.publicKey,
//         fromActionState
//         // endActionState,
//     );

//     const actions: DkgAction[] = rawActions.map((e) => {
//         let action: Field[] = e.actions[0].map((e) => Field(e));
//         return DkgAction.fromFields(action);
//     });
//     actions.map((e) => Provable.log(e));

//     let updateKeyProof = await Utils.prove(
//         RollupKey.name,
//         'init',
//         async () =>
//             RollupKey.init(
//                 new RollupKeyInput({
//                     previousActionState: Field(0),
//                     action: DkgAction.empty(),
//                     actionId: Field(0),
//                 }),
//                 rollupContract.rollupRoot.get(),
//                 dkgContract.keyCounterRoot.get(),
//                 dkgContract.keyStatusRoot.get(),
//                 dkgContract.keyRoot.get(),
//                 dkgContract.processRoot.get()
//             ),
//         { logger }
//     );

//     for (let i = 0; i < actions.length; i++) {
//         let actionId = Field(initialActionId + i);
//         let action = actions[i];
//         Provable.log('Action:', action);
//         let input = new RollupKeyInput({
//             previousActionState: Field(previousActionStates[i]),
//             action,
//             actionId,
//         });
//         Provable.log('Input:', input);
//         if (action.keyId.equals(Field(-1)).toBoolean()) {
//             let committeeId = action.committeeId;
//             let keyId = Field(keyCounters[Number(committeeId)]);
//             Provable.log(committeeId, keyId);
//             updateKeyProof = await Utils.prove(
//                 RollupKey.name,
//                 'generate',
//                 async () =>
//                     RollupKey.generate(
//                         input,
//                         updateKeyProof,
//                         keyId,
//                         keyCounterStorage.getLevel1Witness(
//                             KeyCounterStorage.calculateLevel1Index(committeeId)
//                         ),
//                         keyStatusStorage.getLevel1Witness(
//                             KeyStatusStorage.calculateLevel1Index({
//                                 committeeId,
//                                 keyId,
//                             })
//                         ),
//                         rollupStorage.getWitness(
//                             RollupStorage.calculateLevel1Index({
//                                 zkAppIndex: Field(ZkAppIndex.DKG),
//                                 actionId,
//                             })
//                         ),
//                         processStorage.getWitness(
//                             ProcessStorage.calculateIndex(actionId)
//                         )
//                     ),
//                 { logger }
//             );

//             keyStatusStorage.updateRawLeaf(
//                 {
//                     level1Index: KeyStatusStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: Field(keyCounters[Number(action.committeeId)]),
//                     }),
//                 },
//                 Provable.switch(action.mask.values, Field, [
//                     Field(KeyStatus.ROUND_1_CONTRIBUTION),
//                     Field(KeyStatus.ROUND_2_CONTRIBUTION),
//                     Field(KeyStatus.ACTIVE),
//                     Field(KeyStatus.DEPRECATED),
//                 ])
//             );

//             keyCounterStorage.updateRawLeaf(
//                 {
//                     level1Index:
//                         KeyCounterStorage.calculateLevel1Index(committeeId),
//                 },
//                 KeyCounterStorage.calculateLeaf(
//                     Field(++keyCounters[Number(action.committeeId)])
//                 )
//             );
//         } else {
//             updateKeyProof = await Utils.prove(
//                 RollupKey.name,
//                 'update',
//                 async () =>
//                     RollupKey.update(
//                         input,
//                         updateKeyProof,
//                         keyStatusStorage.getWitness(
//                             KeyStatusStorage.calculateLevel1Index({
//                                 committeeId: action.committeeId,
//                                 keyId: action.keyId,
//                             })
//                         ),
//                         keyStorage.getWitness(
//                             KeyStatusStorage.calculateLevel1Index({
//                                 committeeId: action.committeeId,
//                                 keyId: action.keyId,
//                             })
//                         ),
//                         rollupStorage.getWitness(
//                             RollupStorage.calculateLevel1Index({
//                                 zkAppIndex: Field(ZkAppIndex.DKG),
//                                 actionId,
//                             })
//                         ),
//                         processStorage.getWitness(
//                             ProcessStorage.calculateIndex(actionId)
//                         )
//                     ),
//                 { logger }
//             );

//             keyStatusStorage.updateLeaf(
//                 {
//                     level1Index: KeyStatusStorage.calculateLevel1Index({
//                         committeeId: action.committeeId,
//                         keyId: Field(action.keyId),
//                     }),
//                 },
//                 Provable.switch(action.mask.values, Field, [
//                     Field(KeyStatus.ROUND_1_CONTRIBUTION),
//                     Field(KeyStatus.ROUND_2_CONTRIBUTION),
//                     Field(KeyStatus.ACTIVE),
//                     Field(KeyStatus.DEPRECATED),
//                 ])
//             );
//             console.log('Done');
//         }

//         processStorage.updateRawLeaf(
//             {
//                 level1Index: ProcessStorage.calculateLevel1Index(actionId),
//             },
//             {
//                 actionState: Field(nextActionStates[i]),
//                 processCounter: UInt8.from(0),
//             }
//         );
//     }

//     await Utils.proveAndSendTx(
//         KeyContract.name,
//         'update',
//         async () =>
//             dkgContract.update(
//                 updateKeyProof,
//                 sharedAddressStorage.getZkAppRef(
//                     ZkAppIndex.ROLLUP,
//                     rollupContract.address
//                 )
//             ),
//         feePayer,
//         true,
//         { logger }
//     );
//     await fetchAccounts([dkgZkApp.key.publicKey]);
// }

// main()
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
