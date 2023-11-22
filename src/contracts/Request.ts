import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  Bool,
  Reducer,
  MerkleMap,
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

import { GroupDynamicArray, BoolDynamicArray } from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import { COMMITTEE_MAX_SIZE, REQUEST_MAX_SIZE } from '../constants.js';

export const LEVEL2_TREE_HEIGHT = Math.ceil(Math.log2(COMMITTEE_MAX_SIZE)) + 1;
const EmptyMerkleMap = new MerkleMap();
export const RequestFee = Field(10 ** 9); // 1 Mina
export const ZeroFee = Field(0); // 0 Mina
export class RequestVector extends GroupDynamicArray(REQUEST_MAX_SIZE) {}

export const enum ActionEnum {
  REQUEST,
  UNREQUEST,
  RESOLVE,
  __LENGTH,
}

export const enum RequestStatusEnum {
  NOT_YET_REQUESTED,
  REQUESTING,
  // RESOLVED, this will be hash of request vector D: H(length + values)
}

export class ActionMask extends BoolDynamicArray(ActionEnum.__LENGTH) {}

export function createActionMask(action: Field): ActionMask {
  let mask = ActionMask.empty(Field(ActionEnum.__LENGTH));
  mask.set(action, Bool(true));
  return mask;
}

export class RequestAction extends Struct({
  committeeId: Field,
  keyId: Field,
  requester: PublicKey,
  R: RequestVector, // request value
  D: RequestVector, // resolve value
  actionType: ActionMask,
}) {
  static empty(): RequestAction {
    return new RequestAction({
      committeeId: Field(0),
      keyId: Field(0),
      requester: PublicKey.fromFields([Field(0), Field(0)]),
      R: RequestVector.empty(),
      D: RequestVector.empty(),
      actionType: ActionMask.empty(),
    });
  }

  static fromFields(input: Field[]): RequestAction {
    return super.fromFields(input) as RequestAction;
  }

  // using this id to check if value R is requested with keyId and committeeId
  requestId(): Field {
    return Poseidon.hash(
      [this.committeeId, this.keyId, this.R.length, this.R.toFields()].flat()
    );
  }

  hash(): Field {
    return Poseidon.hash(RequestAction.toFields(this));
  }
}

