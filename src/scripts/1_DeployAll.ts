// import {
//     AccountUpdate,
//     Cache,
//     Field,
//     Mina,
//     PrivateKey,
//     PublicKey,
//     Reducer,
//     SmartContract,
//     fetchAccount,
// } from 'o1js';
// import fs from 'fs/promises';
// import { getProfiler } from './helper/profiler.js';
// import { Config, Key } from './helper/config.js';
// import { CommitteeContract, UpdateCommittee } from '../contracts/Committee.js';
// import { DkgContract, RollupDkg } from '../contracts/DKG.js';
// import {
//     FinalizeRound1,
//     RollupRound1,
//     Round1Contract,
// } from '../contracts/Round1.js';
// import {
//     FinalizeRound2,
//     RollupRound2,
//     Round2Contract,
// } from '../contracts/Round2.js';
// import {
//     FinalizeResponse,
//     RollupResponse,
//     ResponseContract,
// } from '../contracts/Response.js';
// import { BatchDecryption, BatchEncryption } from '../contracts/Encryption.js';
// import { AddressStorage } from '../storages/SharedStorage.js';
// import { ZkAppEnum, Contract } from '../constants.js';
// import { RequestContract, UpdateRequest } from '../contracts/Request.js';

// function waitConfig(time: number): Promise<void> {
//     console.log('Wait time...');
//     return new Promise((resolve) => setTimeout(resolve, time));
// }

// async function main() {
//     console.time('runTime');
//     const logMemUsage = () => {
//         console.log(
//             'Current memory usage:',
//             Math.floor(process.memoryUsage().rss / 1024 / 1024),
//             'MB'
//         );
//     };

//     const compile = async (prg: any, name: string, profiling = false) => {
//         if (logMemory) logMemUsage();
//         console.log(`Compiling ${name}...`);
//         if (profiling) DKGProfiler.start(`${name}.compile`);
//         await prg.compile({ cache });
//         if (profiling) DKGProfiler.stop();
//         console.log('Done!');
//     };

//     const deploy = async (
//         feePayer: Key,
//         name: string,
//         initArgs: [string, Field][],
//         fee?: number,
//         nonce?: number
//     ) => {
//         console.log(`Deploying ${name}...`);
//         let ct = name.toLowerCase().replace('contract', '');
//         let { contract, key } = contracts[ct];
//         let sender;
//         if (nonce) {
//             sender = { sender: feePayer.publicKey, fee: fee, nonce: nonce };
//         } else {
//             sender = { sender: feePayer.publicKey, fee: fee };
//         }
//         let tx = await Mina.transaction(sender, () => {
//             AccountUpdate.fundNewAccount(feePayer.publicKey, 1);
//             contract.deploy();
//             for (let i = 0; i < initArgs.length; i++) {
//                 (contract as any)[initArgs[i][0]].set(initArgs[i][1]);
//             }
//         });
//         await tx.sign([feePayer.privateKey, key.privateKey]).send();
//         console.log(`${name} deployed!`);
//         Object.assign(contracts[ct], {
//             contract: contract,
//         });
//     };

//     const fetchAllContract = async (contracts: {
//         [key: string]: {
//             key: Key;
//             contract: SmartContract;
//             actionStates: Field[];
//         };
//     }) => {
//         const maxAttempts = 10; // Maximum number of attempts
//         let attempts = 0;

//         while (attempts < maxAttempts) {
//             try {
//                 const entries = Object.entries(contracts);
//                 for (const [key, { contract }] of entries) {
//                     const [fetchedActions, fetchedAccount] = await Promise.all([
//                         Mina.fetchActions(contract.address),
//                         fetchAccount({ publicKey: contract.address }),
//                     ]);

//                     if (Array.isArray(fetchedActions)) {
//                         contracts[key].actionStates = [
//                             Reducer.initialActionState,
//                             ...fetchedActions.map((e) => Field(e.hash)),
//                         ];
//                     }
//                 }

//                 console.log('Fetch all info success');

//                 // If the code succeeds, break out of the loop
//                 break;
//             } catch (error) {
//                 console.log('Error: ', error);
//                 attempts++;

//                 // Wait for some time before retrying (e.g., 1 second)
//                 await new Promise((resolve) => setTimeout(resolve, 1000));
//             }
//         }

//         if (attempts === maxAttempts) {
//             console.log('Maximum number of attempts reached. Code failed.');
//         }
//     };

//     let feePayerKey: Key;
//     let contracts: {
//         [key: string]: {
//             key: Key;
//             contract: SmartContract;
//             actionStates: Field[];
//         };
//     } = {};

