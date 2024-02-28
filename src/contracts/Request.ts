/* eslint-disable @typescript-eslint/no-empty-function */
import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Bool,
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
} from 'o1js';
import { BoolDynamicArray } from '@auxo-dev/auxo-libs';
import { updateActionState } from '../libs/utils.js';
import { RequestVector } from '../libs/Requester.js';
import { REQUEST_FEE } from '../constants.js';
import { ActionMask as _ActionMask } from './Actions.js';
import { EventEnum } from './constants.js';
import { ProcessedActions } from './SharedStorage.js';

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

export class CreateRequestEvent extends Struct({
    requestId: Field,
    committeeId: Field,
    keyId: Field,
    R: RequestVector,
}) {}

export class Action extends Struct({
    requestId: Field,
    newRequester: PublicKey,
    R: RequestVector, // request value
    D: RequestVector, // resolve value
    actionType: ActionMask,
}) {
    static fromFields(input: Field[]): Action {
        return super.fromFields(input) as Action;
    }

    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }

    hashD(): Field {
        return Poseidon.hash(RequestVector.toFields(this.D));
    }
}

export class RequestInput extends Struct({
    committeeId: Field,
    keyId: Field,
    R: RequestVector,
}) {
    // using this id to check if value R is requested with keyId and committeeId
    requestId(): Field {
        return Poseidon.hash(
            [
                this.committeeId,
                this.keyId,
                this.R.length,
                this.R.toFields(),
            ].flat()
        );
    }
}

export class UnRequestInput extends Struct({
    currentRequester: PublicKey,
    requesterWitness: MerkleMapWitness, // requestId is the index of this witness
    requestStatusWitness: MerkleMapWitness, // requestId is the index of this witness
}) {}

export class ResolveInput extends Struct({
    requestId: Field,
    D: RequestVector,
}) {}

export class RollupStateOutput extends Struct({
    initialActionState: Field,
    initialRequestStatusRoot: Field,
    initialRequesterRoot: Field,
    finalActionState: Field,
    finalRequestStatusRoot: Field,
    finalRequesterRoot: Field,
}) {
    hash(): Field {
        return Poseidon.hash([
            this.initialActionState,
            this.initialRequestStatusRoot,
            this.initialRequesterRoot,
            this.finalActionState,
            this.finalRequestStatusRoot,
            this.finalRequesterRoot,
        ]);
    }
}

export const CreateRequest = ZkProgram({
    name: 'create-request',
    publicOutput: RollupStateOutput,

    methods: {
        nextStep: {
            privateInputs: [
                SelfProof<Void, RollupStateOutput>,
                Action,
                MerkleMapWitness,
                MerkleMapWitness,
                PublicKey,
            ],

            method(
                earlierProof: SelfProof<Void, RollupStateOutput>,
                input: Action,
                requestStatusWitness: MerkleMapWitness,
                // TODO: check if provide witness and value is the good idea?
                requesterWitness: MerkleMapWitness,
                onchainRequester: PublicKey
            ): RollupStateOutput {
                earlierProof.verify();

                let requestId = input.requestId;

                let currentState = Provable.switch(
                    input.actionType.values,
                    Field,
                    [
                        Field(RequestStatusEnum.NOT_YET_REQUESTED),
                        Field(RequestStatusEnum.REQUESTING),
                        Field(RequestStatusEnum.REQUESTING),
                    ]
                );

                // NOT_YET_REQUESTED + REQUEST => REQUESTING
                // REQUESTING + UNREQUEST => NOT_YET_REQUESTED
                // REQUESTING + RESOLVE => RESOLVED
                let newState = Provable.switch(input.actionType.values, Field, [
                    Field(RequestStatusEnum.REQUESTING),
                    Field(RequestStatusEnum.NOT_YET_REQUESTED),
                    input.hashD(), // hash of request vector D
                ]);

                // caculate pre request root
                let [preRequestStatusRoot, caculateRequestId] =
                    requestStatusWitness.computeRootAndKey(currentState);

                caculateRequestId.assertEquals(requestId);

                preRequestStatusRoot.assertEquals(
                    earlierProof.publicOutput.finalRequestStatusRoot
                );

                // caculate new request state root
                let [newRequestStatusRoot] =
                    requestStatusWitness.computeRootAndKey(newState);

                ////// caculate requesterWitess

                // if want to request: so the current requester must be Field(0)
                // if want to unrequest: so the current requester must be onchainRequester: hash(Publickey(requester))
                // if want to resolve: so the current requester must be onchainRequester: hash(Publickey(requester))
                let currentRequester = Provable.switch(
                    input.actionType.values,
                    Field,
                    [
                        Field(0),
                        Poseidon.hash(PublicKey.toFields(onchainRequester)),
                        Poseidon.hash(PublicKey.toFields(onchainRequester)),
                    ]
                );

                let newRequester = Provable.switch(
                    input.actionType.values,
                    Field,
                    [
                        Poseidon.hash(PublicKey.toFields(input.newRequester)), // new
                        Field(0), // new
                        Poseidon.hash(PublicKey.toFields(onchainRequester)), // remain
                    ]
                );

                let [preRequesterRoot, caculateRequestId2] =
                    requesterWitness.computeRootAndKey(currentRequester);

                caculateRequestId2.assertEquals(requestId);

                preRequesterRoot.assertEquals(
                    earlierProof.publicOutput.finalRequesterRoot
                );

                // caculate new requester root
                let [newRequesterRoot] =
                    requesterWitness.computeRootAndKey(newRequester);

                return new RollupStateOutput({
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    initialRequestStatusRoot:
                        earlierProof.publicOutput.initialRequestStatusRoot,
                    initialRequesterRoot:
                        earlierProof.publicOutput.initialRequesterRoot,
                    finalActionState: updateActionState(
                        earlierProof.publicOutput.finalActionState,
                        [Action.toFields(input)]
                    ),
                    finalRequestStatusRoot: newRequestStatusRoot,
                    finalRequesterRoot: newRequesterRoot,
                });
            },
        },

        firstStep: {
            privateInputs: [Field, Field, Field],
            method(
                initialActionState: Field,
                initialRequestStatusRoot: Field,
                initialRequesterRoot: Field
            ): RollupStateOutput {
                return new RollupStateOutput({
                    initialActionState,
                    initialRequestStatusRoot,
                    initialRequesterRoot,
                    finalActionState: initialActionState,
                    finalRequestStatusRoot: initialRequestStatusRoot,
                    finalRequesterRoot: initialRequesterRoot,
                });
            },
        },
    },
});

