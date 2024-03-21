import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Reducer,
    Struct,
    SelfProof,
    Poseidon,
    UInt64,
    ZkProgram,
    Provable,
    Group,
    Scalar,
    UInt8,
} from 'o1js';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import { REQUEST_FEE, ZkAppEnum, ZkProgramEnum } from '../constants.js';
import { ErrorEnum, ZkAppAction } from './constants.js';
import {
    EMPTY_ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import {
    EMPTY_LEVEL_1_TREE,
    Level1Witness,
} from '../storages/RequestStorage.js';
import { rollup } from './Rollup.js';
import { ResponseContract } from './Response.js';
import {
    EMPTY_LEVEL_2_TREE,
    Level2Witness,
} from '../storages/RequesterStorage.js';

export {
    RequestStatus,
    Action as RequestAction,
    ComputeResultInput,
    ComputeResultOutput,
    ComputeResult,
    ComputeResultProof,
    UpdateRequestInput,
    UpdateRequestOutput,
    UpdateRequest,
    UpdateRequestProof,
    RequestContract,
};

const enum RequestStatus {
    INITIALIZED,
    RESOLVED,
    EXPIRED,
}

class Action
    extends Struct({
        requestId: Field,
        keyIndex: Field,
        taskId: Field,
        expirationTimestamp: UInt64,
        dimension: UInt8,
        accumulationRoot: Field,
        resultRoot: Field,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            requestId: Field(0),
            keyIndex: Field(0),
            taskId: Field(0),
            expirationTimestamp: UInt64.zero,
            dimension: UInt8.from(0),
            accumulationRoot: Field(0),
            resultRoot: Field(0),
        });
    }
    static fromFields(input: Field[]): Action {
        return super.fromFields(input) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

class ComputeResultInput extends Struct({
    M: Group,
    D: Group,
    result: Scalar,
}) {}

class ComputeResultOutput extends Struct({
    accumulationRootM: Field,
    responseRootD: Field,
    resultRoot: Field,
    counter: UInt8,
}) {}

const ComputeResult = ZkProgram({
    name: ZkProgramEnum.ComputeResult,
    publicInput: ComputeResultInput,
    publicOutput: ComputeResultOutput,
    methods: {
        init: {
            privateInputs: [],
            method(input: ComputeResultInput) {
                return new ComputeResultOutput({
                    accumulationRootM: EMPTY_LEVEL_2_TREE().getRoot(),
                    responseRootD: EMPTY_LEVEL_2_TREE().getRoot(),
                    resultRoot: EMPTY_LEVEL_2_TREE().getRoot(),
                    counter: UInt8.from(0),
                });
            },
        },
        compute: {
            privateInputs: [
                SelfProof<ComputeResultInput, ComputeResultOutput>,
                Level2Witness,
                Level2Witness,
                Level2Witness,
            ],
            method(
                input: ComputeResultInput,
                earlierProof: SelfProof<
                    ComputeResultInput,
                    ComputeResultOutput
                >,
                accumulationWitness: Level2Witness,
                responseWitness: Level2Witness,
                resultWitness: Level2Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify empty M, D, and result value
                earlierProof.publicOutput.accumulationRootM.assertEquals(
                    accumulationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        ComputeResult.compute.name,
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                earlierProof.publicOutput.counter.value.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        ComputeResult.compute.name,
                        ErrorEnum.ACCUMULATION_INDEX_L2
                    )
                );
                earlierProof.publicOutput.responseRootD.assertEquals(
                    responseWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        ComputeResult.compute.name,
                        ErrorEnum.RES_D_ROOT
                    )
                );
                earlierProof.publicOutput.counter.value.assertEquals(
                    responseWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        ComputeResult.compute.name,
                        ErrorEnum.RES_D_INDEX_L2
                    )
                );
                earlierProof.publicOutput.resultRoot.assertEquals(
                    resultWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        ComputeResult.compute.name,
                        ErrorEnum.REQUEST_RESULT_ROOT
                    )
                );
                earlierProof.publicOutput.counter.value.assertEquals(
                    resultWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        ComputeResult.compute.name,
                        ErrorEnum.REQUEST_RESULT_INDEX_L2
                    )
                );

                let resultPoint = input.M.sub(input.D);

                // Verify result value
                Provable.if(
                    resultPoint.equals(Group.zero),
                    CustomScalar.fromScalar(input.result).equals(
                        CustomScalar.fromScalar(Scalar.from(0))
                    ),
                    resultPoint.equals(Group.generator.scale(input.result))
                ).assertTrue(
                    Utils.buildAssertMessage(
                        RequestContract.name,
                        RequestContract.prototype.resolve.name,
                        ErrorEnum.REQUEST_RESULT
                    )
                );

                // Update M, D, and result root
                let accumulationRootM = accumulationWitness.calculateRoot(
                    Poseidon.hash(input.M.toFields())
                );
                let responseRootD = responseWitness.calculateRoot(
                    Poseidon.hash(input.D.toFields())
                );
                let resultRoot = responseWitness.calculateRoot(
                    Poseidon.hash(
                        CustomScalar.fromScalar(input.result).toFields()
                    )
                );

                return new ComputeResultOutput({
                    accumulationRootM,
                    responseRootD,
                    resultRoot,
                    counter: earlierProof.publicOutput.counter.add(1),
                });
            },
        },
    },
});

