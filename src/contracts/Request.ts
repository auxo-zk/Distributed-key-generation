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
    PrivateKey,
    Provable,
    Bool,
    Group,
} from 'o1js';
import { ActionMask as _ActionMask, Utils } from '@auxo-dev/auxo-libs';
import { RequestVector, ResultVector } from '../libs/Requester.js';
import {
    REQUEST_FEE,
    REQUEST_MAX_SIZE,
    ZkAppEnum,
    ZkProgramEnum,
} from '../constants.js';
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

export {
    RequestStatus,
    Action as RequestAction,
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
        accumulatedR: RequestVector,
        accumulatedM: RequestVector,
        resultVector: ResultVector,
        expirationTimestamp: UInt64,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            requestId: Field(0),
            keyIndex: Field(0),
            taskId: Field(0),
            accumulatedR: new RequestVector(),
            accumulatedM: new RequestVector(),
            resultVector: new ResultVector(),
            expirationTimestamp: UInt64.zero,
        });
    }
    static fromFields(input: Field[]): Action {
        return super.fromFields(input) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

class UpdateRequestInput extends Action {}

class UpdateRequestOutput extends Struct({
    initialRequestCounter: Field,
    initialKeyIndexRoot: Field,
    initialRequesterRoot: Field,
    initialAccumulationRoot: Field,
    initialExpirationRoot: Field,
    initialResultRoot: Field,
    initialActionState: Field,
    nextRequestCounter: Field,
    nextKeyIndexRoot: Field,
    nextRequesterRoot: Field,
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
                initialRequesterRoot: Field,
                initialAccumulationRoot: Field,
                initialExpirationRoot: Field,
                initialResultRoot: Field,
                initialActionState: Field
            ): UpdateRequestOutput {
                return new UpdateRequestOutput({
                    initialRequestCounter: initialRequestCounter,
                    initialKeyIndexRoot: initialKeyIndexRoot,
                    initialRequesterRoot: initialRequesterRoot,
                    initialAccumulationRoot: initialAccumulationRoot,
                    initialExpirationRoot: initialExpirationRoot,
                    initialResultRoot: initialResultRoot,
                    initialActionState: initialActionState,
                    nextRequestCounter: initialRequestCounter,
                    nextKeyIndexRoot: initialKeyIndexRoot,
                    nextRequesterRoot: initialRequesterRoot,
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
                requesterWitness: Level1Witness,
                accumulationWitness: Level1Witness,
                expirationWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Calculate request ID
                let requestId = earlierProof.publicOutput.nextRequestCounter;

                // Verify key index
                earlierProof.publicOutput.nextKeyIndexRoot.assertEquals(
                    keyIndexWitness.calculateRoot(input.keyIndex),
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

                // Verify empty requester
                earlierProof.publicOutput.nextRequesterRoot.assertEquals(
                    requesterWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUESTER_ROOT
                    )
                );
                requestId.assertEquals(
                    requesterWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUESTER_INDEX
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
                        ErrorEnum.ACCUMULATION_INDEX
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
                let nextRequesterRoot = keyIndexWitness.calculateRoot(
                    Poseidon.hash(input.requester.toFields())
                );
                let nextAccumulatedRoot = accumulationWitness.calculateRoot(
                    Poseidon.hash([
                        input.accumulatedR.hash(),
                        input.accumulatedM.hash(),
                    ])
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
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
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
                    nextRequesterRoot: nextRequesterRoot,
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
                input.type
                    .get(Field(ActionEnum.RESOLVE))
                    .assertTrue(
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
                        ErrorEnum.REQUEST_RESULT_INDEX
                    )
                );

                // Calculate new state values
                let nextResultRoot = resultWitness.calculateRoot(
                    Field(RequestStatus.RESOLVED)
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
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
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
                    nextRequesterRoot:
                        earlierProof.publicOutput.nextRequesterRoot,
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
     * @description MT storing accumulated value = Hash(R | M)
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
     * @param accumulatedR Accumulated R value
     * @param accumulatedM Accumulated M value
     * @param expirationPeriod Waiting period before the expiration of unresolved request
     */
    @method initialize(
        taskId: Field,
        keyIndex: Field,
        requester: PublicKey,
        accumulatedR: RequestVector,
        accumulatedM: RequestVector,
        expirationPeriod: UInt64
    ) {
        // Verify caller
        Utils.requireCaller(requester, this);

        // Create and dispatch action
        let action = new Action({
            requestId: Field(-1),
            keyIndex: keyIndex,
            taskId: Poseidon.hash([requester.toFields(), taskId].flat()),
            accumulatedR,
            accumulatedM,
            resultVector: new ResultVector(),
            expirationTimestamp: this.network.timestamp
                .getAndRequireEquals()
                .add(expirationPeriod),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Resolve a request and update result
     * @param expirationTimestamp Timestamp for the expiration of the request
     * @param accumulatedR Accumulated R value
     * @param accumulatedM Accumulated M value
     * @param finalizedD Finalized response D value
     * @param resultVector Decrypted result vector
     * @param expirationWitness Witness for proof of expiration timestamp
     * @param accumulationWitness Witness for proof of accumulation data
     * @param finalizedDWitness Witness for proof of response data
     * @param resultWitness Witness for proof of result
     * @param response Reference to Response Contract
     */
    @method resolve(
        expirationTimestamp: UInt64,
        accumulatedR: RequestVector,
        accumulatedM: RequestVector,
        finalizedD: RequestVector,
        resultVector: ResultVector,
        expirationWitness: Level1Witness,
        accumulationWitness: Level1Witness,
        finalizedDWitness: Level1Witness,
        resultWitness: Level1Witness,
        response: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        let requestId = accumulationWitness.calculateIndex();

        // Verify caller is Response Contract
        Utils.requireCaller(response.address, this);
        verifyZkApp(
            RequestContract.name,
            response,
            zkAppRoot,
            Field(ZkAppEnum.RESPONSE)
        );
        let responseContract = new ResponseContract(response.address);

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
            accumulatedR,
            accumulatedM,
            accumulationWitness
        );

        // Verify finalized D value
        responseContract.verifyFinalizedD(
            requestId,
            finalizedD,
            finalizedDWitness
        );

        // Verify result vector
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
            let index = Field(i);
            let M = accumulatedM.get(index);
            let D = finalizedD.get(index);
            let result = resultVector.get(index);
            Provable.if(
                index.greaterThanOrEqual(finalizedD.length),
                Bool(true),
                M.sub(D).equals(Group.generator.scale(result.toScalar()))
            ).assertTrue(
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.resolve.name,
                    ErrorEnum.REQUEST_RESULT
                )
            );
        }

        // Create and dispatch action
        let action = new Action({
            requestId,
            keyIndex: Field(-1),
            taskId: Field(-1),
            accumulatedR: new RequestVector(),
            accumulatedM: new RequestVector(),
            resultVector,
            expirationTimestamp,
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
        let requesterRoot = this.requesterRoot.getAndRequireEquals();
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
        proof.publicOutput.initialRequestCounter.assertEquals(
            requesterRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.REQUESTER_ROOT
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
        this.requesterRoot.set(proof.publicOutput.nextRequesterRoot);
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
     * @param requester Requester's address
     * @param witness Witness for proof of requester's address
     */
    verifyRequester(
        requestId: Field,
        requester: PublicKey,
        witness: Level1Witness
    ) {
        this.requesterRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(Poseidon.hash(requester.toFields())),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyRequester.name,
                    ErrorEnum.REQUESTER_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyRequester.name,
                ErrorEnum.REQUESTER_INDEX
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
                ErrorEnum.REQUEST_RESULT_INDEX
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
     * @param accumulatedR Accumulated R value
     * @param accumulatedM Accumulated M value
     * @param witness Witness for proof of accumulation data
     */
    verifyAccumulationData(
        requestId: Field,
        accumulatedR: RequestVector,
        accumulatedM: RequestVector,
        witness: Level1Witness
    ) {
        this.accumulationRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash([accumulatedR.hash(), accumulatedM.hash()])
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
                ErrorEnum.ACCUMULATION_INDEX
            )
        );
    }
}
