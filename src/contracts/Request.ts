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
import { COMMITTEE_MAX_SIZE } from '../libs/Committee.js';
import { REQUEST_MAX_SIZE } from '../libs/Requestor.js';
import { updateOutOfSnark } from '../libs/utils.js';

export const LEVEL2_TREE_HEIGHT = Math.log2(COMMITTEE_MAX_SIZE) + 1;
const EmptyMerkleMap = new MerkleMap();
export const RequestFee = Field(10 ** 9); // 1 Mina
export const ZeroFee = Field(0); // 0 Mina
export class RequestValue extends GroupDynamicArray(REQUEST_MAX_SIZE) {}

export const enum ActionEnum {
  REQUEST,
  UNREQUEST,
  RESOLVE,
  __LENGTH,
}

export const enum RequestStatusEnum {
  NOT_YET_REQUEST,
  REQUESTING,
  REQUEST_COMPLETE,
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
  R: RequestValue, // request value
  actionType: ActionMask,
}) {
  static empty(): RequestAction {
    return new RequestAction({
      committeeId: Field(0),
      keyId: Field(0),
      requester: PublicKey.fromFields([Field(0), Field(0)]),
      R: RequestValue.empty(),
      actionType: ActionMask.empty(),
    });
  }

  // using this id to check if value R is requested with keyId and committeeId
  requestId(): Field {
    return Poseidon.hash(
      [this.committeeId, this.keyId, this.R.length, this.R.toFields()].flat()
    );
  }

  toFields(): Field[] {
    return [
      this.committeeId,
      this.keyId,
      this.requester.toFields(),
      this.R.length,
      this.R.toFields(),
      this.actionType.length,
      this.actionType.toFields(),
    ].flat();
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}

export class RequestInput extends Struct({
  committeeId: Field,
  keyId: Field,
  requester: PublicKey,
  R: RequestValue,
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
        requestStateWitness: MerkleMapWitness,
        requesterWitness: MerkleMapWitness
      ): RollupStateOutput {
        preProof.verify();

        ////// caculate request ID
        let requestId = input.requestId();

        let currentState = Provable.switch(input.actionType.values, Field, [
          Field(RequestStatusEnum.NOT_YET_REQUEST),
          Field(RequestStatusEnum.REQUESTING),
          Field(RequestStatusEnum.REQUESTING),
        ]);

        // NOT_YET_REQUEST + REQUEST => REQUESTING
        // REQUESTING + UNREQUEST => NOT_YET_REQUEST
        // REQUESTING + RESOLVE => REQUEST_COMPLETE
        let newState = Provable.switch(input.actionType.values, Field, [
          Field(RequestStatusEnum.REQUESTING),
          Field(RequestStatusEnum.NOT_YET_REQUEST),
          Field(RequestStatusEnum.REQUEST_COMPLETE),
        ]);

        // caculate pre request root
        let [preRequestStatusRoot, caculateRequestId] =
          requestStateWitness.computeRootAndKey(currentState);

        caculateRequestId.assertEquals(requestId);

        preRequestStatusRoot.assertEquals(
          preProof.publicOutput.finalRequestStatusRoot
        );

        // caculate new request state root
        let [newRequestStatusRoot] =
          requestStateWitness.computeRootAndKey(newState);

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
            [input.toFields()]
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
  // state: 0: not yet requested
  // state: 1: requesting
  // state: !0 and !=1 -> which is hash(D): request complete
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

  @method request(requestInput: RequestInput) {
    let actionState = this.actionState.getAndAssertEquals();
    requestInput.actionType.assertLessThan(ActionEnum.__LENGTH);
    let actionType = createActionMask(requestInput.actionType);
    let requestAction = new RequestAction({
      committeeId: requestInput.committeeId,
      keyId: requestInput.keyId,
      requester: requestInput.requester,
      R: requestInput.R, // request value
      actionType,
    });

    let requestInputHash = requestAction.hash();
    // checking if the request already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: actionState,
      }),
      Bool,
      (state: Bool, action: RequestAction) => {
        return action.hash().equals(requestInputHash).or(state);
      },
      // initial state
      { state: Bool(false), actionState: actionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    /*
    we cant really branch the control flow - we will always have to emit an event no matter what, 
    so we emit an empty event if the RequestAction already exists
    it the RequestAction doesn't exist, emit the "real" RequestAction
    */
    let toEmit = Provable.if(exists, RequestAction.empty(), requestAction);

    this.reducer.dispatch(toEmit);

    // take fee if it is request
    let sendAmount = Provable.if(
      actionType.get(Field(ActionEnum.REQUEST)),
      RequestFee,
      ZeroFee
    );
    let requester = AccountUpdate.createSigned(this.sender);
    requester.send({ to: this, amount: UInt64.from(sendAmount) });
  }

  @method rollupRequest(proof: RequestProof) {
    proof.verify();
    let actionState = this.actionState.getAndAssertEquals();
    let requestStatusRoot = this.requestStatusRoot.getAndAssertEquals();
    let requesterRoot = this.requesterRoot.getAndAssertEquals();

    actionState.assertEquals(proof.publicOutput.initialActionState);
    requestStatusRoot.assertEquals(proof.publicOutput.initialRequestStatusRoot);
    requesterRoot.assertEquals(proof.publicOutput.initialRequesterRoot);

    let pendingActions = this.reducer.getActions({
      fromActionState: actionState,
    });

    let { state: finalState, actionState: newActionState } =
      this.reducer.reduce(
        pendingActions,
        // state type
        Field,
        // function that says how to apply an action
        (state: Field, action: RequestAction) => {
          // do this to check if this action is dummy
          // since dummy action will have actionType mask = [False, False, False]
          let sendAmount = Provable.if(
            action.actionType.length.equals(Field(0)),
            ZeroFee,
            RequestFee
          );

          // refund
          let amountToRequester = Provable.if(
            action.actionType.get(Field(ActionEnum.UNREQUEST)),
            sendAmount,
            ZeroFee
          );

          // reward to DKG
          let amountToDKG = Provable.if(
            action.actionType.get(Field(ActionEnum.RESOLVE)),
            sendAmount,
            ZeroFee
          );

          this.send({
            to: action.requester,
            amount: UInt64.from(amountToRequester),
          });

          this.send({
            to: this.DKG_address.getAndAssertEquals(),
            amount: UInt64.from(amountToDKG),
          });
          return Field(0);
        },
        { state: Field(0), actionState: actionState }
      );

    newActionState.assertEquals(proof.publicOutput.finalActionState);

    // update on-chain state
    this.actionState.set(newActionState);
    this.requestStatusRoot.set(proof.publicOutput.finalRequestStatusRoot);
    this.requesterRoot.set(proof.publicOutput.finalRequesterRoot);
  }

  // to-do: after finished request, committee can take fee (maybe using another contract)
}
