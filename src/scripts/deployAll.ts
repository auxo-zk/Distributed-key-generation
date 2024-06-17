import { Field, Provable, TokenId } from 'o1js';
import { CommitteeContract } from '../contracts/Committee.js';
import { DkgContract } from '../contracts/DKG.js';
import { Round1Contract } from '../contracts/Round1.js';
import { Round2Contract } from '../contracts/Round2.js';
import { RequestContract } from '../contracts/Request.js';
import {
    RequesterContract,
    RequesterAddressBook,
    TaskManagerContract,
    SubmissionContract,
} from '../contracts/Requester.js';
import { ResponseContract } from '../contracts/Response.js';
import { AddressStorage } from '../storages/AddressStorage.js';
import { prepare } from './helper/prepare.js';
import { Network } from './helper/config.js';
import { Utils } from '@auxo-dev/auxo-libs';
import { ZkAppIndex } from '../contracts/constants.js';
import { RollupContract } from '../contracts/Rollup.js';
import { compile } from './helper/compile.js';

async function main() {
    const doProofs = true;
    const logger = {
        info: true,
        error: true,
    };

    let _ = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs },
        {
            aliases: [
                'rollup',
                'committee',
                'dkg',
                'round1',
                'round2',
                'request',
                'requester',
                'response',
                'taskmanager',
                'submission',
            ],
        }
    );

    // Construct address books
    let sharedAddressStorage = new AddressStorage();
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROLLUP),
        _.accounts.rollup.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.COMMITTEE),
        _.accounts.committee.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.DKG),
        _.accounts.dkg.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROUND1),
        _.accounts.round1.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROUND2),
        _.accounts.round2.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.REQUEST),
        _.accounts.request.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.RESPONSE),
        _.accounts.response.publicKey
    );

    let requesterAddressStorage = new AddressStorage();
    requesterAddressStorage.updateAddress(
        Field(RequesterAddressBook.TASK_MANAGER),
        _.accounts.taskmanager.publicKey
    );
    requesterAddressStorage.updateAddress(
        Field(RequesterAddressBook.SUBMISSION),
        _.accounts.submission.publicKey
    );
    requesterAddressStorage.updateAddress(
        Field(RequesterAddressBook.DKG),
        _.accounts.dkg.publicKey
    );
    requesterAddressStorage.updateAddress(
        Field(RequesterAddressBook.REQUEST),
        _.accounts.request.publicKey
    );

    // Prepare zkApps
    let rollupZkApp = Utils.getZkApp(
        _.accounts.rollup,
        new RollupContract(_.accounts.rollup.publicKey),
        RollupContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let committeeZkApp = Utils.getZkApp(
        _.accounts.committee,
        new CommitteeContract(_.accounts.committee.publicKey),
        CommitteeContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let dkgZkApp = Utils.getZkApp(
        _.accounts.dkg,
        new DkgContract(_.accounts.dkg.publicKey),
        DkgContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let round1ZkApp = Utils.getZkApp(
        _.accounts.round1,
        new Round1Contract(_.accounts.round1.publicKey),
        Round1Contract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let round2ZkApp = Utils.getZkApp(
        _.accounts.round2,
        new Round2Contract(_.accounts.round2.publicKey),
        Round2Contract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let rollupZkAppWithDkgToken = {
        ...rollupZkApp,
        contract: new RollupContract(
            _.accounts.rollup.publicKey,
            TokenId.derive(_.accounts.dkg.publicKey)
        ),
    };
    let rollupZkAppWithRound1Token = {
        ...rollupZkApp,
        contract: new RollupContract(
            _.accounts.rollup.publicKey,
            TokenId.derive(_.accounts.round1.publicKey)
        ),
    };
    let rollupZkAppWithRound2Token = {
        ...rollupZkApp,
        contract: new RollupContract(
            _.accounts.rollup.publicKey,
            TokenId.derive(_.accounts.round2.publicKey)
        ),
    };
    let dkgZkAppWithRound1Token = {
        ...dkgZkApp,
        contract: new DkgContract(
            _.accounts.dkg.publicKey,
            TokenId.derive(_.accounts.round1.publicKey)
        ),
    };
    let dkgZkAppWithRound2Token = {
        ...dkgZkApp,
        contract: new DkgContract(
            _.accounts.dkg.publicKey,
            TokenId.derive(_.accounts.round2.publicKey)
        ),
    };
    let requestZkApp = Utils.getZkApp(
        _.accounts.request,
        new RequestContract(_.accounts.request.publicKey),
        RequestContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let responseZkApp = Utils.getZkApp(
        _.accounts.response,
        new ResponseContract(_.accounts.response.publicKey),
        ResponseContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let requesterZkApp = Utils.getZkApp(
        _.accounts.requester,
        new RequesterContract(_.accounts.requester.publicKey),
        RequesterContract.name,
        { zkAppRoot: requesterAddressStorage.root }
    );
    let taskManagerZkApp = Utils.getZkApp(
        _.accounts.taskmanager,
        new TaskManagerContract(_.accounts.taskmanager.publicKey),
        TaskManagerContract.name,
        { requesterAddress: _.accounts.requester.publicKey }
    );
    let submissionZkApp = Utils.getZkApp(
        _.accounts.submission,
        new SubmissionContract(_.accounts.submission.publicKey),
        SubmissionContract.name,
        { requesterAddress: _.accounts.requester.publicKey }
    );
    let rollupZkAppWithResponseToken = {
        ...rollupZkApp,
        contract: new RollupContract(
            _.accounts.rollup.publicKey,
            TokenId.derive(_.accounts.response.publicKey)
        ),
    };
    let requestZkAppWithRequesterToken = {
        ...requestZkApp,
        contract: new RequestContract(
            _.accounts.request.publicKey,
            TokenId.derive(_.accounts.requester.publicKey)
        ),
    };
    let requesterWithTaskManagerToken = {
        ...requesterZkApp,
        contract: new RequesterContract(
            _.accounts.requester.publicKey,
            TokenId.derive(_.accounts.taskmanager.publicKey)
        ),
    };
    let requesterWithSubmissionToken = {
        ...requesterZkApp,
        contract: new RequesterContract(
            _.accounts.requester.publicKey,
            TokenId.derive(_.accounts.submission.publicKey)
        ),
    };

    // Compile programs and contracts
    await compile();

    // Deploy zkApps
    await Utils.deployZkApps(
        [rollupZkApp, committeeZkApp, dkgZkApp, round1ZkApp, round2ZkApp].map(
            (e) => e as unknown as Utils.ZkApp
        ),
        _.feePayer,
        true,
        logger
    );

    await Utils.deployZkApps(
        [
            requestZkApp,
            responseZkApp,
            requesterZkApp,
            taskManagerZkApp,
            submissionZkApp,
        ].map((e) => e as unknown as Utils.ZkApp),
        _.feePayer,
        true,
        logger
    );

    // Deploy contract accounts with tokens
    await Utils.deployZkAppsWithToken(
        [
            {
                owner: dkgZkApp,
                user: rollupZkAppWithDkgToken,
            },
            {
                owner: round1ZkApp,
                user: rollupZkAppWithRound1Token,
            },
            {
                owner: round2ZkApp,
                user: rollupZkAppWithRound2Token,
            },
            {
                owner: round1ZkApp,
                user: dkgZkAppWithRound1Token,
            },
            {
                owner: round2ZkApp,
                user: dkgZkAppWithRound2Token,
            },
        ],
        _.feePayer,
        true,
        logger
    );
    await Utils.deployZkAppsWithToken(
        [
            {
                owner: responseZkApp,
                user: rollupZkAppWithResponseToken,
            },
            {
                owner: requesterZkApp,
                user: requestZkAppWithRequesterToken,
            },
            {
                owner: taskManagerZkApp,
                user: requesterWithTaskManagerToken,
            },
            {
                owner: submissionZkApp,
                user: requesterWithSubmissionToken,
            },
        ],
        _.feePayer,
        true,
        logger
    );
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
