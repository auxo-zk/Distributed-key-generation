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
    UInt32,
} from 'o1js';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import { REQUEST_FEE } from '../constants.js';
import {
    ErrorEnum,
    ZkAppAction,
    ZkAppIndex,
    ZkProgramEnum,
} from './constants.js';
import {
    ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from '../storages/AddressStorage.js';
import {
    REQUEST_LEVEL_1_TREE,
    REQUEST_LEVEL_2_TREE,
    RequestLevel1Witness,
    RequestLevel2Witness,
} from '../storages/RequestStorage.js';
import { rollup } from './Rollup.js';
import { ResponseContract } from './Response.js';

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
    dimension: UInt8,
}) {}

const ComputeResult = ZkProgram({
    name: ZkProgramEnum.ComputeResult,
    publicInput: ComputeResultInput,
    publicOutput: ComputeResultOutput,
    methods: {
        init: {
            privateInputs: [],
            method() {
                return new ComputeResultOutput({
                    accumulationRootM: REQUEST_LEVEL_2_TREE().getRoot(),
                    responseRootD: REQUEST_LEVEL_2_TREE().getRoot(),
                    resultRoot: REQUEST_LEVEL_2_TREE().getRoot(),
                    dimension: UInt8.from(0),
                });
            },
        },
        compute: {
            privateInputs: [
                SelfProof<ComputeResultInput, ComputeResultOutput>,
                RequestLevel2Witness,
                RequestLevel2Witness,
                RequestLevel2Witness,
            ],
            method(
                input: ComputeResultInput,
                earlierProof: SelfProof<
                    ComputeResultInput,
                    ComputeResultOutput
                >,
                accumulationWitness: RequestLevel2Witness,
                responseWitness: RequestLevel2Witness,
                resultWitness: RequestLevel2Witness
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
                earlierProof.publicOutput.dimension.value.assertEquals(
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
                earlierProof.publicOutput.dimension.value.assertEquals(
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
                earlierProof.publicOutput.dimension.value.assertEquals(
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
                let resultRoot = resultWitness.calculateRoot(
                    Poseidon.hash(
                        CustomScalar.fromScalar(input.result).toFields()
                    )
                );

                return new ComputeResultOutput({
                    accumulationRootM,
                    responseRootD,
                    resultRoot,
                    dimension: earlierProof.publicOutput.dimension.add(1),
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
                RequestLevel1Witness,
                RequestLevel1Witness,
                RequestLevel1Witness,
                RequestLevel1Witness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                keyIndexWitness: RequestLevel1Witness,
                taskIdWitness: RequestLevel1Witness,
                accumulationWitness: RequestLevel1Witness,
                expirationWitness: RequestLevel1Witness
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
                RequestLevel1Witness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                resultWitness: RequestLevel1Witness
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
     * @see AddressStorage for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description Number of initialized requests
     */
    @state(Field) requestCounter = State<Field>();

    /**
     * @description MT storing corresponding keys
     * @see RequestKeyIndexStorage for off-chain storage implementation
     */
    @state(Field) keyIndexRoot = State<Field>();

    /**
     * @description MT storing global taskId = Hash(requester | taskId)
     * @see TaskIdStorage for off-chain storage implementation
     */
    @state(Field) taskIdRoot = State<Field>();

    /**
     * @description MT storing accumulation data
     * Hash(R accumulation MT root | M accumulation MT root | dimension)
     * @see RequestAccumulationStorage for off-chain storage implementation
     */
    @state(Field) accumulationRoot = State<Field>();

    /**
     * @description MT storing requests' expiration timestamp
     * @see ExpirationStorage for off-chain storage implementation
     */
    @state(Field) expirationRoot = State<Field>();

    /**
     * @description MT storing result values
     * @see ResultStorage for off-chain storage implementation
     */
    @state(Field) resultRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: Action });

    init() {
        super.init();
        this.zkAppRoot.set(ADDRESS_MT().getRoot());
        this.requestCounter.set(Field(0));
        this.keyIndexRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.taskIdRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.expirationRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.resultRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Initialize a threshold decryption request
     * @param keyIndex Unique key index
     * @param taskId Requester's taskId
     * @param expirationPeriod Waiting period before the expiration of unresolved request
     * @param accumulationRoot Accumulation data Hash(R root | M root | dimension)
     * @param requester Requester's address
     */
    @method initialize(
        keyIndex: Field,
        taskId: UInt32,
        expirationPeriod: UInt64,
        accumulationRoot: Field,
        requester: PublicKey
    ) {
        // Verify caller
        Utils.requireCaller(requester, this);

        // Create and dispatch action
        let timestamp = this.network.timestamp.getAndRequireEquals();
        let action = new Action({
            requestId: Field(-1),
            keyIndex: keyIndex,
            taskId: Poseidon.hash([requester.toFields(), taskId.value].flat()),
            expirationTimestamp: timestamp.add(expirationPeriod),
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
        expirationWitness: RequestLevel1Witness,
        accumulationWitness: RequestLevel1Witness,
        responseWitness: RequestLevel1Witness,
        resultWitness: RequestLevel1Witness,
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
            Field(ZkAppIndex.RESPONSE)
        );
        const responseContract = new ResponseContract(response.address);

        // Verify Compute Result proof
        proof.verify();
        let dimension = proof.publicOutput.dimension;
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
        responseContract.verifyResponse(
            requestId,
            proof.publicOutput.responseRootD,
            responseWitness
        );

        // Create and dispatch action
        let action = new Action({
            ...Action.empty(),
            ...{ requestId, resultRoot: proof.publicOutput.resultRoot },
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
    verifyKeyIndex(
        requestId: Field,
        keyIndex: Field,
        witness: RequestLevel1Witness
    ) {
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
        witness: RequestLevel1Witness
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
        expirationWitness: RequestLevel1Witness,
        resultWitness: RequestLevel1Witness
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
        expirationWitness: RequestLevel1Witness,
        resultWitness: RequestLevel1Witness
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
     * @param accumulatedRRoot Accumulation root of R
     * @param accumulatedMRoot Accumulation root of M
     * @param dimension Full dimension of the encryption vector
     * @param witness Witness for proof of accumulation data
     */
    verifyAccumulationData(
        requestId: Field,
        accumulationRootR: Field,
        accumulationRootM: Field,
        dimension: UInt8,
        witness: RequestLevel1Witness
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

    /**
     * Verify result value
     * @param requestId Request Id
     * @param dimensionIndex Dimension index in the full result vector
     * @param result Decrypted result value
     * @param witness Witness for proof of result vector
     * @param scalarWitness Witness for proof of result value
     */
    verifyResult(
        requestId: Field,
        dimensionIndex: UInt8,
        result: Scalar,
        witness: RequestLevel1Witness,
        scalarWitness: RequestLevel2Witness
    ) {
        this.resultRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    scalarWitness.calculateRoot(
                        Poseidon.hash(
                            CustomScalar.fromScalar(result).toFields()
                        )
                    )
                ),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyResult.name,
                    ErrorEnum.REQUEST_RESULT_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyResult.name,
                ErrorEnum.REQUEST_RESULT_INDEX_L1
            )
        );
        dimensionIndex.value.assertEquals(
            scalarWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyResult.name,
                ErrorEnum.REQUEST_RESULT_INDEX_L2
            )
        );
    }
}
