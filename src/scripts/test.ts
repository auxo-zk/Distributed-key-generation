// import {
//   Field,
//   Group,
//   method,
//   Provable,
//   PrivateKey,
//   PublicKey,
//   Scalar,
//   SmartContract,
//   state,
//   State,
//   Reducer,
//   Mina,
// } from 'o1js';
// import * as Committee from '../libs/Committee.js';
// import * as Requester from '../libs/Requester.js';
// import {
//   RequesterContract,
//   RequesterInput,
//   CustomScalarArray,
// } from '../contracts/Requester.js';
// import { RequestVector } from '../contracts/Request.js';
// import { CustomScalar, ScalarDynamicArray } from '@auxo-dev/auxo-libs';

// describe('Committee', () => {
//   let T = 3;
//   let N = 5;
//   let committees: {
//     privateKey: PrivateKey;
//     index: number;
//     secretPolynomial: Committee.SecretPolynomial;
//     round1Contribution?: Committee.Round1Contribution;
//     round2Contribution?: Committee.Round2Contribution;
//     responseContribution?: Committee.ResponseContribution;
//   }[] = [];
//   let round1Contributions: Committee.Round1Contribution[] = [];
//   let round2Contributions: Committee.Round2Contribution[] = [];
//   let responseContributions: Committee.ResponseContribution[] = [];
//   let publicKey: Group;
//   let R: Group[][] = [];
//   let M: Group[][] = [];
//   let sumR: Group[] = [];
//   let sumM: Group[] = [];
//   let D: Group[][] = [];
//   let listIndex = [1, 4, 5];
//   const plainVectors = [
//     [1000n, 0n, 0n, 0n],
//     [0n, 1000n, 0n, 0n],
//   ];
//   const plainScalar = [
// new CustomScalarArray([
//   CustomScalar.fromScalar(Scalar.from(1000n)),
//   CustomScalar.fromScalar(Scalar.from(0n)),
//   CustomScalar.fromScalar(Scalar.from(0n)),
//   CustomScalar.fromScalar(Scalar.from(0n)),
// ]),
//     new CustomScalarArray([
//       CustomScalar.fromScalar(Scalar.from(0n)),
//       CustomScalar.fromScalar(Scalar.from(1000n)),
//       CustomScalar.fromScalar(Scalar.from(0n)),
//       CustomScalar.fromScalar(Scalar.from(0n)),
//       // CustomScalar.fromScalar(Scalar.from(0n)),
//     ]),
//   ];
//   // let result = [5000n, 1000n, 1000n];
//   let random = [
//     Scalar.from(101n),
//     Scalar.from(202n),
//     Scalar.from(303n),
//     Scalar.from(404n),
//     // Scalar.from(505n),
//   ];
//   let scalarRandom = new CustomScalarArray([
//     CustomScalar.fromScalar(Scalar.from(101n)),
//     CustomScalar.fromScalar(Scalar.from(202n)),
//     CustomScalar.fromScalar(Scalar.from(303n)),
//     CustomScalar.fromScalar(Scalar.from(404n)),
//     // CustomScalar.fromScalar(Scalar.from(505n)),
//   ]);

//   beforeAll(async () => {
//     for (let i = 0; i < N; i++) {
//       let privateKey = PrivateKey.random();
//       let secretPolynomial = Committee.generateRandomPolynomial(T, N);
//       committees.push({
//         privateKey: privateKey,
//         index: i + 1,
//         secretPolynomial: secretPolynomial,
//         round1Contribution: undefined,
//         round2Contribution: undefined,
//       });
//     }
//   });

//   it('Should generate round 1 contribution', async () => {
//     for (let i = 0; i < N; i++) {
//       let round1Contribution = Committee.getRound1Contribution(
//         committees[i].secretPolynomial
//       );
//       committees[i].round1Contribution = round1Contribution;
//       round1Contributions.push(round1Contribution);
//       Provable.runAndCheck(() => round1Contribution);
//     }
//     publicKey = Committee.calculatePublicKey(round1Contributions);
//     // Provable.log(publicKey);
//     // Provable.log(round1Contributions);
//   });

//   it('Should generate round 2 contribution', async () => {
//     for (let i = 0; i < N; i++) {
//       let round2Contribution = Committee.getRound2Contribution(
//         committees[i].secretPolynomial,
//         committees[i].index,
//         round1Contributions,
//         [...Array(N).keys()].map((e) => Scalar.random())
//       );
//       committees[i].round2Contribution = round2Contribution;
//       round2Contributions.push(round2Contribution);
//       Provable.runAndCheck(() => round2Contribution);
//     }
//   });

//   it('Should accumulate encryption', async () => {
//     let publickey = Committee.calculatePublicKey(round1Contributions);
//     for (let i = 0; i < plainVectors.length; i++) {
//       let encryptedVector = Requester.generateEncryptionWithRandomInput(
//         random,
//         publickey,
//         plainVectors[i]
//       );

//       let newRequestContract = new RequesterContract(
//         PrivateKey.random().toPublicKey()
//       );

//       let contractValue = newRequestContract.request(
//         new RequesterInput({
//           committeeId: Field(0),
//           keyId: Field(0),
//           requetsTime: Field(0),
//           committeePublicKey: PublicKey.fromGroup(publickey),
//           // TODO: wintess to check if it the right publickey
//           secretVector: plainScalar[i],
//           random: scalarRandom,
//         })
//       );

//       // Provable.log('R real: ', new RequestVector(encryptedVector.R));
//       // Provable.log('R contract: ', contractValue.R);
//       Provable.log('M real: ', new RequestVector(encryptedVector.M));
//       Provable.log('M contract: ', contractValue.M);

//       //   R.push(encryptedVector.R);
//       //   M.push(encryptedVector.M);
//     }

//     // let accumulatedEncryption = Requester.accumulateEncryption(R, M);
//     // sumR = accumulatedEncryption.sumR;
//     // sumM = accumulatedEncryption.sumM;
//     // Provable.log('sumR: ', sumR);
//     // Provable.log('sumM: ', sumM);
//   });
// });
