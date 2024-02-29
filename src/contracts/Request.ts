import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Reducer,
    MerkleMapWitness,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    AccountUpdate,
    UInt64,
    ZkProgram,
    Void,
    PrivateKey,
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
import { ErrorEnum, EventEnum } from './constants.js';
import {
    EMPTY_ADDRESS_MT,
    ProcessedActions,
    ZkAppRef,
    verifyZkApp,
} from './SharedStorage.js';
import {
    Level1Witness as DkgLevel1Witness,
    calculateKeyIndex,
} from './DKGStorage.js';
import { DkgContract, KeyStatus, KeyStatusInput } from './DKG.js';
import { Level1Witness } from './RequestStorage.js';

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
    R: RequestVector,
    D: RequestVector,
    actionType: ActionMask,
}) {
    static empty(): Action {
        return new Action({
            keyIndex: Field(0),
            requestId: Field(0),
            requester: PublicKey.fromPrivateKey(PrivateKey.random()),
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            R: new RequestVector(),
            D: new RequestVector(),
            actionType: ActionMask.empty(),
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
    initialRequestStatusRoot: Field,
    initialRequestPeriodRoot: Field,
    nextRequestCounter: Field,
    nextKeyIndexRoot: Field,
    nextRequesterRoot: Field,
    nextRequestStatusRoot: Field,
    nextRequestPeriodRoot: Field,
}) {}

export const RollupRequest = ZkProgram({
    name: ZkProgramEnum.RollupRequest,
    publicInput: RollupRequestInput,
    publicOutput: RollupRequestOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field],
            method(
                input: RollupRequestInput,
                initialRequestCounter: Field,
                initialKeyIndexRoot: Field,
                initialRequesterRoot: Field,
                initialRequestStatusRoot: Field,
                initialRequestPeriodRoot: Field
            ): RollupRequestOutput {
                return new RollupRequestOutput({
                    initialRequestCounter: initialRequestCounter,
                    initialKeyIndexRoot: initialKeyIndexRoot,
                    initialRequesterRoot: initialRequesterRoot,
                    initialRequestStatusRoot: initialRequestStatusRoot,
                    initialRequestPeriodRoot: initialRequestPeriodRoot,
                    nextRequestCounter: initialRequestCounter,
                    nextKeyIndexRoot: initialKeyIndexRoot,
                    nextRequesterRoot: initialRequesterRoot,
                    nextRequestStatusRoot: initialRequestStatusRoot,
                    nextRequestPeriodRoot: initialRequestPeriodRoot,
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
                requestStatusWitness: Level1Witness,
                requestPeriodWitness: Level1Witness
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
                input.action.actionType
                    .get(Field(ActionEnum.INITIALIZE))
                    .assertTrue(
                        buildAssertMessage(
                            RollupRequest.name,
                            RollupRequest.initialize.name,
                            ErrorEnum.ACTION_TYPE
                        )
                    );
                earlierProof.publicOutput.nextRequestStatusRoot.assertEquals(
                    requestStatusWitness.calculateRoot(
                        Field(RequestStatus.EMPTY)
                    ),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_ROOT
                    )
                );
                requestId.assertEquals(
                    requestStatusWitness.calculateIndex(),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_STATUS_INDEX
                    )
                );

                // Verify request period
                earlierProof.publicOutput.nextRequestPeriodRoot.assertEquals(
                    requestPeriodWitness.calculateRoot(Field(0)),
                    buildAssertMessage(
                        RollupRequest.name,
                        RollupRequest.initialize.name,
                        ErrorEnum.REQUEST_PERIOD_ROOT
                    )
                );
                requestId.assertEquals(
                    requestPeriodWitness.calculateIndex(),
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
                let nextRequestStatusRoot = requestStatusWitness.calculateRoot(
                    Field(RequestStatus.INITIALIZED)
                );
                let nextRequestPeriodRoot = requestPeriodWitness.calculateRoot(
                    Poseidon.hash(
                        [
                            input.action.startTimestamp.toFields(),
                            input.action.endTimestamp.toFields(),
                        ].flat()
                    )
                );

                return new RollupRequestOutput({
                    initialRequestCounter:
                        earlierProof.publicOutput.initialRequestCounter,
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
                    initialRequestStatusRoot:
                        earlierProof.publicOutput.initialRequestStatusRoot,
                    initialRequestPeriodRoot:
                        earlierProof.publicOutput.initialRequestPeriodRoot,
                    nextRequestCounter: nextRequestCounter,
                    nextKeyIndexRoot: nextKeyIndexRoot,
                    nextRequesterRoot: nextRequesterRoot,
                    nextRequestStatusRoot: nextRequestStatusRoot,
                    nextRequestPeriodRoot: nextRequestPeriodRoot,
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
    @state(Field) requestStatusRoot = State<Field>();

    /**
     * @description MT storing requests' period
     */
    @state(Field) requestPeriodRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.PROCESSED]: ProcessedActions,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.requestCounter.set(Field(0));
        this.keyIndexRoot.set(Field(0));
        this.requesterRoot.set(Field(0));
        this.requestStatusRoot.set(Field(0));
        this.requestPeriodRoot.set(Field(0));
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
            R: new RequestVector(),
            D: new RequestVector(),
            actionType: ActionMask.createMask(Field(ActionEnum.INITIALIZE)),
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
     * @param requestStatusWitness Witness for proof of request's status
     */
    @method abort(
        requestId: Field,
        requester: PublicKey,
        requesterWitness: Level1Witness,
        requestStatusWitness: Level1Witness
    ) {
        // Verify requester
        this.verifyRequester(requestId, requester, requesterWitness);

        // Verify request status
        this.verifyRequestStatus(
            requestId,
            Field(RequestStatus.INITIALIZED),
            requestStatusWitness
        );

        // Create and dispatch action
        let action = new Action({
            keyIndex: Field(0),
            requestId,
            requester,
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            R: new RequestVector(),
            D: new RequestVector(),
            actionType: ActionMask.createMask(Field(ActionEnum.ABORT)),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Finalize a request
     * @param requestId Request ID
     * @param requester Requester's address
     * @param startTimestamp Timestamp for the start of request period
     * @param endTimestamp Timestamp for the end of request period
     * @param R Final R value
     * @param requesterWitness Witness for proof of requester
     * @param requestStatusWitness Witness for proof of request's status
     * @param requestPeriodWitness Witness for proof of request's period
     */
    @method finalize(
        requestId: Field,
        requester: PublicKey,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        R: RequestVector,
        requesterWitness: Level1Witness,
        requestStatusWitness: Level1Witness,
        requestPeriodWitness: Level1Witness
    ) {
        // Verify requester
        this.verifyRequester(requestId, requester, requesterWitness);

        // Verify request status
        this.verifyRequestStatus(
            requestId,
            Field(RequestStatus.INITIALIZED),
            requestStatusWitness
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
            requestPeriodWitness
        );

        // Create and dispatch action
        let action = new Action({
            keyIndex: Field(0),
            requestId,
            requester,
            startTimestamp,
            endTimestamp,
            R,
            D: new RequestVector(),
            actionType: ActionMask.createMask(Field(ActionEnum.FINALIZE)),
        });
        this.reducer.dispatch(action);
    }

    @method resolve(requestId: Field, D: RequestVector, response: ZkAppRef) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Authorize Response Contract call
        verifyZkApp(
            RequestContract.Proof.name,
            response,
            zkAppRoot,
            Field(ZkAppEnum.RESPONSE)
        );
        // TODO: Need test for correctness
        let update = AccountUpdate.create(response.address);
        update.body.mayUseToken = AccountUpdate.MayUseToken.InheritFromParent;

        // Create and dispatch action
        let action = new Action({
            keyIndex: Field(0),
            requestId,
            requester: PublicKey.fromPrivateKey(PrivateKey.random()),
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            R: new RequestVector(),
            D,
            actionType: ActionMask.createMask(Field(ActionEnum.RESOLVE)),
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
        this.requestStatusRoot
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
        this.requestPeriodRoot
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
//                 D: resolveInput.D,
//             })
//         );
//         requestContract.requestStatusRoot.set(Field(0));
//     }
// }
