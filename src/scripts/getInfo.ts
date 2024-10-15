// import { CommitteeContract, RollupCommittee } from '../contracts/Committee.js';
// import { KeyContract, RollupDkg } from '../contracts/DKG.js';
// import { BatchDecryption, BatchEncryption } from '../contracts/Encryption.js';
// import {
//     FinalizeResponse,
//     RollupResponse,
//     ResponseContract,
// } from '../contracts/Response.js';
// import {
//     RollupContribution,
//     RollupRound1,
//     Round1Contract,
// } from '../contracts/Round1.js';
// import {
//     FinalizeRound2,
//     RollupRound2,
//     Round2Contract,
// } from '../contracts/Round2.js';

// const PROGRAMS = {
//     BatchEncryption,
//     BatchDecryption,
//     RollupCommittee,
//     RollupDkg,
//     RollupRound1,
//     RollupContribution,
//     RollupRound2,
//     FinalizeRound2,
//     RollupResponse,
//     FinalizeResponse,
//     // RollupRequest,
//     // CreateRollupStatus,
//     // RollupActions,
// };

// const CONTRACTS = {
//     CommitteeContract,
//     KeyContract,
//     Round1Contract,
//     Round2Contract,
//     ResponseContract,
//     // RequestContract,
//     // RequesterContract,
// };

// const DEPENDENCIES = {
//     CommitteeContract: [RollupCommittee],
//     KeyContract: [RollupDkg],
//     Round1Contract: [RollupRound1, RollupContribution],
//     Round2Contract: [RollupRound2, BatchEncryption, FinalizeRound2],
//     ResponseContract: [RollupResponse, BatchDecryption, FinalizeResponse],
//     RequestContract: [],
//     RequesterContract: [],
// };

// async function query(constraints = true, cacheFiles = false) {
//     if (constraints) {
//         // @todo - Log table
//         console.log('Constraints list:');
//         let constraints: { [key: string]: number } = {};

//         Object.entries(PROGRAMS).map(([name, prg]) => {
//             let analysis = (prg as any).analyzeMethods();
//             let cs = {};
//             Object.keys(prg)
//                 .slice(7)
//                 .map((e, i) => {
//                     Object.assign(cs, { [e]: analysis[i].rows });
//                 });
//             Object.assign(constraints, { [name]: cs });
//         });

//         Object.entries(CONTRACTS).map(([name, ct]) => {
//             let analysis = (ct as any).analyzeMethods();
//             let cs = {};
//             Object.entries(analysis).map(([k, v]) => {
//                 Object.assign(cs, { [k]: (v as any).rows });
//             });
//             Object.assign(constraints, { [name]: cs });
//         });

//         console.log(constraints);
//         console.log();
//     }

//     if (cacheFiles) {
//         // @todo - Log table
//         console.log('Cache files list:');
//         let cacheFiles: { [key: string]: string[] } = {};

//         enum KeyType {
//             StepProvingKey = 'step-pk',
//             StepVerificationKey = 'step-vk',
//             WrapProvingKey = 'wrap-pk',
//             WrapVerificationKey = 'wrap-vk',
//         }

//         Object.entries(DEPENDENCIES).map(([ct, prgs], i) => {
//             let ctName = ct.toLowerCase();
//             let fileNames: string[] = [];
//             fileNames = fileNames.concat([
//                 `${KeyType.WrapProvingKey}-${ctName}`,
//                 `${KeyType.WrapProvingKey}-${ctName}.header`,
//                 `${KeyType.WrapVerificationKey}-${ctName}`,
//                 `${KeyType.WrapVerificationKey}-${ctName}.header`,
//             ]);

//             let ctAnalysis = (
//                 Object.values(CONTRACTS)[i] as any
//             ).analyzeMethods();
//             console.log(ctAnalysis);

//             Object.assign(cacheFiles, { [ct]: fileNames });
//         });
//         console.log(cacheFiles);
//         console.log();
//     }
// }

// query()
//     .then(() => process.exit(0))
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
