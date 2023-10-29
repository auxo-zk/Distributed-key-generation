import { assert } from 'node:console';
import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  Group,
  Bool,
  Reducer,
  Permissions,
  MerkleMap,
  MerkleMapWitness,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
  Mina,
  Provable,
  AccountUpdate,
  UInt64,
} from 'o1js';

import DynamicArray from '../libs/DynamicArray.js';
import { updateOutOfSnark } from '../libs/utils.js';
import { findSourceMap } from 'node:module';

const treeHeight = 6; // setting max 32 member
const EmptyMerkleMap = new MerkleMap();
export const RequestFee = Field(10 ** 9); // 1 Mina
const ZeroFee = Field(0); // 0 Mina
export class GroupArray extends DynamicArray(Group, 2 ** (treeHeight - 1)) {}
const Field32Array = Provable.Array(Field, 32);

export class RequestInput extends Struct({
  committeeId: Field,
  keyId: Field,
  requester: Group,
  R: GroupArray, // request value
  isRequest: Bool, // True if request, False if unrequest
}) {
  static empty(): RequestInput {
    return new RequestInput({
      committeeId: Field(0),
      keyId: Field(0),
      requester: Group.from(Field(0), Field(0)),
      R: GroupArray.empty(),
      isRequest: Bool(false),
    });
  }

  hash(): Field {
    return Poseidon.hash(
      [
        this.committeeId,
        this.keyId,
        this.requester.toFields(),
        this.R.length,
        this.R.toFields(),
        this.isRequest.toField(),
      ].flat()
    );
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
      this.isRequest.toField(),
    ].flat();
  }
}

export class RollupState extends Struct({
  actionHash: Field,
  requestStateRoot: Field,
  requesterRoot: Field,
}) {
  hash(): Field {
    return Poseidon.hash([
      this.actionHash,
      this.requestStateRoot,
      this.requesterRoot,
    ]);
  }
}

export const createRequestProof = Experimental.ZkProgram({
  publicInput: RollupState,
  publicOutput: RollupState,

  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<RollupState, RollupState>,
        RequestInput,
        MerkleMapWitness,
        MerkleMapWitness,
      ],

      method(
        input: RollupState,
        preProof: SelfProof<RollupState, RollupState>,
        requestInput: RequestInput,
        requestStateWitness: MerkleMapWitness,
        requesterWitness: MerkleMapWitness
      ): RollupState {
        preProof.verify();

        input.hash().assertEquals(preProof.publicInput.hash());

        ////// caculate request ID
        let requestId = requestInput.requestId();

        // if want to request: so the current state must be Field(0)
        // if want to unrequest: so the current state must be Field(1)
        let currentState = Provable.if(
          requestInput.isRequest,
          Field(0),
          Field(1)
        );

        // 0 -> 1 - 0 = 1
        // 1 -> 1 - 1 = 0
        let newState = Field(1).sub(currentState);

        // caculate pre request root
        let [preRequestStateRoot, caculateRequestId] =
          requestStateWitness.computeRootAndKey(currentState);

        caculateRequestId.assertEquals(requestId);

        preRequestStateRoot.assertEquals(
          preProof.publicOutput.requestStateRoot
        );

        // caculate new request state root
        let [newRequestStateRoot] =
          requestStateWitness.computeRootAndKey(newState);

        ////// caculate requesterWitess

        // if want to request: so the current requester must be Group.empty()
        // if want to unrequest: so the current requester must be requester
        let currentRequester = Provable.if(
          requestInput.isRequest,
          Field(0),
          GroupArray.hash(requestInput.requester)
        );

        let newRequester = Provable.if(
          requestInput.isRequest,
          GroupArray.hash(requestInput.requester),
          Field(0)
        );

        let [preRequesterRoot, caculateRequestId2] =
          requesterWitness.computeRootAndKey(currentRequester);

        caculateRequestId2.assertEquals(requestId);

        preRequesterRoot.assertEquals(preProof.publicOutput.requesterRoot);

        // caculate new requester root
        let [newRequesterRoot] =
          requesterWitness.computeRootAndKey(newRequester);

        return new RollupState({
          actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [
            [requestInput.toFields()].flat(),
          ]),
          requestStateRoot: newRequestStateRoot,
          requesterRoot: newRequesterRoot,
        });
      },
    },

    firstStep: {
      privateInputs: [],

      method(input: RollupState): RollupState {
        return input;
      },
    },
  },
});

