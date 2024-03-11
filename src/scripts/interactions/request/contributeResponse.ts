// import {
//     Field,
//     Group,
//     Mina,
//     Provable,
//     PublicKey,
//     Reducer,
//     Scalar,
//     Poseidon,
// } from 'o1js';
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
//     ResponseContract,
//     Round1Contract,
//     Round2Action,
//     Round2Contract,
//     BatchDecryptionProof,
// } from '../../../index.js';
// import {
//     RollupStatus,
//     ActionStorage,
// } from '../../../storages/SharedStorage.js';
// import { RArray } from '../../../libs/Requester.js';
// import { ZkAppRef } from '../../../storages/SharedStorage.js';
// import {
//     FullMTWitness as CommitteeFullWitness,
//     Level1Witness as CommitteeLevel1Witness,
// } from '../../../storages/CommitteeStorage.js';
// import {
//     FullMTWitness as DKGWitness,
//     Level1Witness,
// } from '../../../storages/DKGStorage.js';

// import fs from 'fs';

// export type InputContributeRespone = {
//     committeeId: Field;
//     keyId: Field;
//     requestId: Field;
//     decryptionProof: BatchDecryptionProof;
//     R: RArray;
//     ski: Scalar;
//     committee: ZkAppRef;
//     round1: ZkAppRef;
//     round2: ZkAppRef;
//     memberWitness: CommitteeFullWitness;
//     publicKeyWitness: DKGWitness;
//     encryptionWitness: DKGWitness;
// };

// async function main() {
//     const { cache, feePayer } = await prepare();

//     const data = JSON.parse(fs.readFileSync('temp.json', 'utf8'));
//     // console.log(Field(data.committeeId));
//     // console.log(Field(data.keyId));
//     // console.log(Field(data.requestId));
//     // console.log(BatchDecryptionProof.fromJSON(data.decryptionProof));
//     // console.log(
//     //   RArray.from(
//     //     data.RArray.values.map((e: any) => {
//     //       return Group.fromJSON(e);
//     //     })
//     //   )
//     // );
//     // Provable.log(Scalar.fromJSON(data.ski));
//     // Provable.log(ZkAppRef.fromJSON(data.committee));
//     // Provable.log(ZkAppRef.fromJSON(data.round1));
//     // Provable.log(ZkAppRef.fromJSON(data.round2));
//     // Provable.log(CommitteeFullWitness.fromJSON(data.memberW));
//     // Provable.log(DKGWitness.fromJSON(data.pubW));
//     // Provable.log(DKGWitness.fromJSON(data.encrypeW));

//     Provable.log(
//         'committee address: ',
//         ZkAppRef.fromJSON(data.committee).address
//     );
//     Provable.log(
//         'committee root: ',
//         ZkAppRef.fromJSON(data.committee).witness.calculateRoot(
//             Poseidon.hash(ZkAppRef.fromJSON(data.committee).address.toFields())
//         )
//     );
//     Provable.log('committee r1: ', ZkAppRef.fromJSON(data.round1).address);
//     Provable.log(
//         'committee root: ',
//         ZkAppRef.fromJSON(data.round1).witness.calculateRoot(
//             Poseidon.hash(ZkAppRef.fromJSON(data.round1).address.toFields())
//         )
//     );
//     Provable.log('committee r2: ', ZkAppRef.fromJSON(data.round2).address);
//     Provable.log(
//         'committee root: ',
//         ZkAppRef.fromJSON(data.round2).witness.calculateRoot(
//             Poseidon.hash(ZkAppRef.fromJSON(data.round2).address.toFields())
//         )
//     );

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

//     const requestAddress =
//         'B62qnDCCc8iHuXu7systFTc2EuipJQQcbA5DwYGXkJgrviv7dkcSnPi';
//     const responseAddress =
//         'B62qoGfSCnimss8Cnt56BMDGUFmiBW4oiD28WfgHG5TuEHjkyv8QAdU';
//     const committeeAddress =
//         'B62qjDLMhAw54JMrJLNZsrBRcoSjbQHQwn4ryceizpsQi8rwHQLA6R1';
//     const dkgAddress =
//         'B62qogHpAHHNP7PXAiRzHkpKnojERnjZq34GQ1PjjAv5wCLgtbYthAS';
//     const r1Address = 'B62qony53NMnmq49kxhtW1ttrQ8xvr58SNoX5jwgPY17pMChKLrjjWc';
//     const r2Address = 'B62qpvKFv8ey9FhsGAdcXxkg8yg1vZJQGoB2EySqJDZdANwP6Mh8SZ7';
//     const responseContract = new ResponseContract(
//         PublicKey.fromBase58(responseAddress)
//     );

//     await fetchZkAppState(responseAddress);
//     await fetchZkAppState(requestAddress);
//     await fetchZkAppState(committeeAddress);
//     await fetchZkAppState(dkgAddress);
//     await fetchZkAppState(r1Address);
//     await fetchZkAppState(r2Address);

//     let tx = await Mina.transaction(
//         {
//             sender: feePayer.key.publicKey,
//             fee: feePayer.fee,
//             nonce: feePayer.nonce++,
//         },
//         () => {
//             responseContract.contribute(
//                 Field(data.keyId),
//                 Field(data.requestId),
//                 BatchDecryptionProof.fromJSON(data.decryptionProof),
//                 RArray.from(
//                     data.RArray.values.map((e: any) => {
//                         return Group.fromJSON(e);
//                     })
//                 ),
//                 Scalar.fromJSON(data.ski),
//                 ZkAppRef.fromJSON(data.committee),
//                 ZkAppRef.fromJSON(data.round1),
//                 ZkAppRef.fromJSON(data.round2),
//                 CommitteeFullWitness.fromJSON(data.memberW),
//                 DKGWitness.fromJSON(data.pubW),
//                 DKGWitness.fromJSON(data.encrypeW)
//             );
//         }
//     );
//     await proveAndSend(tx, feePayer.key, 'Respone', 'contribute');
// }

// main()
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
