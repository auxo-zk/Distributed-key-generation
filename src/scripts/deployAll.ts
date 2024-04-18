import { Field, Provable } from 'o1js';
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

async function main() {
    const doProofs = true;
    const logger = {
        info: true,
        debug: true,
    };

    let _ = await prepare(
        './caches',
        { type: Network.Local, doProofs },
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

    Provable.log(_.accounts.committee.publicKey);

    // Compile programs and contracts
    // await compileAll();

    // Prepare zkApps
    let rollupZkApp = {
        key: _.accounts.committee,
        contract: new RollupContract(_.accounts.committee.publicKey),
        name: RollupContract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };
    let committeeZkApp = {
        key: _.accounts.committee,
        contract: new CommitteeContract(_.accounts.committee.publicKey),
        name: CommitteeContract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };
    let dkgZkApp = {
        key: _.accounts.dkg,
        contract: new DkgContract(_.accounts.dkg.publicKey),
        name: DkgContract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };
    let round1ZkApp = {
        key: _.accounts.round1,
        contract: new Round1Contract(_.accounts.round1.publicKey),
        name: Round1Contract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };
    let round2ZkApp = {
        key: _.accounts.round2,
        contract: new Round2Contract(_.accounts.round2.publicKey),
        name: Round2Contract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };
    let requestZkApp = {
        key: _.accounts.request,
        contract: new RequestContract(_.accounts.request.publicKey),
        name: RequestContract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };
    let responseZkApp = {
        key: _.accounts.response,
        contract: new ResponseContract(_.accounts.response.publicKey),
        name: ResponseContract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };
    let requesterZkApp = {
        key: _.accounts.requester,
        contract: new RequesterContract(_.accounts.requester.publicKey),
        name: RequesterContract.name,
        initArgs: { zkAppRoot: requesterAddressStorage.root },
    };
    let taskManagerZkApp = {
        key: _.accounts.taskmanager,
        contract: new TaskManagerContract(_.accounts.taskmanager.publicKey),
        name: TaskManagerContract.name,
        initArgs: { requesterAddress: _.accounts.requester.publicKey },
    };
    let submissionZkApp = {
        key: _.accounts.submission,
        contract: new SubmissionContract(_.accounts.submission.publicKey),
        name: SubmissionContract.name,
        initArgs: { requesterAddress: _.accounts.requester.publicKey },
    };

    // Deploy zkApps
    await Utils.deployZkApps(
        [
            rollupZkApp,
            committeeZkApp,
            dkgZkApp,
            round1ZkApp,
            round2ZkApp,
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
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