class ComputeResultProof extends ZkProgram.Proof(ComputeResult) {}

class UpdateRequestInput extends Action {}

class UpdateRequestOutput extends Struct({
    initialRequestCounter: Field,
    initialKeyIndexRoot: Field,
    initialTaskIdRoot: Field,
    initialAccumulationRoot: Field,
    initialExpirationRoot: Field,
    initialResultRoot: Field,
    initialActionState: Field,
    nextRequestCounter: Field,
    nextKeyIndexRoot: Field,
    nextTaskIdRoot: Field,
    nextAccumulationRoot: Field,
    nextExpirationRoot: Field,
    nextResultRoot: Field,
    nextActionState: Field,
}) {}

/**
 * @todo Prevent failure for duplicated resolve actions
 */
const UpdateRequest = ZkProgram({
    name: ZkProgramEnum.UpdateRequest,
    publicInput: UpdateRequestInput,
    publicOutput: UpdateRequestOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field, Field, Field],
            method(
                input: UpdateRequestInput,
                initialRequestCounter: Field,
                initialKeyIndexRoot: Field,
                initialTaskIdRoot: Field,
                initialAccumulationRoot: Field,
                initialExpirationRoot: Field,
                initialResultRoot: Field,
                initialActionState: Field
            ): UpdateRequestOutput {
                return new UpdateRequestOutput({
                    initialRequestCounter: initialRequestCounter,
                    initialKeyIndexRoot: initialKeyIndexRoot,
                    initialTaskIdRoot: initialTaskIdRoot,
                    initialAccumulationRoot: initialAccumulationRoot,
                    initialExpirationRoot: initialExpirationRoot,
                    initialResultRoot: initialResultRoot,
                    initialActionState: initialActionState,
                    nextRequestCounter: initialRequestCounter,
                    nextKeyIndexRoot: initialKeyIndexRoot,
                    nextTaskIdRoot: initialTaskIdRoot,
                    nextAccumulationRoot: initialAccumulationRoot,
                    nextExpirationRoot: initialExpirationRoot,
                    nextResultRoot: initialResultRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        initialize: {
            privateInputs: [
                SelfProof<UpdateRequestInput, UpdateRequestOutput>,
                Level1Witness,
                Level1Witness,
                Level1Witness,
                Level1Witness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                keyIndexWitness: Level1Witness,
                taskIdWitness: Level1Witness,
                accumulationWitness: Level1Witness,
                expirationWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.requestId.assertEquals(
                    Field(-1),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Calculate request ID
                let requestId = earlierProof.publicOutput.nextRequestCounter;

                // Verify empty key index
                earlierProof.publicOutput.nextKeyIndexRoot.assertEquals(
                    keyIndexWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.KEY_INDEX_ROOT
                    )
                );
                requestId.assertEquals(
                    keyIndexWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.KEY_INDEX_INDEX
                    )
                );

                // Verify empty task Id
                earlierProof.publicOutput.nextTaskIdRoot.assertEquals(
                    taskIdWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.TASK_ID_ROOT
                    )
                );
                requestId.assertEquals(
                    taskIdWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.TASK_ID_INDEX
                    )
                );

                // Verify empty accumulation data
                earlierProof.publicOutput.nextAccumulationRoot.assertEquals(
                    accumulationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                requestId.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.ACCUMULATION_INDEX_L1
                    )
                );

                // Verify empty expiration timestamp
                earlierProof.publicOutput.nextExpirationRoot.assertEquals(
                    expirationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_EXP_ROOT
                    )
                );
                requestId.assertEquals(
                    expirationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_EXP_INDEX
                    )
                );

                // Calculate new state values
                let nextRequestCounter = requestId.add(1);
                let nextKeyIndexRoot = keyIndexWitness.calculateRoot(
                    input.keyIndex
                );
                let nextTaskIdRoot = taskIdWitness.calculateRoot(
                    Poseidon.hash(input.taskId.toFields())
                );
                let nextAccumulatedRoot = accumulationWitness.calculateRoot(
                    input.accumulationRoot
                );
                let nextExpirationRoot = expirationWitness.calculateRoot(
                    Poseidon.hash(input.expirationTimestamp.toFields())
                );

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return new UpdateRequestOutput({
                    initialRequestCounter:
                        earlierProof.publicOutput.initialRequestCounter,
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialTaskIdRoot:
                        earlierProof.publicOutput.initialTaskIdRoot,
                    initialAccumulationRoot:
                        earlierProof.publicOutput.initialAccumulationRoot,
                    initialExpirationRoot:
                        earlierProof.publicOutput.initialExpirationRoot,
                    initialResultRoot:
                        earlierProof.publicOutput.initialResultRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextRequestCounter: nextRequestCounter,
                    nextKeyIndexRoot: nextKeyIndexRoot,
                    nextTaskIdRoot: nextTaskIdRoot,
                    nextAccumulationRoot: nextAccumulatedRoot,
                    nextExpirationRoot: nextExpirationRoot,
                    nextResultRoot: earlierProof.publicOutput.initialResultRoot,
                    nextActionState: nextActionState,
                });
            },
        },
        resolve: {
            privateInputs: [
                SelfProof<UpdateRequestInput, UpdateRequestOutput>,
                Level1Witness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                resultWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.requestId.assertNotEquals(
                    Field(-1),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Verify empty result
                earlierProof.publicOutput.nextResultRoot.assertEquals(
                    resultWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.resolve.name,
                        ErrorEnum.REQUEST_RESULT_ROOT
                    )
                );
                input.requestId.assertEquals(
                    resultWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.resolve.name,
                        ErrorEnum.REQUEST_RESULT_INDEX_L1
                    )
                );

                // Calculate new state values
                let nextResultRoot = resultWitness.calculateRoot(
                    input.resultRoot
                );

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return new UpdateRequestOutput({
                    initialRequestCounter:
                        earlierProof.publicOutput.initialRequestCounter,
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialTaskIdRoot:
                        earlierProof.publicOutput.initialTaskIdRoot,
                    initialAccumulationRoot:
                        earlierProof.publicOutput.initialAccumulationRoot,
                    initialExpirationRoot:
                        earlierProof.publicOutput.initialExpirationRoot,
                    initialResultRoot:
                        earlierProof.publicOutput.initialResultRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextRequestCounter:
                        earlierProof.publicOutput.nextRequestCounter,
                    nextKeyIndexRoot:
                        earlierProof.publicOutput.nextKeyIndexRoot,
                    nextTaskIdRoot: earlierProof.publicOutput.nextTaskIdRoot,
                    nextAccumulationRoot:
                        earlierProof.publicOutput.nextAccumulationRoot,
                    nextExpirationRoot:
                        earlierProof.publicOutput.nextExpirationRoot,
                    nextResultRoot: nextResultRoot,
                    nextActionState: nextActionState,
                });
            },
        },
    },
});

