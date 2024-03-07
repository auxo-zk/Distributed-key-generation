// import {
//     Field,
//     Mina,
//     Provable,
//     PublicKey,
//     PrivateKey,
//     Reducer,
//     fetchAccount,
// } from 'o1js';
// import 'dotenv/config.js';
// import { compile, proveAndSend, wait } from '../../helper/deploy.js';
// import { fetchZkAppState } from '../../helper/deploy.js';
// import { Config, Key } from '../../helper/config.js';
// import { CustomScalar, IPFSHash } from '@auxo-dev/auxo-libs';
// import {
//     kMemberInput,
//     CommitteeContract,
//     CreateCommittee,
//     CommitteeAction,
// } from '../../../contracts/Committee.js';
// import axios from 'axios';
// import { MemberArray } from '../../../libs/Committee.js';
// import fs from 'fs/promises';
// import {
//     EMPTY_LEVEL_2_TREE,
//     FullMTWitness,
//     Level1Witness,
//     Level2Witness,
//     MemberStorage,
//     SettingStorage,
// } from '../../../contracts/CommitteeStorage.js';
// import { prepare } from '../prepare.js';

// async function main() {
//     const { cache, feePayer } = await prepare();

//     // Compile programs
//     await compile(CreateCommittee, cache);
//     await compile(CommitteeContract, cache);
//     const committeeAddress =
//         'B62qjDLMhAw54JMrJLNZsrBRcoSjbQHQwn4ryceizpsQi8rwHQLA6R1';
//     const committeeContract = new CommitteeContract(
//         PublicKey.fromBase58(committeeAddress)
//     );

//     await fetchZkAppState(committeeAddress);

//     console.log('committeeContract.createCommittee: ');

//     let configJson: Config = JSON.parse(
//         await fs.readFile('config.json', 'utf8')
//     );

//     let acc1: { privateKey: string; publicKey: string } = JSON.parse(
//         await fs.readFile(configJson.deployAliases['acc1'].keyPath, 'utf8')
//     );
//     let acc2: { privateKey: string; publicKey: string } = JSON.parse(
//         await fs.readFile(configJson.deployAliases['acc2'].keyPath, 'utf8')
//     );

//     let members: Key[] = [
//         {
//             privateKey: PrivateKey.fromBase58(acc1.privateKey),
//             publicKey: PublicKey.fromBase58(acc1.publicKey),
//         },
//         {
//             privateKey: PrivateKey.fromBase58(acc2.privateKey),
//             publicKey: PublicKey.fromBase58(acc2.publicKey),
//         },
//     ];

//     let arrayAddress = [];
//     for (let i = 0; i < members.length; i++) {
//         arrayAddress.push(members[i].publicKey);
//     }

//     let myMemberArray1 = new MemberArray(arrayAddress);

//     let committeeAction = new CommitteeAction({
//         addresses: myMemberArray1,
//         threshold: Field(1),
//         ipfsHash: IPFSHash.fromString(
//             'QmeeuwKeiAYSMjpj6f1wLQmhbvzsqc1qaemkim5Mbd9v8v'
//         ),
//     });

//     // Prove and submit tx
//     let tx = await Mina.transaction(
//         {
//             sender: feePayer.key.publicKey,
//             fee: feePayer.fee,
//             nonce: feePayer.nonce++,
//         },
//         () => {
//             committeeContract.createCommittee(committeeAction);
//         }
//     );
//     await proveAndSend(
//         tx,
//         feePayer.key,
//         'CommitteeContract',
//         'createCommittee'
//     );
// }

// main()
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
