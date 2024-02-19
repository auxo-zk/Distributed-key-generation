// import fs from 'fs';
// import { Cache, Field, Mina, Provable, PublicKey, Reducer } from 'o1js';
// import { Config, JSONKey, Key } from '../helper/config.js';
// import { ContractList, compile } from '../helper/deploy.js';
// import { fetchActions, fetchZkAppState } from '../helper/deploy.js';
// import {
//   CommitteeAction,
//   CommitteeContract,
//   RollupCommittee,
// } from '../../contracts/Committee.js';
// import axios from 'axios';
// import { MemberArray } from '../../libs/Committee.js';
// import { IPFSHash } from '@auxo-dev/auxo-libs';
// import {
//   EMPTY_LEVEL_2_TREE,
//   MemberStorage,
//   SettingStorage,
// } from '../../contracts/CommitteeStorage.js';

// async function main() {
//   const cache = Cache.FileSystem('./caches');
//   let feePayerKey: Key;
//   let contracts: ContractList;

//   let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
//   let acc1: JSONKey = JSON.parse(
//     fs.readFileSync(configJson.deployAliases['acc1'].keyPath, 'utf8')
//   );
//   let acc2: JSONKey = JSON.parse(
//     fs.readFileSync(configJson.deployAliases['acc2'].keyPath, 'utf8')
//   );
//   let acc3: JSONKey = JSON.parse(
//     fs.readFileSync(configJson.deployAliases['acc3'].keyPath, 'utf8')
//   );
//   let acc4: JSONKey = JSON.parse(
//     fs.readFileSync(configJson.deployAliases['acc3'].keyPath, 'utf8')
//   );

//   const MINAURL = 'https://proxy.berkeley.minaexplorer.com/graphql';
//   const ARCHIVEURL = 'https://archive.berkeley.minaexplorer.com';
//   const network = Mina.Network({
//     mina: MINAURL,
//     archive: ARCHIVEURL,
//   });
//   Mina.setActiveInstance(network);

//   const committeeAddress =
//     'B62qiYCgNQhu1KddDQZs7HL8cLqRd683YufYX1BNceZ6BHnC1qfEcJ9';

//   const fetchCommitteeActions = fetchActions<{
//     actions: Field[][];
//     hash: string;
//   }>;

//   let memberStorage = new MemberStorage();
//   let settingStorage = new SettingStorage();

//   const committeeState = (await fetchZkAppState(committeeAddress)) || [];
//   Provable.log(committeeState);

//   const [memberLevel1, settingLevel1] = await Promise.all([
//     (
//       await axios.get(
//         'https://api.auxo.fund/v0/storages/committee/member/level1'
//       )
//     ).data,
//     (
//       await axios.get(
//         'https://api.auxo.fund/v0/storages/committee/setting/level1'
//       )
//     ).data,
//   ]);
//   // Provable.log('Member Level 1', memberLevel1);
//   // Provable.log('Setting Level 1', settingLevel1);
//   await compile(RollupCommittee, cache);
//   // await compile(CommitteeContract, cache);

//   const rawActions = await fetchCommitteeActions(
//     committeeAddress,
//     Field(
//       25079927036070901246064867767436987657692091363973573142121686150614948079097n
//     ),
//     Field(
//       1972653782998565751193839543112576956152658311032796175197111159970957407940n
//     )
//   );

//   // Provable.log('Actions:', actions);
//   const actions: CommitteeAction[] = rawActions.map(
//     (e) =>
//       new CommitteeAction({
//         addresses: MemberArray.from(e.actions[0].slice(0, 7)),
//         threshold: Field(e.actions[0][7]),
//         ipfsHash: IPFSHash.fromFields(e.actions[0].slice(8)),
//       })
//   );

//   console.log('RollupCommittee.firstStep...');
//   let proof = await RollupCommittee.firstStep(
//     Field(committeeState[0]),
//     Field(committeeState[1]),
//     Field(committeeState[2]),
//     Field(committeeState[3])
//   );
//   console.log('Done');

//   const reduceActions = actions;

//   for (let i = 0; i < reduceActions.length; i++) {
//     let action = reduceActions[i];
//     console.log(`${i} - RollupCommittee.nextStep...`);
//     let memberWitness = memberStorage.getLevel1Witness(Field(i));
//     let storageWitness = settingStorage.getWitness(Field(i));

//     if (!(proof || action || memberWitness || storageWitness))
//       throw new Error('Undefined params');

//     Provable.log('Proof:', proof);
//     Provable.log('Action:', action);
//     Provable.log('Member Witness:', memberWitness);
//     Provable.log('Storage Witness:', storageWitness);

//     proof = await RollupCommittee.nextStep(
//       proof,
//       action,
//       memberWitness,
//       storageWitness
//     );
//     console.log('Done');

//     let level2Tree = EMPTY_LEVEL_2_TREE();
//     for (let i = 0; i < Number(action.addresses.length); i++) {
//       level2Tree.setLeaf(
//         BigInt(i),
//         MemberArray.hash(action.addresses.get(Field(i)))
//       );
//     }

//     memberStorage.updateInternal(Field(0), level2Tree);
//     settingStorage.updateLeaf(
//       SettingStorage.calculateLeaf({
//         T: action.threshold,
//         N: action.addresses.length,
//       }),
//       Field(i)
//     );
//   }
// }

// main()
//   .then()
//   .catch((err) => {
//     console.error(err);
//     process.exit(1);
//   });