export class RequestInput extends Struct({
  committeeId: Field,
  keyId: Field,
  requester: PublicKey,
  R: RequestVector,
  actionType: Field,
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
        RequestAction,
        MerkleMapWitness,
        MerkleMapWitness,
      ],

      method(
        preProof: SelfProof<Void, RollupStateOutput>,
        input: RequestAction,
        requestStatusWitness: MerkleMapWitness,
        requesterWitness: MerkleMapWitness
      ): RollupStateOutput {
        preProof.verify();

        ////// caculate request ID
        let requestId = input.requestId();

        let currentState = Provable.switch(input.actionType.values, Field, [
          Field(RequestStatusEnum.NOT_YET_REQUESTED),
          Field(RequestStatusEnum.REQUESTING),
          Field(RequestStatusEnum.REQUESTING),
        ]);

        // NOT_YET_REQUESTED + REQUEST => REQUESTING
        // REQUESTING + UNREQUEST => NOT_YET_REQUESTED
        // REQUESTING + RESOLVE => RESOLVED
        let newState = Provable.switch(input.actionType.values, Field, [
          Field(RequestStatusEnum.REQUESTING),
          Field(RequestStatusEnum.NOT_YET_REQUESTED),
          Field(Poseidon.hash(RequestVector.toFields(input.D))), // hash of request vector D
        ]);

        // caculate pre request root
        let [preRequestStatusRoot, caculateRequestId] =
          requestStatusWitness.computeRootAndKey(currentState);

        caculateRequestId.assertEquals(requestId);

        preRequestStatusRoot.assertEquals(
          preProof.publicOutput.finalRequestStatusRoot
        );

        // caculate new request state root
        let [newRequestStatusRoot] =
          requestStatusWitness.computeRootAndKey(newState);

        ////// caculate requesterWitess

        // if want to request: so the current requester must be Field(0)
        // if want to unrequest: so the current requester must be requester: hash(Publickey(requestor))
        // if want to resolve: so the current requester must be requester: hash(Publickey(requestor))
        let currentRequester = Provable.switch(input.actionType.values, Field, [
          Field(0),
          Poseidon.hash(PublicKey.toFields(input.requester)),
          Poseidon.hash(PublicKey.toFields(input.requester)),
        ]);

        let newRequester = Provable.switch(input.actionType.values, Field, [
          Poseidon.hash(PublicKey.toFields(input.requester)),
          Field(0),
          Poseidon.hash(PublicKey.toFields(input.requester)),
        ]);

        let [preRequesterRoot, caculateRequestId2] =
          requesterWitness.computeRootAndKey(currentRequester);

        caculateRequestId2.assertEquals(requestId);

        preRequesterRoot.assertEquals(preProof.publicOutput.finalRequesterRoot);

        // caculate new requester root
        let [newRequesterRoot] =
          requesterWitness.computeRootAndKey(newRequester);

        return new RollupStateOutput({
          initialActionState: preProof.publicOutput.initialActionState,
          initialRequestStatusRoot:
            preProof.publicOutput.initialRequestStatusRoot,
          initialRequesterRoot: preProof.publicOutput.initialRequesterRoot,
          finalActionState: updateOutOfSnark(
            preProof.publicOutput.finalActionState,
            [RequestAction.toFields(input)]
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
  // requestId = hash(committeeId, keyId, hash(valueR))
  // -> state: enable to check if request the same data
  @state(Field) requestStatusRoot = State<Field>();
  // request id -> requester
  @state(Field) requesterRoot = State<Field>();
  @state(Field) actionState = State<Field>();
  @state(PublicKey) DKG_address = State<PublicKey>();

  reducer = Reducer({ actionType: RequestAction });

  init() {
    super.init();
    this.requestStatusRoot.set(EmptyMerkleMap.getRoot());
    this.requesterRoot.set(EmptyMerkleMap.getRoot());
    this.actionState.set(Reducer.initialActionState);
  }

  @method requestOrUnrequest(requestInput: RequestInput) {
    let actionState = this.actionState.getAndAssertEquals();
    requestInput.actionType.assertLessThan(ActionEnum.__LENGTH);

    let actionType = createActionMask(requestInput.actionType);

    let requestAction = new RequestAction({
      committeeId: requestInput.committeeId,
      keyId: requestInput.keyId,
      requester: requestInput.requester,
      R: requestInput.R, // request value
      D: RequestVector.empty(),
      actionType,
    });

    let requestInputId = requestAction.requestId();
    // checking if the request have the same id already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: actionState,
      }),
      Bool,
      (state: Bool, action: RequestAction) => {
        return action.requestId().equals(requestInputId).or(state);
      },
      // initial state
      { state: Bool(false), actionState: actionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    this.reducer.dispatch(requestAction);

    let requester = AccountUpdate.createSigned(requestInput.requester);

    // take fee if it is request
    let sendAmount = Provable.if(
      actionType.get(Field(ActionEnum.REQUEST)),
      RequestFee,
      ZeroFee
    );
    requester.send({ to: this, amount: UInt64.from(sendAmount) });

    // refund if it is un-request
    let refundAmount = Provable.if(
      actionType.get(Field(ActionEnum.UNREQUEST)),
      RequestFee,
      ZeroFee
    );
    this.send({ to: requester, amount: UInt64.from(refundAmount) });
  }

  @method resolveRequest(requestInput: RequestInput) {
    let actionState = this.actionState.getAndAssertEquals();
    requestInput.actionType.assertEquals(ActionEnum.RESOLVE);

    let actionType = createActionMask(requestInput.actionType);

    // if it is resolve action then sender must be dkg
    let DKG_address = this.DKG_address.getAndAssertEquals();

    let requestAction = new RequestAction({
      committeeId: requestInput.committeeId,
      keyId: requestInput.keyId,
      requester: requestInput.requester,
      R: requestInput.R, // request value
      D: RequestVector.empty(),
      actionType,
    });

    let requestInputId = requestAction.requestId();
    // checking if the request have the same id already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: actionState,
      }),
      Bool,
      (state: Bool, action: RequestAction) => {
        return action.requestId().equals(requestInputId).or(state);
      },
      // initial state
      { state: Bool(false), actionState: actionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    this.reducer.dispatch(requestAction);

    this.send({ to: DKG_address, amount: UInt64.from(RequestFee) });
  }

  @method rollupRequest(proof: RequestProof) {
    proof.verify();
    let actionState = this.actionState.getAndAssertEquals();
    let requestStatusRoot = this.requestStatusRoot.getAndAssertEquals();
    let requesterRoot = this.requesterRoot.getAndAssertEquals();

    actionState.assertEquals(proof.publicOutput.initialActionState);
    requestStatusRoot.assertEquals(proof.publicOutput.initialRequestStatusRoot);
    requesterRoot.assertEquals(proof.publicOutput.initialRequesterRoot);

    let lastActionState = this.account.actionState.getAndAssertEquals();
    lastActionState.assertEquals(proof.publicOutput.finalActionState);

    // update on-chain state
    this.actionState.set(proof.publicOutput.finalActionState);
    this.requestStatusRoot.set(proof.publicOutput.finalRequestStatusRoot);
    this.requesterRoot.set(proof.publicOutput.finalRequesterRoot);
  }

  // to-do: after finished request, committee can take fee (maybe using another contract)
}