class requestProof extends Experimental.ZkProgram.Proof(createRequestProof) {}

export class Request extends SmartContract {
  // requestId = hash(committeeId, keyId, hash(valueR))
  // -> state: enable to check if request the same data
  // state: 0: not yet requested
  // state: 1: requesting
  // state: !0 and !=1 which is hash(D): request complete
  @state(Field) requestStateRoot = State<Field>();
  // request id -> requester (Publickey/Group)
  @state(Field) requesterRoot = State<Field>();
  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: RequestInput });

  init() {
    super.init();
    this.requestStateRoot.set(EmptyMerkleMap.getRoot());
    this.requesterRoot.set(EmptyMerkleMap.getRoot());
    this.actionState.set(Reducer.initialActionState);
  }

  @method request(requestInput: RequestInput) {
    let actionState = this.actionState.getAndAssertEquals();
    let requestInputHash = requestInput.hash();
    // checking if the request already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: actionState,
      }),
      Bool,
      (state: Bool, action: RequestInput) => {
        return action.hash().equals(requestInputHash).or(state);
      },
      // initial state
      { state: Bool(false), actionState: actionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    /*
    we cant really branch the control flow - we will always have to emit an event no matter what, 
    so we emit an empty event if the RequestInput already exists
    it the RequestInput doesn't exist, emit the "real" RequestInput
    */
    let toEmit = Provable.if(exists, RequestInput.empty(), requestInput);

    this.reducer.dispatch(toEmit);

    // take fee if it is request
    let sendAmount = Provable.if(requestInput.isRequest, RequestFee, ZeroFee);
    let requester = AccountUpdate.createSigned(this.sender);
    requester.send({ to: this, amount: UInt64.from(sendAmount) });
  }

  @method rollupRequest(proof: requestProof) {
    proof.verify();
    let actionState = this.actionState.getAndAssertEquals();
    let requestStateRoot = this.requestStateRoot.getAndAssertEquals();
    let requesterRoot = this.requesterRoot.getAndAssertEquals();

    actionState.assertEquals(proof.publicInput.actionHash);
    requestStateRoot.assertEquals(proof.publicInput.requestStateRoot);
    requesterRoot.assertEquals(proof.publicInput.requesterRoot);

    let pendingActions = this.reducer.getActions({
      fromActionState: actionState,
    });

    let { state: finalState, actionState: newActionState } =
      this.reducer.reduce(
        pendingActions,
        // state type
        Field,
        // function that says how to apply an action
        (state: Field, action: RequestInput) => {
          let sendAmount = Provable.if(action.isRequest, ZeroFee, RequestFee);
          // do this again to check if this action is dummy
          // since dummy action will have isRequest is False
          sendAmount = Provable.if(
            action.committeeId.equals(Field(0)),
            ZeroFee,
            sendAmount
          );
          this.send({
            to: PublicKey.fromGroup(action.requester),
            amount: UInt64.from(sendAmount),
          });
          return Field(0);
        },
        { state: Field(0), actionState: actionState }
      );

    newActionState.assertEquals(proof.publicOutput.actionHash);

    // update on-chain state
    this.actionState.set(newActionState);
    this.requestStateRoot.set(proof.publicOutput.requestStateRoot);
    this.requesterRoot.set(proof.publicOutput.requesterRoot);
  }

  // to-do: after finished request, committee can take fee (maybe using another contract)
}