export class RequestProof extends ZkProgram.Proof(CreateRequest) {}

export class RequestContract extends SmartContract {
    @state(PublicKey) responseContractAddress = State<PublicKey>();
    @state(Field) requestStatusRoot = State<Field>();
    @state(Field) requesterRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.PROCESSED]: ProcessedActions,
    };

    init() {
        super.init();
        this.requestStatusRoot.set(EmptyMerkleMap.getRoot());
        this.requesterRoot.set(EmptyMerkleMap.getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    @method initialize(
        committeeId: Field,
        keyId: Field,
        requester: PublicKey
    ) {}

    @method abort(requestId: Field) {}

    @method finalize(
        requestId: Field,
        accumulatedR: RequestVector,
        accumulatedM: RequestVector
    ) {}

    @method request(requestInput: RequestInput) {
        let actionState = this.actionState.getAndRequireEquals();
        let actionType = createActionMask(Field(ActionEnum.REQUEST));

        let requestInputId = requestInput.requestId();

        let requestAction = new Action({
            requestId: requestInputId,
            newRequester: this.sender,
            R: requestInput.R, // request value
            D: RequestVector.empty(),
            actionType,
        });

        // TODO: not really able to do this, check again. If both of them send at the same block
        // checking if the request have the same id already exists within the accumulator
        let { state: exists } = this.reducer.reduce(
            this.reducer.getActions({
                fromActionState: actionState,
            }),
            Bool,
            (state: Bool, action: Action) => {
                return action.requestId.equals(requestInputId).or(state);
            },
            // initial state
            { state: Bool(false), actionState: actionState }
        );

        // if exists then don't dispatch any more
        exists.assertEquals(Bool(false));

        this.reducer.dispatch(requestAction);

        let requester = AccountUpdate.createSigned(this.sender);

        // take fee
        requester.send({ to: this, amount: UInt64.from(RequestFee) });

        this.emitEvent(
            EventEnum.CREATE_REQUEST,
            new CreateRequestEvent({
                requestId: requestInputId,
                committeeId: requestInput.committeeId,
                keyId: requestInput.keyId,
                R: requestInput.R,
            })
        );
    }

    @method cancel(unRequestInput: UnRequestInput) {
        let actionState = this.actionState.getAndRequireEquals();
        let actionType = createActionMask(Field(ActionEnum.UNREQUEST));

        // Check current state if it is requesting
        let [requestStatusRoot, requestStatusId] =
            unRequestInput.requestStatusWitness.computeRootAndKey(
                Field(RequestStatusEnum.REQUESTING)
            );
        requestStatusRoot.assertEquals(
            this.requestStatusRoot.getAndRequireEquals()
        );

        // Check requesterRoot and sender is requester
        let [requesterRoot, requesterId] =
            unRequestInput.requesterWitness.computeRootAndKey(
                Poseidon.hash(
                    PublicKey.toFields(unRequestInput.currentRequester)
                )
            );
        requesterRoot.assertEquals(this.requesterRoot.getAndRequireEquals());

        // Check bot have the same ID
        requestStatusId.assertEquals(requesterId);

        // only requester can unrequest their request
        this.sender.assertEquals(unRequestInput.currentRequester);

        let requestAction = new Action({
            requestId: requestStatusId,
            newRequester: PublicKey.empty(),
            R: RequestVector.empty(),
            D: RequestVector.empty(),
            actionType,
        });

        // checking if the request have the same id already exists within the accumulator
        let { state: exists } = this.reducer.reduce(
            this.reducer.getActions({
                fromActionState: actionState,
            }),
            Bool,
            (state: Bool, action: Action) => {
                return action.requestId.equals(requestStatusId).or(state);
            },
            // initial state
            { state: Bool(false), actionState: actionState }
        );

        // if exists then don't dispatch any more
        exists.assertEquals(Bool(false));

        this.reducer.dispatch(requestAction);

        // refund
        this.send({ to: this.sender, amount: UInt64.from(RequestFee) });
    }

    @method resolve(resolveInput: ResolveInput) {
        let actionState = this.actionState.getAndRequireEquals();

        let actionType = createActionMask(Field(ActionEnum.RESOLVE));

        // Do this so that only response contract can called function
        let responseContractAddress =
            this.responseContractAddress.getAndRequireEquals();
        let update = AccountUpdate.create(responseContractAddress);
        update.body.mayUseToken = AccountUpdate.MayUseToken.InheritFromParent;

        let resolveInputId = resolveInput.requestId;

        let requestAction = new Action({
            requestId: resolveInputId,
            newRequester: PublicKey.empty(),
            R: RequestVector.empty(),
            D: resolveInput.D,
            actionType,
        });

        // TODO: add this latter
        // // checking if the request have the same id already exists within the accumulator
        // let { state: exists } = this.reducer.reduce(
        //   this.reducer.getActions({
        //     fromActionState: actionState,
        //   }),
        //   Bool,
        //   (state: Bool, action: Action) => {
        //     return action.requestId.equals(resolveInputId).or(state);
        //   },
        //   // initial state
        //   { state: Bool(false), actionState: actionState }
        // );

        // // if exists then don't dispatch any more
        // exists.assertEquals(Bool(false));

        this.reducer.dispatch(requestAction);

        // response contract earn fee
        this.send({
            to: responseContractAddress,
            amount: UInt64.from(REQUEST_FEE),
        });
    }

    @method rollup(proof: RequestProof) {
        proof.verify();
        let actionState = this.actionState.getAndRequireEquals();
        let requestStatusRoot = this.requestStatusRoot.getAndRequireEquals();
        let requesterRoot = this.requesterRoot.getAndRequireEquals();

        actionState.assertEquals(proof.publicOutput.initialActionState);
        requestStatusRoot.assertEquals(
            proof.publicOutput.initialRequestStatusRoot
        );
        requesterRoot.assertEquals(proof.publicOutput.initialRequesterRoot);

        let lastActionState = this.account.actionState.getAndRequireEquals();
        lastActionState.assertEquals(proof.publicOutput.finalActionState);

        // update on-chain state
        this.actionState.set(proof.publicOutput.finalActionState);
        this.requestStatusRoot.set(proof.publicOutput.finalRequestStatusRoot);
        this.requesterRoot.set(proof.publicOutput.finalRequesterRoot);

        this.emitEvent(EventEnum.ACTION_REDUCED, lastActionState);
    }

    // to-do: after finished request, committee can take fee (maybe using another contract)
}

export class MockResponseContract extends SmartContract {
    @method
    resolve(address: PublicKey, resolveInput: ResolveInput) {
        const requestContract = new RequestContract(address);
        requestContract.resolve(
            new ResolveInput({
                requestId: resolveInput.requestId,
                D: resolveInput.D,
            })
        );
        requestContract.requestStatusRoot.set(Field(0));
    }
}
