import { Field, Mina, Provable, PublicKey, Reducer } from 'o1js';
import {
    compile,
    fetchActions,
    fetchZkAppState,
    proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import {
    BatchDecryption,
    BatchEncryption,
    CompleteResponse,
    CreateRequest,
    FinalizeRound1,
    FinalizeRound2,
    ReduceResponse,
    ReduceRound1,
    ReduceRound2,
    RequestContract,
    ResponseAction,
    ResponseContract,
    Round1Contract,
    Round2Contract,
} from '../../../index.js';
import {
    ActionStatus,
    ReduceStorage,
} from '../../../contracts/SharedStorage.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(ReduceRound1, cache);
    await compile(FinalizeRound1, cache);
    await compile(Round1Contract, cache);
    await compile(ReduceRound2, cache);
    await compile(BatchEncryption, cache);
    await compile(FinalizeRound2, cache);
    await compile(Round2Contract, cache);
    await compile(CreateRequest, cache);
    await compile(RequestContract, cache);
    await compile(ReduceResponse, cache);
    await compile(BatchDecryption, cache);
    await compile(CompleteResponse, cache);
    await compile(ResponseContract, cache);
    const responseAddress =
        'B62qoGfSCnimss8Cnt56BMDGUFmiBW4oiD28WfgHG5TuEHjkyv8QAdU';
    const responseContract = new ResponseContract(
        PublicKey.fromBase58(responseAddress)
    );

    // Fetch storage trees
    const reduceStorage = new ReduceStorage();

    // Fetch state and actions
    const rawState = (await fetchZkAppState(responseAddress)) || [];
    const responseState = {
        zkApps: rawState[0],
        reduceState: rawState[1],
        contributions: rawState[2],
    };
    console.log(responseState);

    const rawActions = await fetchActions(
        responseAddress,
        Reducer.initialActionState
    );
    const actions: ResponseAction[] = rawActions.map((e) => {
        let action: Field[] = e.actions[0].map((e) => Field(e));
        return ResponseAction.fromFields(action);
    });
    actions.map((e) => Provable.log(e));
    const actionHashes: Field[] = rawActions.map((e) => Field(e.hash));
    Provable.log('Action hashes:', actionHashes);

    let nextActionId = 0;
    const reducedActions = actions.slice(0, nextActionId);
    const notReducedActions = actions.slice(nextActionId);

    reducedActions.map((action, i) => {
        Provable.log(`Reduced Action ${i}:`, action);
        console.log('Adding to storage tree...');
        reduceStorage.updateLeaf(
            ReduceStorage.calculateIndex(actionHashes[i]),
            ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
        );
        console.log('Done');
    });

    console.log('ReduceResponse.firstStep...');
    let proof = await ReduceResponse.firstStep(
        ResponseAction.empty(),
        responseState.reduceState,
        nextActionId == 0
            ? Reducer.initialActionState
            : actionHashes[nextActionId - 1]
    );
    console.log('Done');

    for (let i = 0; i < notReducedActions.length; i++) {
        let action = notReducedActions[i];
        Provable.log(`Reducing Action ${nextActionId + i}:`, action);
        console.log('ReduceResponse.nextStep...');
        proof = await ReduceResponse.nextStep(
            action,
            proof,
            reduceStorage.getWitness(actionHashes[nextActionId + i])
        );
        console.log('Done');

        reduceStorage.updateLeaf(
            ReduceStorage.calculateIndex(actionHashes[nextActionId + i]),
            ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
        );
    }

    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            responseContract.reduce(proof);
        }
    );
    await proveAndSend(tx, feePayer.key, 'ResponseContract', 'reduce');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
