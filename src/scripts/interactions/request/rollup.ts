import { Field, Mina, Provable, PublicKey, Reducer, fetchAccount } from 'o1js';
import { compile, proveAndSend, wait } from '../../helper/deploy.js';
import { fetchActions, fetchZkAppState } from '../../helper/deploy.js';
import {
    RequestStatusStorage,
    RequesterStorage,
    Level1Witness,
} from '../../../contracts/RequestStorage.js';
import {
    RequestContract,
    RequestAction,
    CreateRequest,
    RequestStatusEnum,
} from '../../../contracts/Request.js';
import axios from 'axios';
import { prepare } from '../prepare.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(CreateRequest, cache);
    await compile(RequestContract, cache);
    const requestAddress =
        'B62qnDCCc8iHuXu7systFTc2EuipJQQcbA5DwYGXkJgrviv7dkcSnPi';
    const requestContract = new RequestContract(
        PublicKey.fromBase58(requestAddress)
    );

    const rawState = (await fetchZkAppState(requestAddress)) || [];
    const committeeState = {
        requestStatusRoot: Field(rawState[0]),
        requesterRoot: Field(rawState[1]),
        actionState: Field(rawState[2]),
        responeContractAddress: PublicKey.fromFields([
            rawState[3],
            rawState[4],
        ]),
    };

    // Fetch storage trees
    const [requesterValue, requestStatusValue] = await Promise.all([
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/request/requester/leaves/level1'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/request/request-status/leaves/level1'
            )
        ).data,
    ]);

    // Storage
    let requestStatusStorage = new RequestStatusStorage();
    let requesterStorage = new RequesterStorage();

    // Build storage
    for (const key in requestStatusValue) {
        requestStatusStorage.updateLeaf(
            { level1Index: Field(key) },
            Field(requestStatusValue[key])
        );
    }

    for (const key in requesterValue) {
        requesterStorage.updateLeaf(
            { level1Index: Field(key) },
            Field(requesterValue[key])
        );
    }

    const fromState = committeeState.actionState;
    const rawActions = await fetchActions(requestAddress, fromState);

    const actions: RequestAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return RequestAction.fromFields(action);
    });

    console.log('CreateRequest.firstStep...');
    let proof = await CreateRequest.firstStep(
        committeeState.actionState,
        committeeState.requestStatusRoot,
        committeeState.requesterRoot
    );

    const reduceActions = actions;

    for (let i = 0; i < reduceActions.length; i++) {
        let action = reduceActions[i];
        console.log(`${i} - CreateRequest.nextStep...`);

        proof = await CreateRequest.nextStep(
            proof,
            action,
            requestStatusStorage.getWitness(action.requestId),
            requesterStorage.getWitness(action.requestId),
            action.newRequester
        );
        console.log('Done');

        ////// update local state:
        requesterStorage.updateLeaf(
            { level1Index: action.requestId },
            requesterStorage.calculateLeaf({ address: action.newRequester })
        );

        // turn to request state
        requestStatusStorage.updateLeaf(
            { level1Index: action.requestId },
            requestStatusStorage.calculateLeaf({
                status: Field(RequestStatusEnum.REQUESTING),
            })
        );
    }

    console.log('requestContract.rollupRequest: ');
    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            requestContract.rollupRequest(proof);
        }
    );
    await proveAndSend(tx, feePayer.key, 'RequestContract', 'rollupRequest');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
