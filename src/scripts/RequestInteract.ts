// import {
//     Field,
//     Reducer,
//     Mina,
//     PrivateKey,
//     PublicKey,
//     AccountUpdate,
//     MerkleMap,
//     MerkleWitness,
//     Proof,
//     Bool,
//     Account,
//     fetchAccount,
//     Void,
//     State,
//     Provable,
//     Poseidon,
//     Cache,
// } from 'o1js';

// import { getProfiler } from './helper/profiler.js';
// import randomAccounts from './helper/randomAccounts.js';
// import {
//     RequestContract,
//     RequestInput,
//     UnRequestInput,
//     ResolveInput,
//     UpdateRequest,
//     RequestVector,
//     RequestFee,
//     RollupStateOutput,
//     ActionEnum,
//     createActionMask,
//     RequestAction,
//     RequestStatusEnum,
//     RequestProof,
// } from '../contracts/Request.js';

// import fs from 'fs/promises';

// // check command line arg
// const deployAlias = process.argv[2];
// if (!deployAlias)
//     throw Error(`Missing <deployAlias> argument.

// Usage:
// node build/src/interact.js <deployAlias>
// Example:
// node build/src/scripts/Committee.js committeeberkeley
// `);
// Error.stackTraceLimit = 10000000;

// // parse config and private key from file
// type Config = {
//     deployAliases: Record<
//         string,
//         {
//             url: string;
//             keyPath: string;
//             fee: string;
//             feePayerKeyPath: string;
//             feePayerAlias: string;
//         }
//     >;
// };

// const waitTime = 7 * 60 * 1000; // 7m

// function wait(): Promise<void> {
//     console.log('Wait time...');
//     return new Promise((resolve) => setTimeout(resolve, waitTime));
// }

// async function main() {
//     const EmptyMerkleMap = new MerkleMap();

//     const statusMerkleMap = new MerkleMap();
//     const requesterMerkleMap = new MerkleMap();

//     let { keys, addresses } = randomAccounts(
//         'request',
//         'response',
//         'requester1',
//         'rqteD1',
//         'R1',
//         'D1'
//     );
//     let feePayerKey: PrivateKey;
//     let feePayer: PublicKey;
//     let requestContract: RequestContract;
//     let proof: RequestProof;
//     let committeeId1 = Field(1);
//     let keyId1 = Field(1);
//     // let D1: RequestVector = RequestVector.from([
//     //   addresses.D1.toGroup(),
//     //   addresses.D1.toGroup(),
//     // ]);

//     const requestStatusMap = new MerkleMap();
//     const requesterMap = new MerkleMap();

//     let configJson: Config = JSON.parse(
//         await fs.readFile('config.json', 'utf8')
//     );
//     let config = configJson.deployAliases[deployAlias];
//     let feePayerKeysBase58: { privateKey: string; publicKey: string } =
//         JSON.parse(await fs.readFile(config.feePayerKeyPath, 'utf8'));

//     let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
//         await fs.readFile(config.keyPath, 'utf8')
//     );

//     feePayerKey = PrivateKey.fromBase58(feePayerKeysBase58.privateKey);

//     // set up Mina instance and contract we interact with
//     const MINAURL = 'https://proxy.berkeley.minaexplorer.com/graphql';
//     const ARCHIVEURL = 'https://api.minascan.io/archive/berkeley/v1/graphql/';

//     const network = Mina.Network({
//         mina: MINAURL,
//         archive: ARCHIVEURL,
//     });
//     Mina.setActiveInstance(network);

//     const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
//     feePayer = feePayerKey.toPublicKey();

//     let R1: RequestVector = RequestVector.from([
//         feePayer.toGroup(),
//         feePayer.toGroup(),
//     ]);

//     let input1: RequestInput = new RequestInput({
//         committeeId: committeeId1,
//         keyId: keyId1,
//         R: R1,
//     });

//     let action1: RequestAction = new RequestAction({
//         requestId: input1.requestId(),
//         newRequester: feePayer,
//         R: R1,
//         D: RequestVector.empty(),
//         actionType: createActionMask(Field(ActionEnum.REQUEST)),
//     });

//     let sender = await fetchAccount({ publicKey: feePayer });
//     if (!sender.account) sender = await fetchAccount({ publicKey: feePayer });
//     let currentNonce = Number(sender.account?.nonce) - 1;
//     console.log('current nonce: ', currentNonce);

//     const cache = Cache.FileSystem('./caches');
//     console.log('compile...');
//     await UpdateRequest.compile({ cache });
//     await RequestContract.compile({ cache });
//     console.log('compile done');

//     let requestContractKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);
//     let requestContractAddress = requestContractKey.toPublicKey();

//     console.log('deploy...');
//     requestContract = new RequestContract(requestContractAddress);
//     let tx = await Mina.transaction(
//         { sender: feePayer, fee, nonce: ++currentNonce },
//         () => {
//             AccountUpdate.fundNewAccount(feePayer, 1);
//             requestContract.deploy();
//             requestContract.responseContractAddress.set(addresses.response);
//         }
//     );
//     await tx.sign([feePayerKey, requestContractKey, keys.response]).send();
//     await wait();
//     await fetchAccount({ publicKey: requestContractAddress });

//     console.log('request...');

//     tx = await Mina.transaction(
//         { sender: feePayer, fee, nonce: ++currentNonce },
//         () => {
//             requestContract.request(input1);
//         }
//     );
//     await tx.prove();
//     await tx.sign([feePayerKey]).send();

//     await wait();
//     await fetchAccount({ publicKey: requestContractAddress });

//     console.log('Create UpdateRequest.init requestInput1...');
//     proof = await UpdateRequest.init(
//         requestContract.actionState.get(),
//         requestStatusMap.getRoot(),
//         requesterMap.getRoot()
//     );
//     console.log('Create UpdateRequest.nextStep requestInput1...');
//     proof = await UpdateRequest.nextStep(
//         proof,
//         action1,
//         requestStatusMap.getWitness(input1.requestId()),
//         requesterMap.getWitness(input1.requestId()),
//         feePayer
//     );

//     tx = await Mina.transaction(
//         { sender: feePayer, fee, nonce: ++currentNonce },
//         () => {
//             requestContract.rollupRequest(proof);
//         }
//     );
//     await tx.prove();
//     await tx.sign([feePayerKey]).send();
// }

// main();