class UpdateRequestProof extends ZkProgram.Proof(UpdateRequest) {}

class RequestContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description Number of initialized requests
     */
    @state(Field) requestCounter = State<Field>();

    /**
     * @description MT storing corresponding keys
     */
    @state(Field) keyIndexRoot = State<Field>();

    /**
     * @description MT storing global taskId = Hash(requester | taskId)
     */
    @state(Field) taskIdRoot = State<Field>();

    /**
     * @description MT storing accumulated value
     * Hash(accumulated R MT root | accumulated M MT root | dimension)
     */
    @state(Field) accumulationRoot = State<Field>();

    /**
     * @description MT storing requests' expiration time = Hash(start | end)
     */
    @state(Field) expirationRoot = State<Field>();

    /**
     * @description MT storing result values
     */
    @state(Field) resultRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: Action });

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.requestCounter.set(Field(0));
        this.keyIndexRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.taskIdRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.expirationRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.resultRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Initialize a threshold decryption request
     * @param committeeId Committee Id
     * @param keyIndex Unique key index
     * @param taskId Request's unique taskId
     * @param accumulationRoot Accumulation data MT root Hash(R | M)
     * @param dimension Encryption vectors' dimension
     * @param expirationPeriod Waiting period before the expiration of unresolved request
     */
    @method initialize(
        taskId: Field,
        keyIndex: Field,
        requester: PublicKey,
        accumulationRoot: Field,
        dimension: UInt8,
        expirationPeriod: UInt64
    ) {
        // Verify caller
        Utils.requireCaller(requester, this);

        // Create and dispatch action
        let action = new Action({
            requestId: Field(-1),
            keyIndex: keyIndex,
            taskId: Poseidon.hash([requester.toFields(), taskId].flat()),
            expirationTimestamp: this.network.timestamp
                .getAndRequireEquals()
                .add(expirationPeriod),
            dimension,
            accumulationRoot,
            resultRoot: Field(0),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Resolve a request and update result
     * @param proof Verification proof
     * @param expirationTimestamp Timestamp for the expiration of the request
     * @param accumulationRoot Accumulation data MT root
     * @param responseRoot Response data MT root
     * @param resultRoot Decryption result MT root
     * @param expirationWitness Witness for proof of expiration timestamp
     * @param accumulationWitness Witness for proof of accumulation data
     * @param responseWitness Witness for proof of response data
     * @param resultWitness Witness for proof of result
     * @param response Reference to Response Contract
     */
    @method resolve(
        proof: ComputeResultProof,
        expirationTimestamp: UInt64,
        accumulationRootR: Field,
        expirationWitness: Level1Witness,
        accumulationWitness: Level1Witness,
        responseWitness: Level1Witness,
        resultWitness: Level1Witness,
        response: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        let requestId = accumulationWitness.calculateIndex();

        // Verify Response Contract address
        verifyZkApp(
            RequestContract.name,
            response,
            zkAppRoot,
            Field(ZkAppEnum.RESPONSE)
        );
        const responseContract = new ResponseContract(response.address);

        // Verify Compute Result proof
        proof.verify();
        let dimension = proof.publicOutput.counter;
        let accumulationRootM = proof.publicOutput.accumulationRootM;

        // Verify request status
        this.verifyRequestStatus(
            requestId,
            Field(RequestStatus.INITIALIZED),
            expirationTimestamp,
            expirationWitness,
            resultWitness
        );

        // Verify accumulation data

        this.verifyAccumulationData(
            requestId,
            accumulationRootR,
            accumulationRootM,
            dimension,
            accumulationWitness
        );

        // Verify response value
        // responseContract.verifyFinalizedD(
        //     requestId,
        //     finalizedD,
        //     finalizedDWitness
        // );

        // Create and dispatch action
        let action = new Action({
            requestId,
            keyIndex: Field(0),
            taskId: Field(0),
            expirationTimestamp: UInt64.zero,
            dimension: UInt8.from(0),
            accumulationRoot: Field(0),
            resultRoot: proof.publicOutput.resultRoot,
        });
        this.reducer.dispatch(action);
    }

    /**
     * Update requests by rollup to the latest actions
     * @param proof Verification proof
     */
    @method update(proof: UpdateRequestProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let requestCounter = this.requestCounter.getAndRequireEquals();
        let keyIndexRoot = this.keyIndexRoot.getAndRequireEquals();
        let taskIdRoot = this.taskIdRoot.getAndRequireEquals();
        let accumulationRoot = this.accumulationRoot.getAndRequireEquals();
        let expirationRoot = this.expirationRoot.getAndRequireEquals();
        let resultRoot = this.resultRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        rollup(
            RequestContract.name,
            proof.publicOutput,
            curActionState,
            lastActionState
        );
        proof.publicOutput.initialRequestCounter.assertEquals(
            requestCounter,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.REQUEST_COUNTER
            )
        );
        proof.publicOutput.initialKeyIndexRoot.assertEquals(
            keyIndexRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.KEY_INDEX_ROOT
            )
        );
        proof.publicOutput.initialTaskIdRoot.assertEquals(
            taskIdRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.TASK_ID_ROOT
            )
        );
        proof.publicOutput.initialAccumulationRoot.assertEquals(
            accumulationRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.ACCUMULATION_ROOT
            )
        );
        proof.publicOutput.initialExpirationRoot.assertEquals(
            expirationRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.REQUEST_EXP_ROOT
            )
        );
        proof.publicOutput.initialResultRoot.assertEquals(
            resultRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.REQUEST_RESULT_ROOT
            )
        );

        // Update state values
        this.requestCounter.set(proof.publicOutput.nextRequestCounter);
        this.keyIndexRoot.set(proof.publicOutput.nextKeyIndexRoot);
        this.taskIdRoot.set(proof.publicOutput.nextTaskIdRoot);
        this.accumulationRoot.set(proof.publicOutput.nextAccumulationRoot);
        this.expirationRoot.set(proof.publicOutput.nextExpirationRoot);
        this.resultRoot.set(proof.publicOutput.nextResultRoot);
        this.actionState.set(proof.publicOutput.nextActionState);
    }

    @method refund(requestId: Field, receiver: PublicKey) {
        // Refund fee
        this.send({ to: receiver, amount: UInt64.from(REQUEST_FEE) });
    }

    @method claimFee(requestId: Field, receiver: PublicKey) {
        // Send shared fee
        // @todo Consider between this.sender or requester
        this.send({ to: receiver, amount: UInt64.from(REQUEST_FEE) });
    }

    /**
     * Verify request's key index
     * @param requestId Request Id
     * @param keyIndex Corresponding key index
     * @param witness Witness for proof of key index value
     */
    verifyKeyIndex(requestId: Field, keyIndex: Field, witness: Level1Witness) {
        this.keyIndexRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(keyIndex),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyKeyIndex.name,
                    ErrorEnum.KEY_INDEX_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyKeyIndex.name,
                ErrorEnum.KEY_INDEX_INDEX
            )
        );
    }

    /**
     * Verify requester's address
     * @param requestId Request Id
     * @param address Requester's address
     * @param taskId Requester's taskId
     * @param witness Witness for proof of requester's address
     */
    verifyTaskId(
        requestId: Field,
        address: PublicKey,
        taskId: Field,
        witness: Level1Witness
    ) {
        this.taskIdRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash([address.toFields(), taskId].flat())
                ),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyTaskId.name,
                    ErrorEnum.TASK_ID_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyTaskId.name,
                ErrorEnum.TASK_ID_INDEX
            )
        );
    }

    /**
     * Get request's current status
     * @param requestId Request Id
     * @param expirationTimestamp Timestamp for the expiration of the request
     * @param expirationWitness Witness for proof of expiration timestamp
     * @param resultWitness Witness for proof of result
     * @returns
     */
    getRequestStatus(
        requestId: Field,
        expirationTimestamp: UInt64,
        expirationWitness: Level1Witness,
        resultWitness: Level1Witness
    ): Field {
        let isResolved = this.resultRoot
            .getAndRequireEquals()
            .equals(resultWitness.calculateRoot(Field(0)))
            .not();
        requestId.assertEquals(
            resultWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.getRequestStatus.name,
                ErrorEnum.REQUEST_RESULT_INDEX_L1
            )
        );
        let isExpired = this.expirationRoot
            .getAndRequireEquals()
            .equals(
                expirationWitness.calculateRoot(
                    Poseidon.hash(expirationTimestamp.toFields())
                )
            )
            .and(
                this.network.timestamp
                    .getAndRequireEquals()
                    .greaterThan(expirationTimestamp)
            );
        requestId.assertEquals(
            expirationWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.getRequestStatus.name,
                ErrorEnum.REQUEST_EXP_INDEX
            )
        );

        return Provable.switch(
            [
                isResolved.or(isExpired).not(),
                isResolved,
                isResolved.not().and(isExpired),
            ],
            Field,
            [
                Field(RequestStatus.INITIALIZED),
                Field(RequestStatus.RESOLVED),
                Field(RequestStatus.EXPIRED),
            ]
        );
    }

    /**
     * Verify request's status
     * @param requestId Request Id
     * @param status Expected status
     * @param expirationTimestamp Timestamp for the expiration of the request
     * @param expirationWitness Witness for proof of expiration timestamp
     * @param resultWitness Witness for proof of result
     */
    verifyRequestStatus(
        requestId: Field,
        status: Field,
        expirationTimestamp: UInt64,
        expirationWitness: Level1Witness,
        resultWitness: Level1Witness
    ) {
        status.assertEquals(
            this.getRequestStatus(
                requestId,
                expirationTimestamp,
                resultWitness,
                expirationWitness
            )
        );
    }

    /**
     * Verify accumulation data
     * @param requestId Request Id
     * @param accumulatedRRoot Accumulated R MT root
     * @param accumulatedMRoot Accumulated M MT root
     * @param witness Witness for proof of accumulation data
     */
    verifyAccumulationData(
        requestId: Field,
        accumulationRootR: Field,
        accumulationRootM: Field,
        dimension: UInt8,
        witness: Level1Witness
    ) {
        this.accumulationRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash([
                        accumulationRootR,
                        accumulationRootM,
                        dimension.value,
                    ])
                ),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyAccumulationData.name,
                    ErrorEnum.ACCUMULATION_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyAccumulationData.name,
                ErrorEnum.ACCUMULATION_INDEX_L1
            )
        );
    }
}
