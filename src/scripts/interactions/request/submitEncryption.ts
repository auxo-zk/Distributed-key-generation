// import { Field } from 'o1js';
// import { Utils } from '@auxo-dev/auxo-libs';
// import { prepare } from '../../helper/prepare.js';
// import { calculateKeyIndex } from '../../../storages/KeyStorage.js';
// import { RollupRequest } from '../../../contracts/Request.js';
// import { RequestContract } from '../../../contracts/Request.js';
// import {
//     AddressStorage,
//     RequesterContract,
//     SubmissionContract,
//     RollupTask,
// } from '../../../index.js';
// import axios from 'axios';
// import { Network } from '../../helper/config.js';
// import { fetchAccounts } from '../../helper/index.js';

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
//             aliases: ['requester', 'request', 'submission'],
//         }
//     );

//     const committeeId = Field(0);
//     const keyId = Field(0);

//     // Compile programs
//     await Utils.compile(RollupRequest, { cache });
//     await Utils.compile(RequestContract, { cache });
//     await Utils.compile(RollupTask, { cache });
//     await Utils.compile(RequesterContract, { cache });
//     await Utils.compile(SubmissionContract, { cache });

//     // Get zkApps
//     let requestZkApp = Utils.getZkApp(
//         accounts.request,
//         new RequestContract(accounts.request.publicKey),
//         { name: RequestContract.name }
//     );
//     let requesterZkApp = Utils.getZkApp(
//         accounts.requester,
//         new RequesterContract(accounts.requester.publicKey),
//         { name: RequesterContract.name }
//     );
//     let submissionZkApp = Utils.getZkApp(
//         accounts.submission,
//         new SubmissionContract(accounts.submission.publicKey),
//         { name: SubmissionContract.name }
//     );
//     let submissionContract = submissionZkApp.contract as SubmissionContract;
//     await fetchAccounts([
//         requestZkApp.key.publicKey,
//         requesterZkApp.key.publicKey,
//         submissionZkApp.key.publicKey,
//     ]);

//     // Fetch and rebuild storage trees
//     const requesterAddressStorage = new AddressStorage();

//     const [addressLeafs] = (
//         await axios.get(
//             'https://api.auxo.fund/v0/storages/requester/zkapp/leafs'
//         )
//     ).data;

//     Object.entries(addressLeafs).map(([index, data]: [string, any]) => {
//         requesterAddressStorage.updateLeaf(
//             { level1Index: Field.from(index) },
//             Field.from(data.leaf)
//         );
//     });

//     // Prepare action
//     const keyIndex = calculateKeyIndex(committeeId, keyId);
// }

// main()
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