//     let configJson: Config = JSON.parse(
//         await fs.readFile('config.json', 'utf8')
//     );

//     feePayerKey = {
//         privateKey: PrivateKey.fromBase58(
//             'EKF6Za8RjGyhLmWSHCqw5R5kEVK7ktTU9mVgWwZNEvFHjrJdjucz'
//         ),
//         publicKey: PublicKey.fromBase58(
//             'B62qjpYQhA6Nsg2xo1FWSmy6yXkfL3S1oNxZ21awcFCKiRH6n9fWqPJ'
//         ),
//     };

//     console.log('pb: ', feePayerKey.publicKey.toBase58());

//     const profiling = false;
//     const logMemory = true;
//     const cache = Cache.FileSystem('./caches');
//     const DKGProfiler = getProfiler('Benchmark DKG');

//     const fee = 0.101 * 1e9; // in nanomina (1 billion = 1.0 mina)

//     const MINAURL = process.env.BERKELEY_MINA as string;
//     const ARCHIVEURL = process.env.BERKELEY_ARCHIVE as string;

//     const network = Mina.Network({
//         mina: MINAURL,
//         archive: ARCHIVEURL,
//     });
//     Mina.setActiveInstance(network);

//     let feePayerNonce;
//     let dk = false;

//     do {
//         let sender = await fetchAccount({
//             publicKey: feePayerKey.publicKey,
//         });
//         feePayerNonce = Number(sender.account?.nonce) - 1;
//         if (feePayerNonce) dk = true;
//         console.log('fetch nonce');
//         await waitConfig(1000); // 1s
//     } while (!dk);

//     console.log('Deploy account nonce: ', feePayerNonce);

//     await Promise.all(
//         Object.keys(Contract)
//             .filter((item) => isNaN(Number(item)))
//             .map(async (e) => {
//                 let config = configJson.deployAliases[e.toLowerCase()];
//                 // console.log(config);
//                 let keyBase58: { privateKey: string; publicKey: string } =
//                     JSON.parse(await fs.readFile(config.keyPath, 'utf8'));
//                 let key = {
//                     privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
//                     publicKey: PublicKey.fromBase58(keyBase58.publicKey),
//                 };
//                 let contract = (() => {
//                     switch (e.toLowerCase()) {
//                         case Contract.COMMITTEE:
//                             return new CommitteeContract(key.publicKey);
//                         case Contract.DKG:
//                             return new DkgContract(key.publicKey);
//                         case Contract.ROUND1:
//                             return new Round1Contract(key.publicKey);
//                         case Contract.ROUND2:
//                             return new Round2Contract(key.publicKey);
//                         case Contract.RESPONSE:
//                             return new ResponseContract(key.publicKey);
//                         case Contract.REQUEST:
//                             return new RequestContract(key.publicKey);
//                         default:
//                             console.log('Contract not valid');
//                             return new SmartContract(key.publicKey);
//                     }
//                 })();
//                 contracts[e.toLowerCase()] = {
//                     key: key,
//                     contract: contract,
//                     actionStates: [Reducer.initialActionState],
//                 };
//             })
//     );

//     // DkgContract storage
//     let dkgAddressStorage = new AddressStorage();

//     // Round1Contract storage
//     let round1AddressStorage = new AddressStorage();

//     // Round2Contract storage
//     let round2AddressStorage = new AddressStorage();

//     // Response storage
//     let responseAddressStorage = new AddressStorage();

//     await fetchAllContract(contracts);

//     if (true) {
//         await compile(RollupDkg, 'RollupDkg', profiling);

//         await compile(RollupRound1, 'RollupRound1', profiling);
//         await compile(FinalizeRound1, 'FinalizeRound1', profiling);

//         await compile(RollupRound2, 'RollupRound2', profiling);
//         await compile(BatchEncryption, 'BatchEncryption', profiling);
//         await compile(FinalizeRound2, 'FinalizeRound2', profiling);

//         await compile(RollupResponse, 'RollupResponse', profiling);
//         await compile(BatchDecryption, 'BatchDecryption', profiling);
//         await compile(FinalizeResponse, 'FinalizeResponse', profiling);

//         await compile(UpdateCommittee, 'UpdateCommittee', profiling);

//         await compile(UpdateRequest, 'UpdateRequest', profiling);

//         await compile(CommitteeContract, 'CommitteeContract', profiling);
//         await compile(DkgContract, 'DkgContract', profiling);
//         await compile(Round1Contract, 'Round1Contract', profiling);
//         await compile(Round2Contract, 'Round2Contract', profiling);
//         await compile(ResponseContract, 'ResponseContract', profiling);
//         await compile(RequestContract, 'RequestContract', profiling);
//     }

