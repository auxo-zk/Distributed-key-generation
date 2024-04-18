import { Field, Mina, Provable, PublicKey, Reducer, fetchAccount } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { RequestLevel1Witness } from '../../../storages/RequestStorage.js';
import {
    RequestAction,
    UpdateRequest,
    RequestStatus,
} from '../../../contracts/Request.js';
import { RequestContract } from '../../../contracts/Request.js';
import axios from 'axios';
import { prepare } from '../../helper/prepare.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await Utils.compile(UpdateRequest, cache);
    await Utils.compile(RequestContract, cache);
    const requestAddress =
        'B62qjujctknmNAsUHEiRhxttm6vZ9ipSd5nfWP8ijGgHHcRzMDRHDcu';
    const requestContract = new RequestContract(
        PublicKey.fromBase58(requestAddress)
    );

    const rawState =
        (await Utils.fetchZkAppState(PublicKey.fromBase58(requestAddress))) ||
        [];
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
    // let requestStatusStorage = new RequestStatusStorage();
    // let requesterStorage = new RequesterStorage();

    // Build storage
    // for (const key in requestStatusValue) {
    //     requestStatusStorage.updateLeaf(
    //         { level1Index: Field(key) },
    //         Field(requestStatusValue[key]['leaf'])
    //     );
    // }

    // for (const key in requesterValue) {
    //     requesterStorage.updateLeaf(
    //         { level1Index: Field(key) },
    //         Field(requesterValue[key]['leaf'])
    //     );
    // }

    // Provable.log('request status root: ', requestStatusStorage.root);
    // Provable.log('requester value root: ', requesterStorage.root);

    const fromState = committeeState.actionState;
    const rawActions = await Utils.fetchActions(
        PublicKey.fromBase58(requestAddress),
        fromState
    );

    const actions: RequestAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return RequestAction.fromFields(action);
    });

    // console.log('UpdateRequest.init...');
    // let proof = await UpdateRequest.init(
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
