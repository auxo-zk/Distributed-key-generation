import { Field, Mina, Provable, PublicKey, Reducer, fetchAccount } from 'o1js';
import { compile, proveAndSend, wait } from '../../helper/deploy.js';
import { fetchActions, fetchZkAppState } from '../../helper/deploy.js';
import {
    RequestStatusStorage,
    RequesterStorage,
    Level1Witness,
} from '../../../storages/RequestStorage.js';
import {
    RequestContract,
    Action as RequestAction,
    UpdateRequest,
    RequestStatus,
} from '../../../contracts/Request.js';
import axios from 'axios';
import { prepare } from '../prepare.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(UpdateRequest, cache);
    await compile(RequestContract, cache);
    const requestAddress =
        'B62qjujctknmNAsUHEiRhxttm6vZ9ipSd5nfWP8ijGgHHcRzMDRHDcu';
    const requestContract = new RequestContract(
        PublicKey.fromBase58(requestAddress)
    );

    const rawState = (await fetchZkAppState(requestAddress)) || [];
    const committeeState = {
        requestStatusRoot: Field(rawState[0]),
        requesterRoot: Field(rawState[1]),
        actionState: Field(rawState[2]),
        responseContractAddress: PublicKey.fromFields([
            rawState[3],
            rawState[4],
        ]),
    };

    // Fetch storage trees
    const [requesterValue, requestStatusValue] = await Promise.all([
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/request/requester/leafs'
            )
        ).data,
        (
            await axios.get(
                'https://api.auxo.fund/v0/storages/request/request-status/leafs'
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
            Field(requestStatusValue[key]['leaf'])
        );
    }

    for (const key in requesterValue) {
        requesterStorage.updateLeaf(
            { level1Index: Field(key) },
            Field(requesterValue[key]['leaf'])
        );
    }

    Provable.log('request status root: ', requestStatusStorage.root);
    Provable.log('requester value root: ', requesterStorage.root);

    const fromState = committeeState.actionState;
    const rawActions = await fetchActions(requestAddress, fromState);

    const actions: RequestAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return RequestAction.fromFields(action);
    });

    // console.log('UpdateRequest.firstStep...');
    // let proof = await UpdateRequest.firstStep(
    //     committeeState.actionState,
    //     committeeState.requestStatusRoot,
    //     committeeState.requesterRoot
    // );

    // const reduceActions = actions;

    // for (let i = 0; i < reduceActions.length; i++) {
    //     let action = reduceActions[i];
    //     console.log(`${i} - UpdateRequest.nextStep...`);

    //     proof = await UpdateRequest.nextStep(
    //         proof,
    //         action,
    //         requestStatusStorage.getWitness(action.requestId),
    //         requesterStorage.getWitness(action.requestId),
    //         action.newRequester
    //     );
    //     console.log('Done');

    //     ////// update local state:
    //     requesterStorage.updateLeaf(
    //         { level1Index: action.requestId },
    //         requesterStorage.calculateLeaf(action.newRequester)
    //     );

    //     // turn to request state
    //     requestStatusStorage.updateLeaf(
    //         { level1Index: action.requestId },
    //         requestStatusStorage.calculateLeaf(
    //             Field(RequestStatusEnum.REQUESTING)
    //         )
    //     );
    // }

    // console.log('requestContract.rollupRequest: ');
    // let tx = await Mina.transaction(
    //     {
    //         sender: feePayer.key.publicKey,
    //         fee: feePayer.fee,
    //         nonce: feePayer.nonce++,
    //     },
    //     () => {
    //         requestContract.rollup(proof);
    //     }
    // );
    // await proveAndSend(tx, feePayer.key, 'RequestContract', 'rollupRequest');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