//     let tx;

//     // Deploy committee contract
//     await deploy(feePayerKey, 'CommitteeContract', [], fee, ++feePayerNonce);

//     dkgAddressStorage.updateLeaf(
//         dkgAddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//         dkgAddressStorage.calculateLeaf(
//             contracts[Contract.COMMITTEE].contract.address
//         )
//     );
//     round1AddressStorage.updateLeaf(
//         round1AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//         round1AddressStorage.calculateLeaf(
//             contracts[Contract.COMMITTEE].contract.address
//         )
//     );
//     round2AddressStorage.updateLeaf(
//         round2AddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//         round2AddressStorage.calculateLeaf(
//             contracts[Contract.COMMITTEE].contract.address
//         )
//     );
//     responseAddressStorage.updateLeaf(
//         responseAddressStorage.calculateIndex(ZkAppEnum.COMMITTEE),
//         responseAddressStorage.calculateLeaf(
//             contracts[Contract.COMMITTEE].contract.address
//         )
//     );

//     // Deploy dkg contract
//     await deploy(
//         feePayerKey,
//         'DkgContract',
//         [['zkApps', dkgAddressStorage.root]],
//         fee,
//         ++feePayerNonce
//     );
//     round1AddressStorage.updateLeaf(
//         round1AddressStorage.calculateIndex(ZkAppEnum.DKG),
//         round1AddressStorage.calculateLeaf(
//             contracts[Contract.DKG].contract.address
//         )
//     );
//     round2AddressStorage.updateLeaf(
//         round2AddressStorage.calculateIndex(ZkAppEnum.DKG),
//         round2AddressStorage.calculateLeaf(
//             contracts[Contract.DKG].contract.address
//         )
//     );
//     responseAddressStorage.updateLeaf(
//         responseAddressStorage.calculateIndex(ZkAppEnum.DKG),
//         responseAddressStorage.calculateLeaf(
//             contracts[Contract.DKG].contract.address
//         )
//     );

//     // Deploy round 1 contract
//     await deploy(
//         feePayerKey,
//         'Round1Contract',
//         [['zkApps', round1AddressStorage.root]],
//         fee,
//         ++feePayerNonce
//     );
//     round2AddressStorage.updateLeaf(
//         round2AddressStorage.calculateIndex(ZkAppEnum.ROUND1),
//         round2AddressStorage.calculateLeaf(
//             contracts[Contract.ROUND1].contract.address
//         )
//     );
//     responseAddressStorage.updateLeaf(
//         responseAddressStorage.calculateIndex(ZkAppEnum.ROUND1),
//         responseAddressStorage.calculateLeaf(
//             contracts[Contract.ROUND1].contract.address
//         )
//     );

//     // Deploy round 2 contract
//     await deploy(
//         feePayerKey,
//         'Round2Contract',
//         [['zkApps', round2AddressStorage.root]],
//         fee,
//         ++feePayerNonce
//     );
//     responseAddressStorage.updateLeaf(
//         responseAddressStorage.calculateIndex(ZkAppEnum.ROUND2),
//         responseAddressStorage.calculateLeaf(
//             contracts[Contract.ROUND2].contract.address
//         )
//     );

//     responseAddressStorage.updateLeaf(
//         responseAddressStorage.calculateIndex(ZkAppEnum.REQUEST),
//         responseAddressStorage.calculateLeaf(
//             contracts[Contract.REQUEST].contract.address
//         )
//     );

//     // Deploy response contract
//     await deploy(
//         feePayerKey,
//         'ResponseContract',
//         [['zkApps', responseAddressStorage.root]],
//         fee,
//         ++feePayerNonce
//     );

//     // await fetchAllContract(contracts);
//     let requestContract = contracts[Contract.REQUEST]
//         .contract as RequestContract;

//     tx = await Mina.transaction(
//         { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
//         () => {
//             AccountUpdate.fundNewAccount(feePayerKey.publicKey);
//             requestContract.deploy();
//             // requestContract.responseContractAddress.set(
//             //     contracts[Contract.REQUEST].contract.address
//             // );
//             let feePayerAccount = AccountUpdate.createSigned(
//                 feePayerKey.publicKey
//             );
//             feePayerAccount.send({
//                 to: contracts[Contract.REQUEST].contract,
//                 amount: 10 * 10 ** 9,
//             }); // 10 Mina
//         }
//     );
//     await tx
//         .sign([
//             feePayerKey.privateKey,
//             contracts[Contract.REQUEST].key.privateKey,
//         ])
//         .send();

//     console.log('Deploy all done, will complete in about 3~12 minutes!');
// }

// main();
