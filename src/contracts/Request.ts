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
    AccountUpdate,
    UInt64,
    ZkProgram,
    PrivateKey,
} from 'o1js';
import { ActionMask as _ActionMask, Utils } from '@auxo-dev/auxo-libs';
import { RequestVector } from '../libs/Requester.js';
import {
    REQUEST_FEE,
    REQUEST_MIN_PERIOD,
    ZkAppEnum,
    ZkProgramEnum,
} from '../constants.js';
import { ErrorEnum } from './constants.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import { calculateKeyIndex } from '../storages/DKGStorage.js';
import {
    EMPTY_LEVEL_1_TREE,
    Level1Witness,
} from '../storages/RequestStorage.js';
import { ResponseContract } from './Response.js';
import { processAction } from './Rollup.js';

export const enum RequestStatus {
    EMPTY,
    INITIALIZED,
    FINALIZED,
    RESOLVED,
    ABORTED,
}

export const enum ActionEnum {
    INITIALIZE,
    FINALIZE,
    RESOLVE,
    ABORT,
    __LENGTH,
}

export class ActionMask extends _ActionMask(ActionEnum.__LENGTH) {}

export class Action extends Struct({
    keyIndex: Field,
    requestId: Field,
    requester: PublicKey,
    startTimestamp: UInt64,
    endTimestamp: UInt64,
    accumulatedR: RequestVector,
    accumulatedM: RequestVector,
    type: ActionMask,
}) {
    static empty(): Action {
        return new Action({
            keyIndex: Field(0),
            requestId: Field(0),
            requester: PublicKey.fromPrivateKey(PrivateKey.random()),
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            accumulatedR: new RequestVector(),
            accumulatedM: new RequestVector(),
            type: ActionMask.empty(),
        });
    }
    static fromFields(input: Field[]): Action {
        return super.fromFields(input) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

export class UpdateRequestInput extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class UpdateRequestOutput extends Struct({
    initialRequestCounter: Field,
    initialKeyIndexRoot: Field,
    initialRequesterRoot: Field,
    initialStatusRoot: Field,
    initialPeriodRoot: Field,
    initialAccumulationRoot: Field,
    initialProcessRoot: Field,
    nextRequestCounter: Field,
    nextKeyIndexRoot: Field,
    nextRequesterRoot: Field,
    nextStatusRoot: Field,
    nextPeriodRoot: Field,
    nextAccumulationRoot: Field,
    nextProcessRoot: Field,
    rollupRoot: Field,
}) {}

export const UpdateRequest = ZkProgram({
    name: ZkProgramEnum.UpdateRequest,
    publicInput: UpdateRequestInput,
    publicOutput: UpdateRequestOutput,
    methods: {
        init: {
            privateInputs: [
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
            ],
            method(
                input: UpdateRequestInput,
                initialRequestCounter: Field,
                initialKeyIndexRoot: Field,
                initialRequesterRoot: Field,
                initialStatusRoot: Field,
                initialPeriodRoot: Field,
                initialAccumulationRoot: Field,
                initialProcessRoot: Field,
                rollupRoot: Field
            ): UpdateRequestOutput {
                return new UpdateRequestOutput({
                    initialRequestCounter: initialRequestCounter,
                    initialKeyIndexRoot: initialKeyIndexRoot,
                    initialRequesterRoot: initialRequesterRoot,
                    initialStatusRoot: initialStatusRoot,
                    initialPeriodRoot: initialPeriodRoot,
                    initialAccumulationRoot: initialAccumulationRoot,
                    initialProcessRoot: initialProcessRoot,
                    nextRequestCounter: initialRequestCounter,
                    nextKeyIndexRoot: initialKeyIndexRoot,
                    nextRequesterRoot: initialRequesterRoot,
                    nextStatusRoot: initialStatusRoot,
                    nextPeriodRoot: initialPeriodRoot,
                    nextAccumulationRoot: initialAccumulationRoot,
                    nextProcessRoot: initialProcessRoot,
                    rollupRoot: rollupRoot,
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
                ActionWitness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                keyIndexWitness: Level1Witness,
                requesterWitness: Level1Witness,
                statusWitness: Level1Witness,
                periodWitness: Level1Witness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.action.type
                    .get(Field(ActionEnum.INITIALIZE))
                    .assertTrue(
                        Utils.buildAssertMessage(
                            UpdateRequest.name,
                            UpdateRequest.initialize.name,
                            ErrorEnum.ACTION_TYPE
                        )
                    );

                // Calculate request ID
                let requestId = earlierProof.publicOutput.nextRequestCounter;

                // Verify key index
                earlierProof.publicOutput.nextKeyIndexRoot.assertEquals(
                    keyIndexWitness.calculateRoot(input.action.keyIndex),
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

                // Verify empty request status
                earlierProof.publicOutput.nextStatusRoot.assertEquals(
                    statusWitness.calculateRoot(Field(RequestStatus.EMPTY)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_ROOT
                    )
                );
                requestId.assertEquals(
                    statusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_INDEX
                    )
                );

                // Verify empty request period
                earlierProof.publicOutput.nextPeriodRoot.assertEquals(
                    periodWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_PERIOD_ROOT
                    )
                );
                requestId.assertEquals(
                    periodWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_PERIOD_INDEX
                    )
                );

                // Calculate new state values
                let nextRequestCounter = requestId.add(1);
                let nextKeyIndexRoot = keyIndexWitness.calculateRoot(
                    input.action.keyIndex
                );
                let nextRequesterRoot = keyIndexWitness.calculateRoot(
                    Poseidon.hash(input.action.requester.toFields())
                );
                let nextStatusRoot = statusWitness.calculateRoot(
                    Field(RequestStatus.INITIALIZED)
                );
                let nextPeriodRoot = periodWitness.calculateRoot(
                    Poseidon.hash(
                        [
                            input.action.startTimestamp.toFields(),
                            input.action.endTimestamp.toFields(),
                        ].flat()
                    )
                );

                // Calculate corresponding action state
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                // Verify the action is rolluped
                // verifyRollup(UpdateRequest.name);

                // Verify the action isn't already processed
                let nextProcessRoot = processAction(
                    UpdateRequest.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new UpdateRequestOutput({
                    initialRequestCounter:
                        earlierProof.publicOutput.initialRequestCounter,
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
                    initialStatusRoot:
                        earlierProof.publicOutput.initialStatusRoot,
                    initialPeriodRoot:
                        earlierProof.publicOutput.initialPeriodRoot,
                    initialAccumulationRoot:
                        earlierProof.publicOutput.initialAccumulationRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextRequestCounter: nextRequestCounter,
                    nextKeyIndexRoot: nextKeyIndexRoot,
                    nextRequesterRoot: nextRequesterRoot,
                    nextStatusRoot: nextStatusRoot,
                    nextPeriodRoot: nextPeriodRoot,
                    nextAccumulationRoot:
                        earlierProof.publicOutput.nextAccumulationRoot,
                    nextProcessRoot: nextProcessRoot,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
                });
            },
        },
        abort: {
            privateInputs: [
                SelfProof<UpdateRequestInput, UpdateRequestOutput>,
                Level1Witness,
                ActionWitness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                statusWitness: Level1Witness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.action.type
                    .get(Field(ActionEnum.ABORT))
                    .assertTrue(
                        Utils.buildAssertMessage(
                            UpdateRequest.name,
                            UpdateRequest.initialize.name,
                            ErrorEnum.ACTION_TYPE
                        )
                    );

                // Verify request is initialized but not finalized
                earlierProof.publicOutput.nextStatusRoot.assertEquals(
                    statusWitness.calculateRoot(
                        Field(RequestStatus.INITIALIZED)
                    ),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    statusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_INDEX
                    )
                );

                // Calculate new state values
                let nextStatusRoot = statusWitness.calculateRoot(
                    Field(RequestStatus.FINALIZED)
                );

                // Calculate corresponding action state
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                // Verify the action isn't already processed
                let nextProcessRoot = processAction(
                    UpdateRequest.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new UpdateRequestOutput({
                    initialRequestCounter:
                        earlierProof.publicOutput.initialRequestCounter,
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
                    initialStatusRoot:
                        earlierProof.publicOutput.initialStatusRoot,
                    initialPeriodRoot:
                        earlierProof.publicOutput.initialPeriodRoot,
                    initialAccumulationRoot:
                        earlierProof.publicOutput.initialAccumulationRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextRequestCounter:
                        earlierProof.publicOutput.nextRequestCounter,
                    nextKeyIndexRoot:
                        earlierProof.publicOutput.nextKeyIndexRoot,
                    nextRequesterRoot:
                        earlierProof.publicOutput.nextRequesterRoot,
                    nextStatusRoot: nextStatusRoot,
                    nextPeriodRoot: earlierProof.publicOutput.nextPeriodRoot,
                    nextAccumulationRoot:
                        earlierProof.publicOutput.nextAccumulationRoot,
                    nextProcessRoot: nextProcessRoot,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
                });
            },
        },
        finalize: {
            privateInputs: [
                SelfProof<UpdateRequestInput, UpdateRequestOutput>,
                Level1Witness,
                Level1Witness,
                ActionWitness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                statusWitness: Level1Witness,
                accumulationWitness: Level1Witness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.action.type
                    .get(Field(ActionEnum.FINALIZE))
                    .assertTrue(
                        Utils.buildAssertMessage(
                            UpdateRequest.name,
                            UpdateRequest.initialize.name,
                            ErrorEnum.ACTION_TYPE
                        )
                    );

                // Verify request is initialized but not finalized
                earlierProof.publicOutput.nextStatusRoot.assertEquals(
                    statusWitness.calculateRoot(
                        Field(RequestStatus.INITIALIZED)
                    ),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    statusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_INDEX
                    )
                );

                // Verify empty accumulation value
                earlierProof.publicOutput.nextAccumulationRoot.assertEquals(
                    accumulationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.ACCUMULATION_INDEX
                    )
                );

                // Calculate new state values
                let nextStatusRoot = statusWitness.calculateRoot(
                    Field(RequestStatus.FINALIZED)
                );
                let nextAccumulatedRoot = accumulationWitness.calculateRoot(
                    Poseidon.hash([
                        input.action.accumulatedR.hash(),
                        input.action.accumulatedM.hash(),
                    ])
                );

                // Calculate corresponding action state
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                // Verify the action isn't already processed
                let nextProcessRoot = processAction(
                    UpdateRequest.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new UpdateRequestOutput({
                    initialRequestCounter:
                        earlierProof.publicOutput.initialRequestCounter,
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
                    initialStatusRoot:
                        earlierProof.publicOutput.initialStatusRoot,
                    initialPeriodRoot:
                        earlierProof.publicOutput.initialPeriodRoot,
                    initialAccumulationRoot:
                        earlierProof.publicOutput.initialAccumulationRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextRequestCounter:
                        earlierProof.publicOutput.nextRequestCounter,
                    nextKeyIndexRoot:
                        earlierProof.publicOutput.nextKeyIndexRoot,
                    nextRequesterRoot:
                        earlierProof.publicOutput.nextRequesterRoot,
                    nextStatusRoot: nextStatusRoot,
                    nextPeriodRoot: earlierProof.publicOutput.nextPeriodRoot,
                    nextAccumulationRoot: nextAccumulatedRoot,
                    nextProcessRoot: nextProcessRoot,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
                });
            },
        },
        resolve: {
            privateInputs: [
                SelfProof<UpdateRequestInput, UpdateRequestOutput>,
                Level1Witness,
                ActionWitness,
            ],
            method(
                input: UpdateRequestInput,
                earlierProof: SelfProof<
                    UpdateRequestInput,
                    UpdateRequestOutput
                >,
                statusWitness: Level1Witness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                input.action.type
                    .get(Field(ActionEnum.RESOLVE))
                    .assertTrue(
                        Utils.buildAssertMessage(
                            UpdateRequest.name,
                            UpdateRequest.initialize.name,
                            ErrorEnum.ACTION_TYPE
                        )
                    );

                // Verify request is finalized
                earlierProof.publicOutput.nextStatusRoot.assertEquals(
                    statusWitness.calculateRoot(Field(RequestStatus.FINALIZED)),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    statusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateRequest.name,
                        UpdateRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_INDEX
                    )
                );

                // Calculate new state values
                let nextStatusRoot = statusWitness.calculateRoot(
                    Field(RequestStatus.RESOLVED)
                );

                // Calculate corresponding action state
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                // Verify the action isn't already processed
                let nextProcessRoot = processAction(
                    UpdateRequest.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new UpdateRequestOutput({
                    initialRequestCounter:
                        earlierProof.publicOutput.initialRequestCounter,
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
                    initialStatusRoot:
                        earlierProof.publicOutput.initialStatusRoot,
                    initialPeriodRoot:
                        earlierProof.publicOutput.initialPeriodRoot,
                    initialAccumulationRoot:
                        earlierProof.publicOutput.initialAccumulationRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextRequestCounter:
                        earlierProof.publicOutput.nextRequestCounter,
                    nextKeyIndexRoot:
                        earlierProof.publicOutput.nextKeyIndexRoot,
                    nextRequesterRoot:
                        earlierProof.publicOutput.nextRequesterRoot,
                    nextStatusRoot: nextStatusRoot,
                    nextPeriodRoot: earlierProof.publicOutput.nextPeriodRoot,
                    nextAccumulationRoot:
                        earlierProof.publicOutput.nextAccumulationRoot,
                    nextProcessRoot: nextProcessRoot,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
                });
            },
        },
    },
});

export class UpdateRequestProof extends ZkProgram.Proof(UpdateRequest) {}

export class RequestContract extends SmartContract {
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
     * @description MT storing requests' address
     */
    @state(Field) requesterRoot = State<Field>();

    /**
     * @description MT storing requests' status
     */
    @state(Field) statusRoot = State<Field>();

    /**
     * @description MT storing requests' period
     */
    @state(Field) periodRoot = State<Field>();

    /**
     * @description MT storing accumulated R | M values
     */
    @state(Field) accumulationRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.requestCounter.set(Field(0));
        this.keyIndexRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.requesterRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.statusRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.periodRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    /**
     * Initialize a threshold homomorphic encryption request
     * @param committeeId Committee ID
     * @param keyId Committee's key ID
     * @param requester Requester's address
     * @param startTimestamp Timestamp for the start of request period
     * @param endTimestamp Timestamp for the end of request period
     * @param dkg Reference to Dkg Contract
     * @param keyStatusWitness Witness for proof of key's status
     */
    @method initialize(
        committeeId: Field,
        keyId: Field,
        requester: PublicKey,
        startTimestamp: UInt64,
        endTimestamp: UInt64
    ) {
        // Verify caller
        Utils.requireCaller(requester, this);

        // Verify timestamp configuration
        startTimestamp.assertGreaterThanOrEqual(
            this.network.timestamp.getAndRequireEquals(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.initialize.name,
                ErrorEnum.REQUEST_PERIOD
            )
        );
        startTimestamp
            .add(REQUEST_MIN_PERIOD)
            .assertLessThanOrEqual(
                endTimestamp,
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.initialize.name,
                    ErrorEnum.REQUEST_PERIOD
                )
            );

        // Create and dispatch action
        let action = new Action({
            keyIndex: calculateKeyIndex(committeeId, keyId),
            requestId: Field(0),
            requester,
            startTimestamp,
            endTimestamp,
            accumulatedR: new RequestVector(),
            accumulatedM: new RequestVector(),
            type: ActionMask.createMask(Field(ActionEnum.INITIALIZE)),
        });
        this.reducer.dispatch(action);

        // Receive fee from Tx sender
        // @todo Consider between this.sender or requester
        // @todo Migrate from constant fee to dynamic fee configurable by committees
        let _requester = AccountUpdate.createSigned(this.sender);
        _requester.send({ to: this, amount: UInt64.from(REQUEST_FEE) });
    }

    /**
     * Abort an initialized request
     * @param requestId Request ID
     * @param requester Requester's address
     * @param requesterWitness Witness for proof of requester
     * @param statusWitness Witness for proof of request's status
     */
    @method abort(requestId: Field, requester: PublicKey) {
        // Verify caller
        Utils.requireCaller(requester, this);

        // Create and dispatch action
        let action = new Action({
            keyIndex: Field(0),
            requestId,
            requester,
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            accumulatedR: new RequestVector(),
            accumulatedM: new RequestVector(),
            type: ActionMask.createMask(Field(ActionEnum.ABORT)),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Finalize a request
     * @param requestId Request ID
     * @param requester Requester's address
     * @param startTimestamp Timestamp for the start of request period
     * @param endTimestamp Timestamp for the end of request period
     * @param accumulatedR Final R value
     * @param accumulatedM Final M value
     * @param requesterWitness Witness for proof of requester
     * @param statusWitness Witness for proof of request's status
     * @param periodWitness Witness for proof of request's period
     */
    @method finalize(
        requestId: Field,
        requester: PublicKey,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        accumulatedR: RequestVector,
        accumulatedM: RequestVector,
        requesterWitness: Level1Witness,
        statusWitness: Level1Witness,
        periodWitness: Level1Witness
    ) {
        // Verify caller
        Utils.requireCaller(requester, this);

        // Verify requester
        this.verifyRequester(requestId, requester, requesterWitness);

        // Verify request status
        this.verifyRequestStatus(
            requestId,
            Field(RequestStatus.INITIALIZED),
            statusWitness
        );

        // Verify request period
        endTimestamp.assertGreaterThan(
            this.network.timestamp.getAndRequireEquals(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.finalize.name,
                ErrorEnum.REQUEST_PERIOD
            )
        );
        this.verifyRequestPeriod(
            requestId,
            startTimestamp,
            endTimestamp,
            periodWitness
        );

        // Create and dispatch action
        let action = new Action({
            keyIndex: Field(0),
            requestId,
            requester,
            startTimestamp,
            endTimestamp,
            accumulatedR,
            accumulatedM,
            type: ActionMask.createMask(Field(ActionEnum.FINALIZE)),
        });
        this.reducer.dispatch(action);
    }

    @method resolve(
        requestId: Field,
        requester: PublicKey,
        finalizedD: RequestVector,
        requesterWitness: Level1Witness,
        finalizedDWitness: Level1Witness,
        response: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Response Contract address
        verifyZkApp(
            RequestContract.name,
            response,
            zkAppRoot,
            Field(ZkAppEnum.RESPONSE)
        );
        let responseContract = new ResponseContract(response.address);

        // Verify requester
        this.verifyRequester(requestId, requester, requesterWitness);

        // Verify finalized D value
        responseContract.verifyFinalizedD(
            requestId,
            finalizedD,
            finalizedDWitness
        );

        // Create and dispatch action
        let action = new Action({
            keyIndex: Field(0),
            requestId,
            requester: requester,
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            accumulatedR: new RequestVector(),
            accumulatedM: new RequestVector(),
            type: ActionMask.createMask(Field(ActionEnum.RESOLVE)),
        });
        this.reducer.dispatch(action);
    }

    @method update(proof: UpdateRequestProof) {
        // Get current state values
        let requestCounter = this.requestCounter.getAndRequireEquals();
        let keyIndexRoot = this.keyIndexRoot.getAndRequireEquals();
        let requesterRoot = this.requesterRoot.getAndRequireEquals();
        let statusRoot = this.statusRoot.getAndRequireEquals();
        let periodRoot = this.periodRoot.getAndRequireEquals();
        let accumulationRoot = this.accumulationRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        // Verify proof
        proof.verify();
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
        proof.publicOutput.initialStatusRoot.assertEquals(
            statusRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.REQUEST_STATUS_ROOT
            )
        );
        proof.publicOutput.initialPeriodRoot.assertEquals(
            periodRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.REQUEST_PERIOD_ROOT
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
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.update.name,
                ErrorEnum.PROCESS_ROOT
            )
        );
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
                    RequestContract.prototype.verifyRequestStatus.name,
                    ErrorEnum.REQUESTER_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyRequestStatus.name,
                ErrorEnum.REQUESTER_INDEX
            )
        );
    }

    verifyRequestStatus(
        requestId: Field,
        status: Field,
        witness: Level1Witness
    ) {
        this.statusRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(status),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyRequestStatus.name,
                    ErrorEnum.REQUEST_STATUS_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyRequestStatus.name,
                ErrorEnum.REQUEST_STATUS_INDEX
            )
        );
    }

    verifyRequestPeriod(
        requestId: Field,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        witness: Level1Witness
    ) {
        this.periodRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash(
                        [
                            startTimestamp.toFields(),
                            endTimestamp.toFields(),
                        ].flat()
                    )
                ),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyRequestPeriod.name,
                    ErrorEnum.REQUEST_PERIOD_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyRequestPeriod.name,
                ErrorEnum.REQUEST_PERIOD_INDEX
            )
        );
    }
}

// export class MockResponseContract extends SmartContract {
//     @method
//     resolve(address: PublicKey, resolveInput: ResolveInput) {
//         const requestContract = new RequestContract(address);
//         requestContract.resolve(
//             new ResolveInput({
//                 requestId: resolveInput.requestId,
//                 accumulatedM: resolveInput.D,
//             })
//         );
//         requestContract.statusRoot.set(Field(0));
//     }
// }
