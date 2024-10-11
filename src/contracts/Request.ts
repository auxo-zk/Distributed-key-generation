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
    Bool,
} from 'o1js';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import { ENC_LIMITS, REQUEST_FEE } from '../constants.js';
import {
    ErrorEnum,
    EventEnum,
    ZkAppAction,
    ZkAppIndex,
    ZkProgramEnum,
} from './constants.js';
import { AddressMap, ZkAppRef } from '../storages/AddressStorage.js';
import {
    REQUEST_LEVEL_1_TREE,
    RequestLevel1Witness,
    RequestLevel2Witness,
} from '../storages/RequestStorage.js';
import { rollup } from './Rollup.js';
import { ResponseContract } from './Response.js';
import { ResultVector, calculateTaskReference } from '../libs/Requester.js';

export {
    RequestStatus,
    Action as RequestAction,
    ResultArrayEvent,
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
        task: Field,
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
            task: Field(0),
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

class ResultArrayEvent extends Struct({
    requestId: Field,
    dimensionIndex: UInt8,
    result: Scalar,
}) {}

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
    resultVector: ResultVector,
}) {}

const ComputeResult = ZkProgram({
    name: ZkProgramEnum.ComputeResult,
    publicInput: ComputeResultInput,
    publicOutput: ComputeResultOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field],
            async method(
                input: ComputeResultInput,
                accumulationRootM: Field,
                responseRootD: Field,
                resultRoot: Field
            ) {
                return new ComputeResultOutput({
                    accumulationRootM,
                    responseRootD,
                    resultRoot,
                    dimension: UInt8.from(0),
                    resultVector: new ResultVector(),
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
            async method(
                input: ComputeResultInput,
                earlierProof: SelfProof<
                    ComputeResultInput,
                    ComputeResultOutput
                >,
                accumulationWitness: typeof RequestLevel2Witness,
                responseWitness: typeof RequestLevel2Witness,
                resultWitness: typeof RequestLevel2Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify M value
                earlierProof.publicOutput.accumulationRootM.assertEquals(
                    accumulationWitness.calculateRoot(
                        Provable.if(
                            input.M.equals(Group.zero),
                            Field(0),
                            Poseidon.hash(input.M.toFields())
                        )
                    ),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        'compute',
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                earlierProof.publicOutput.dimension.value.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        'compute',
                        ErrorEnum.ACCUMULATION_INDEX_L2
                    )
                );

                // Verify empty D and result values
                earlierProof.publicOutput.responseRootD.assertEquals(
                    responseWitness.calculateRoot(
                        Poseidon.hash(input.D.toFields())
                    ),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        'compute',
                        ErrorEnum.RES_D_ROOT
                    )
                );
                earlierProof.publicOutput.dimension.value.assertEquals(
                    responseWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        'compute',
                        ErrorEnum.RES_D_INDEX_L2
                    )
                );
                earlierProof.publicOutput.resultRoot.assertEquals(
                    resultWitness.calculateRoot(
                        Poseidon.hash(
                            CustomScalar.fromScalar(input.result).toFields()
                        )
                    ),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        'compute',
                        ErrorEnum.REQUEST_RESULT_ROOT
                    )
                );
                earlierProof.publicOutput.dimension.value.assertEquals(
                    resultWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResult.name,
                        'compute',
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
                        'compute',
                        ErrorEnum.REQUEST_RESULT
                    )
                );
                let resultVector = earlierProof.publicOutput.resultVector;
                resultVector.set(
                    earlierProof.publicOutput.dimension.value,
                    input.result
                );

                return new ComputeResultOutput({
                    ...earlierProof.publicOutput,
                    dimension: earlierProof.publicOutput.dimension.add(1),
                    resultVector,
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
            async method(
                input: UpdateRequestInput,
                initialRequestCounter: Field,
                initialKeyIndexRoot: Field,
                initialTaskIdRoot: Field,
                initialAccumulationRoot: Field,
                initialExpirationRoot: Field,
                initialResultRoot: Field,
                initialActionState: Field
            ) {
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
            async method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                keyIndexWitness: typeof RequestLevel1Witness,
                taskWitness: typeof RequestLevel1Witness,
                accumulationWitness: typeof RequestLevel1Witness,
                expirationWitness: typeof RequestLevel1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.requestId.assertEquals(
                    Field(-1),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
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
                        'initialize',
                        ErrorEnum.KEY_INDEX_ROOT
                    )
                );
                requestId.assertEquals(
                    keyIndexWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
                        ErrorEnum.KEY_INDEX_INDEX
                    )
                );

                // Verify empty task Id
                earlierProof.publicOutput.nextTaskIdRoot.assertEquals(
                    taskWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
                        ErrorEnum.TASK_ID_ROOT
                    )
                );
                requestId.assertEquals(
                    taskWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
                        ErrorEnum.TASK_ID_INDEX
                    )
                );

                // Verify empty accumulation data
                earlierProof.publicOutput.nextAccumulationRoot.assertEquals(
                    accumulationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                requestId.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
                        ErrorEnum.ACCUMULATION_INDEX_L1
                    )
                );

                // Verify empty expiration timestamp
                earlierProof.publicOutput.nextExpirationRoot.assertEquals(
                    expirationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
                        ErrorEnum.REQUEST_EXP_ROOT
                    )
                );
                requestId.assertEquals(
                    expirationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'initialize',
                        ErrorEnum.REQUEST_EXP_INDEX
                    )
                );

                // Calculate new state values
                let nextRequestCounter = requestId.add(1);
                let nextKeyIndexRoot = keyIndexWitness.calculateRoot(
                    input.keyIndex
                );
                let nextTaskIdRoot = taskWitness.calculateRoot(input.task);
                let nextAccumulationRoot = accumulationWitness.calculateRoot(
                    input.accumulationRoot
                );
                let nextExpirationRoot = expirationWitness.calculateRoot(
                    input.expirationTimestamp.value
                );

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return new UpdateRequestOutput({
                    ...earlierProof.publicOutput,
                    nextRequestCounter,
                    nextKeyIndexRoot,
                    nextTaskIdRoot,
                    nextAccumulationRoot,
                    nextExpirationRoot,
                    nextActionState: nextActionState,
                });
            },
        },
        resolve: {
            privateInputs: [
                SelfProof<UpdateRequestInput, UpdateRequestOutput>,
                RequestLevel1Witness,
            ],
            async method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                resultWitness: typeof RequestLevel1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.requestId.assertNotEquals(
                    Field(-1),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'resolve',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Verify empty result
                earlierProof.publicOutput.nextResultRoot.assertEquals(
                    resultWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'resolve',
                        ErrorEnum.REQUEST_RESULT_ROOT
                    )
                );
                input.requestId.assertEquals(
                    resultWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        'resolve',
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
     * @description MT storing global task = Hash(requester | taskId)
     * @see TaskStorage for off-chain storage implementation
     */
    @state(Field) taskRoot = State<Field>();

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

    events = { [EventEnum.ResultArray]: ResultArrayEvent };

    init() {
        super.init();
        this.zkAppRoot.set(new AddressMap().addressMap.getRoot());
        this.requestCounter.set(Field(0));
        this.keyIndexRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.taskRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
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
    @method
    async initialize(
        keyIndex: Field,
        taskId: UInt32,
        expirationPeriod: UInt64,
        accumulationRoot: Field,
        requester: PublicKey
    ) {
        // Verify caller
        Utils.requireCaller(requester, this);

        // Create and dispatch action
        // FIXME - "the permutation was not constructed correctly: final value" error
        // let timestamp = this.network.timestamp.getAndRequireEquals();
        let timestamp = UInt64.from(0);
        let action = new Action({
            requestId: Field(-1),
            keyIndex: keyIndex,
            task: calculateTaskReference(requester, taskId),
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
    @method
    async resolve(
        proof: ComputeResultProof,
        expirationTimestamp: UInt64,
        accumulationRootR: Field,
        expirationWitness: typeof RequestLevel1Witness,
        accumulationWitness: typeof RequestLevel1Witness,
        responseWitness: typeof RequestLevel1Witness,
        resultWitness: typeof RequestLevel1Witness,
        response: InstanceType<typeof ZkAppRef>
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        let requestId = accumulationWitness.calculateIndex();

        // Verify Response Contract address
        AddressMap.verifyZkApp(
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

        for (let i = 0; i < ENC_LIMITS.DIMENSION; i++) {
            this.emitEvent(
                EventEnum.ResultArray,
                new ResultArrayEvent({
                    requestId,
                    dimensionIndex: UInt8.from(i),
                    result: proof.publicOutput.resultVector.get(Field(i)),
                })
            );
        }
    }

    /**
     * Update requests by rollup to the latest actions
     * @param proof Verification proof
     */
    @method
    async update(proof: UpdateRequestProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let requestCounter = this.requestCounter.getAndRequireEquals();
        let keyIndexRoot = this.keyIndexRoot.getAndRequireEquals();
        let taskRoot = this.taskRoot.getAndRequireEquals();
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
                'update',
                ErrorEnum.REQUEST_COUNTER
            )
        );
        proof.publicOutput.initialKeyIndexRoot.assertEquals(
            keyIndexRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                'update',
                ErrorEnum.KEY_INDEX_ROOT
            )
        );
        proof.publicOutput.initialTaskIdRoot.assertEquals(
            taskRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                'update',
                ErrorEnum.TASK_ID_ROOT
            )
        );
        proof.publicOutput.initialAccumulationRoot.assertEquals(
            accumulationRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                'update',
                ErrorEnum.ACCUMULATION_ROOT
            )
        );
        proof.publicOutput.initialExpirationRoot.assertEquals(
            expirationRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                'update',
                ErrorEnum.REQUEST_EXP_ROOT
            )
        );
        proof.publicOutput.initialResultRoot.assertEquals(
            resultRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                'update',
                ErrorEnum.REQUEST_RESULT_ROOT
            )
        );

        // Update state values
        this.requestCounter.set(proof.publicOutput.nextRequestCounter);
        this.keyIndexRoot.set(proof.publicOutput.nextKeyIndexRoot);
        this.taskRoot.set(proof.publicOutput.nextTaskIdRoot);
        this.accumulationRoot.set(proof.publicOutput.nextAccumulationRoot);
        this.expirationRoot.set(proof.publicOutput.nextExpirationRoot);
        this.resultRoot.set(proof.publicOutput.nextResultRoot);
        this.actionState.set(proof.publicOutput.nextActionState);
    }

    @method
    async refund(requestId: Field, receiver: PublicKey) {
        // Refund fee
        this.send({ to: receiver, amount: UInt64.from(REQUEST_FEE) });
    }

    @method
    async claimFee(requestId: Field, receiver: PublicKey) {
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
        witness: typeof RequestLevel1Witness
    ) {
        this.keyIndexRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(keyIndex),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    'verifyKeyIndex',
                    ErrorEnum.KEY_INDEX_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyKeyIndex',
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
        taskId: UInt32,
        witness: typeof RequestLevel1Witness
    ) {
        this.taskRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(calculateTaskReference(address, taskId)),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    'verifyTaskId',
                    ErrorEnum.TASK_ID_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyTaskId',
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
        expirationWitness: typeof RequestLevel1Witness,
        resultWitness: typeof RequestLevel1Witness
    ): Field {
        let isResolved = this.resultRoot
            .getAndRequireEquals()
            .equals(resultWitness.calculateRoot(Field(0)))
            .not();
        requestId.assertEquals(
            resultWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'getRequestStatus',
                ErrorEnum.REQUEST_RESULT_INDEX_L1
            )
        );
        let isExpired = Bool(false);
        // FIXME - "the permutation was not constructed correctly: final value" error
        // let isExpired = this.expirationRoot
        //     .getAndRequireEquals()
        //     .equals(expirationWitness.calculateRoot(expirationTimestamp.value));
        // .and(
        //     this.network.timestamp
        //         .getAndRequireEquals()
        //         .greaterThan(expirationTimestamp)
        // );
        requestId.assertEquals(
            expirationWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'getRequestStatus',
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
        expirationWitness: typeof RequestLevel1Witness,
        resultWitness: typeof RequestLevel1Witness
    ) {
        status.assertEquals(
            this.getRequestStatus(
                requestId,
                expirationTimestamp,
                expirationWitness,
                resultWitness
            ),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyRequestStatus',
                ErrorEnum.REQUEST_STATUS
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
        witness: typeof RequestLevel1Witness
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
                    'verifyAccumulationData',
                    ErrorEnum.ACCUMULATION_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyAccumulationData',
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
        witness: typeof RequestLevel1Witness,
        scalarWitness: typeof RequestLevel2Witness
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
                    'verifyResult',
                    ErrorEnum.REQUEST_RESULT_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyResult',
                ErrorEnum.REQUEST_RESULT_INDEX_L1
            )
        );
        dimensionIndex.value.assertEquals(
            scalarWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyResult',
                ErrorEnum.REQUEST_RESULT_INDEX_L2
            )
        );
    }
}
