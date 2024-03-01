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
    Provable,
} from 'o1js';
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
import { RequestVector } from '../libs/Requester.js';
import {
    REQUEST_FEE,
    REQUEST_MIN_PERIOD,
    ZkAppEnum,
    ZkProgramEnum,
} from '../constants.js';
import { ActionMask as _ActionMask } from './Actions.js';
import { ErrorEnum } from './constants.js';
import { EMPTY_ADDRESS_MT, ZkAppRef, verifyZkApp } from './SharedStorage.js';
import {
    Level1Witness as DkgLevel1Witness,
    calculateKeyIndex,
} from './DKGStorage.js';
import { DkgContract, KeyStatus, KeyStatusInput } from './DKG.js';
import { Level1Witness } from './RequestStorage.js';
import { ResponseContract } from './Response.js';

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

export class RollupRequestInput extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class RollupRequestOutput extends Struct({
    initialRequestCounter: Field,
    initialKeyIndexRoot: Field,
    initialRequesterRoot: Field,
    initialStatusRoot: Field,
    initialPeriodRoot: Field,
    initialAccumulationRoot: Field,
    initialActionState: Field,
    nextRequestCounter: Field,
    nextKeyIndexRoot: Field,
    nextRequesterRoot: Field,
    nextStatusRoot: Field,
    nextPeriodRoot: Field,
    nextAccumulationRoot: Field,
    nextActionState: Field,
}) {}

export const RollupRequest = ZkProgram({
    name: ZkProgramEnum.RollupRequest,
    publicInput: RollupRequestInput,
    publicOutput: RollupRequestOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field, Field, Field],
            method(
                input: RollupRequestInput,
                initialRequestCounter: Field,
                initialKeyIndexRoot: Field,
                initialRequesterRoot: Field,
                initialStatusRoot: Field,
                initialPeriodRoot: Field,
                initialAccumulationRoot: Field,
                initialActionState: Field
            ): RollupRequestOutput {
                return new RollupRequestOutput({
                    initialRequestCounter: initialRequestCounter,
                    initialKeyIndexRoot: initialKeyIndexRoot,
                    initialRequesterRoot: initialRequesterRoot,
                    initialStatusRoot: initialStatusRoot,
                    initialPeriodRoot: initialPeriodRoot,
                    initialAccumulationRoot: initialAccumulationRoot,
                    initialActionState: initialActionState,
                    nextRequestCounter: initialRequestCounter,
                    nextKeyIndexRoot: initialKeyIndexRoot,
                    nextRequesterRoot: initialRequesterRoot,
                    nextStatusRoot: initialStatusRoot,
                    nextPeriodRoot: initialPeriodRoot,
                    nextAccumulationRoot: initialAccumulationRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        initialize: {
            privateInputs: [
                SelfProof<RollupRequestInput, RollupRequestOutput>,
                Level1Witness,
                Level1Witness,
                Level1Witness,
                Level1Witness,
            ],
            method(
                input: RollupRequestInput,
                earlierProof: SelfProof<
                    RollupRequestInput,
                    RollupRequestOutput
                >,
                keyIndexWitness: Level1Witness,
                requesterWitness: Level1Witness,
                statusWitness: Level1Witness,
                periodWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Calculate request ID
                let requestId = earlierProof.publicOutput.nextRequestCounter;

                // Verify key index
                earlierProof.publicOutput.nextKeyIndexRoot.assertEquals(
                    keyIndexWitness.calculateRoot(input.action.keyIndex),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.KEY_INDEX_ROOT
                    )
                );
                requestId.assertEquals(
                    keyIndexWitness.calculateIndex(),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.KEY_INDEX_INDEX
                    )
                );

                // Verify empty requester
                earlierProof.publicOutput.nextRequesterRoot.assertEquals(
                    requesterWitness.calculateRoot(Field(0)),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUESTER_ROOT
                    )
                );
                requestId.assertEquals(
                    requesterWitness.calculateIndex(),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUESTER_INDEX
                    )
                );

                // Verify request status
                input.action.type
                    .get(Field(ActionEnum.INITIALIZE))
                    .assertTrue(
                        buildAssertMessage(
                            RollupRequest.name,
                            RollupRequest.initialize.name,
                            ErrorEnum.ACTION_TYPE
                        )
                    );
                earlierProof.publicOutput.nextStatusRoot.assertEquals(
                    statusWitness.calculateRoot(Field(RequestStatus.EMPTY)),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_ROOT
                    )
                );
                requestId.assertEquals(
                    statusWitness.calculateIndex(),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_INDEX
                    )
                );

                // Verify request period
                earlierProof.publicOutput.nextPeriodRoot.assertEquals(
                    periodWitness.calculateRoot(Field(0)),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_PERIOD_ROOT
                    )
                );
                requestId.assertEquals(
                    periodWitness.calculateIndex(),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
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
                let nextActionState = updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                return new RollupRequestOutput({
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
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextRequestCounter: nextRequestCounter,
                    nextKeyIndexRoot: nextKeyIndexRoot,
                    nextRequesterRoot: nextRequesterRoot,
                    nextStatusRoot: nextStatusRoot,
                    nextPeriodRoot: nextPeriodRoot,
                    nextAccumulationRoot:
                        earlierProof.publicOutput.nextAccumulationRoot,
                    nextActionState: nextActionState,
                });
            },
        },
        abort: {
            privateInputs: [
                SelfProof<RollupRequestInput, RollupRequestOutput>,
                Level1Witness,
            ],
            method(
                input: RollupRequestInput,
                earlierProof: SelfProof<
                    RollupRequestInput,
                    RollupRequestOutput
                >,
                statusWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify request status
                input.action.type
                    .get(Field(ActionEnum.ABORT))
                    .assertTrue(
                        buildAssertMessage(
                            RollupRequest.name,
                            RollupRequest.initialize.name,
                            ErrorEnum.ACTION_TYPE
                        )
                    );
                earlierProof.publicOutput.nextStatusRoot.assertEquals(
                    statusWitness.calculateRoot(
                        Field(RequestStatus.INITIALIZED)
                    ),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    statusWitness.calculateIndex(),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_INDEX
                    )
                );

                // Calculate new state values
                let nextStatusRoot = statusWitness.calculateRoot(
                    Field(RequestStatus.INITIALIZED)
                );
                let nextActionState = updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                return new RollupRequestOutput({
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
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
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
                    nextActionState: nextActionState,
                });
            },
        },
    },
});

