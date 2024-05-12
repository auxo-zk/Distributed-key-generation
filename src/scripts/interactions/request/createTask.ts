import { Field, UInt64 } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../../helper/prepare.js';
import { calculateKeyIndex } from '../../../storages/DkgStorage.js';
import { UpdateRequest } from '../../../contracts/Request.js';
import { RequestContract } from '../../../contracts/Request.js';
import {
    AddressStorage,
    RequesterAddressBook,
    RequesterContract,
    TaskManagerContract,
    UpdateTask,
} from '../../../index.js';
import axios from 'axios';
import { Network } from '../../helper/config.js';
import { fetchAccounts } from '../../helper/index.js';

async function main() {
    const logger: Utils.Logger = {
        info: true,
        error: true,
        memoryUsage: false,
    };
    const { accounts, cache, feePayer } = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs: true },
        {
            aliases: ['requester', 'request', 'taskmanager', 'submission'],
        }
    );

    const committeeId = Field(0);
    const keyId = Field(0);

    // Compile programs
    await Utils.compile(UpdateRequest, cache);
    await Utils.compile(RequestContract, cache);
    await Utils.compile(UpdateTask, cache);
    await Utils.compile(RequesterContract, cache);
    await Utils.compile(TaskManagerContract, cache);

    // Get zkApps
    let requestZkApp = Utils.getZkApp(
        accounts.request,
        new RequestContract(accounts.request.publicKey),
        RequestContract.name
    );
    let requesterZkApp = Utils.getZkApp(
        accounts.requester,
        new RequesterContract(accounts.requester.publicKey),
        RequesterContract.name
    );
    let taskManagerZkApp = Utils.getZkApp(
        accounts.taskmanager,
        new TaskManagerContract(accounts.taskmanager.publicKey),
        TaskManagerContract.name
    );
    let taskManagerContract = taskManagerZkApp.contract as TaskManagerContract;
    await fetchAccounts([
        requestZkApp.key.publicKey,
        requesterZkApp.key.publicKey,
        taskManagerZkApp.key.publicKey,
    ]);

    // Fetch and rebuild storage trees
    const requesterAddressStorage = new AddressStorage();

    const [addressLeafs] = (
        await axios.get(
            'https://api.auxo.fund/v0/storages/requester/zkapp/leafs'
        )
    ).data;

    Object.entries(addressLeafs).map(([index, data]: [string, any]) => {
        requesterAddressStorage.updateLeaf(
            { level1Index: Field.from(index) },
            Field.from(data.leaf)
        );
    });

    // Prepare action
    const keyIndex = calculateKeyIndex(committeeId, keyId);
    const SUBMISSION_PERIOD = 10 * 60 * 1000;
    let submissionTs = UInt64.from(Date.now() + SUBMISSION_PERIOD);
    await Utils.proveAndSendTx(
        TaskManagerContract.name,
        'createTask',
        async () =>
            taskManagerContract.createTask(
                keyIndex,
                submissionTs,
                requesterAddressStorage.getZkAppRef(
                    RequesterAddressBook.TASK_MANAGER,
                    taskManagerZkApp.key.publicKey
                )
            ),
        feePayer,
        true,
        undefined,
        logger
    );
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
