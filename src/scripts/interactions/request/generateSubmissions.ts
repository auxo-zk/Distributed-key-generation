// import fs from 'fs';

// import { Group } from 'o1js';
// import { Requester } from '../../../libs/index.js';
// import { SECRET_UNIT } from '../../../constants.js';
// import {
//     NullifierArray,
//     RandomVector,
//     SecretVector,
// } from '../../../libs/Requester.js';

// async function main() {
//     const submissionIds = [0, 1, 2, 3, 4];
//     const submissions = [
//         { 4: 10n * BigInt(SECRET_UNIT), 5: 20n * BigInt(SECRET_UNIT) },
//         { 2: 25n * BigInt(SECRET_UNIT), 8: 15n * BigInt(SECRET_UNIT) },
//         { 0: 5n * BigInt(SECRET_UNIT) },
//         { 9: 50n * BigInt(SECRET_UNIT) },
//         { 4: 3n * BigInt(SECRET_UNIT), 2: 3n * BigInt(SECRET_UNIT) },
//     ];
//     const taskId = 1;
//     const publicKey = Group.generator;

//     for (let i = 0; i < submissionIds.length; i++) {
//         let submissionFile = `mock/submissions-${taskId}-${submissionIds[i]}.json`;
//         let isMockCommitmentUsed = fs.existsSync(submissionFile);
//         if (isMockCommitmentUsed) continue;
//         let encryption = Requester.generateEncryption(
//             taskId,
//             publicKey,
//             submissions[i]
//         );
//         fs.writeFileSync(
//             submissionFile,
//             JSON.stringify({
//                 ...encryption,
//                 secrets: SecretVector.toJSON(encryption.secrets),
//                 randoms: RandomVector.toJSON(encryption.randoms),
//                 nullifiers: NullifierArray.toJSON(encryption.nullifiers),
//             })
//         );
//     }
// }

// main();