export class RequestProof extends ZkProgram.Proof(RollupRequest) {}

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
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: Action });

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.requestCounter.set(Field(0));
        this.keyIndexRoot.set(Field(0));
        this.requesterRoot.set(Field(0));
        this.statusRoot.set(Field(0));
        this.periodRoot.set(Field(0));
        this.accumulationRoot.set(Field(0));
        this.actionState.set(Reducer.initialActionState);
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
        endTimestamp: UInt64,
        dkg: ZkAppRef,
        keyStatusWitness: DkgLevel1Witness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Dkg Contract address
        verifyZkApp(RequestContract.name, dkg, zkAppRoot, Field(ZkAppEnum.DKG));
        const dkgContract = new DkgContract(dkg.address);

        // Verify timestamp configuration
        startTimestamp.assertGreaterThanOrEqual(
            this.network.timestamp.getAndRequireEquals(),
            buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.initialize.name,
                ErrorEnum.REQUEST_PERIOD
            )
        );
        startTimestamp
            .add(REQUEST_MIN_PERIOD)
            .assertLessThanOrEqual(
                endTimestamp,
                buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.initialize.name,
                    ErrorEnum.REQUEST_PERIOD
                )
            );

        // Verify key status
        dkgContract.verifyKeyStatus(
            new KeyStatusInput({
                committeeId: committeeId,
                keyId: keyId,
                status: Field(KeyStatus.ACTIVE),
                witness: keyStatusWitness,
            })
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
        // TODO: Consider between this.sender or requester
        // TODO: Migrate from constant fee to dynamic fee configurable by committees
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
    @method abort(
        requestId: Field,
        requester: PublicKey,
        requesterWitness: Level1Witness,
        statusWitness: Level1Witness
    ) {
        // Verify requester
        this.verifyRequester(requestId, requester, requesterWitness);

        // Verify request status
        this.verifyRequestStatus(
            requestId,
            Field(RequestStatus.INITIALIZED),
            statusWitness
        );

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
            buildAssertMessage(
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
        finalizedD: RequestVector,
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

        // Verify finalized D value

        // Create and dispatch action
        let action = new Action({
            keyIndex: Field(0),
            requestId,
            requester: PublicKey.fromPrivateKey(PrivateKey.random()),
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            accumulatedR: new RequestVector(),
            accumulatedM: new RequestVector(),
            type: ActionMask.createMask(Field(ActionEnum.RESOLVE)),
        });
        this.reducer.dispatch(action);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    @method rollup() {}

    @method refund(requestId: Field, receiver: PublicKey) {
        // Refund fee
        this.send({ to: receiver, amount: UInt64.from(REQUEST_FEE) });
    }

    @method claimFee(requestId: Field, receiver: PublicKey) {
        // Send shared fee
        // TODO: Consider between this.sender or requester
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
                buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyRequestStatus.name,
                    ErrorEnum.REQUESTER_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            buildAssertMessage(
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
                buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyRequestStatus.name,
                    ErrorEnum.REQUEST_STATUS_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            buildAssertMessage(
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
                buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyRequestPeriod.name,
                    ErrorEnum.REQUEST_PERIOD_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            buildAssertMessage(
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
