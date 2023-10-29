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

import { DKG, Utils } from '@auxo-dev/dkg-libs';

import DynamicArray from '../libs/DynamicArray.js';
import { updateOutOfSnark } from '../libs/utils.js';
import { Request, RequestInput, RequestFee, ZeroFee } from './Request.js';
import {
  Committee,
  CheckConfigInput,
  CommitteeMerkleWitness,
} from './Committee.js';

const treeHeight = 8; // setting vector size 128
const EmptyMerkleMap = new MerkleMap();

export class CustomScalarArray extends DynamicArray(
  Utils.CustomScalar,
  2 ** (treeHeight - 1)
) {}

export class RequestHelperInput extends Struct({
  committeeId: Field,
  n: Field,
  t: Field,
  keyId: Field,
  requetsTime: Field,
  committeePublicKey: PublicKey,
  // to-do wintess to check right publickey
  secreteVector: CustomScalarArray,
  settingMerkleMapWitness: MerkleMapWitness,
}) {
  requestId(): Field {
    return Poseidon.hash([this.committeeId, this.keyId, this.requetsTime]);
  }
}

export class RequestHelperRollupState extends Struct({
  actionHash: Field,
  R_Root: Field,
  M_Root: Field,
}) {
  hash(): Field {
    return Poseidon.hash([this.actionHash, this.R_Root, this.M_Root]);
  }
}

export const createRequestHelperProof = Experimental.ZkProgram({
  publicInput: RequestHelperRollupState,
  publicOutput: RequestHelperRollupState,

  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<RequestHelperRollupState, RequestHelperRollupState>,
        // RequestInput,
        // MerkleMapWitness,
        // MerkleMapWitness,
      ],

      method(
        input: RequestHelperRollupState,
        preProof: SelfProof<RequestHelperRollupState, RequestHelperRollupState>
        // requestInput: RequestInput,
        // requestStateWitness: MerkleMapWitness,
        // requesterWitness: MerkleMapWitness
      ): RequestHelperRollupState {
        preProof.verify();

        input.hash().assertEquals(preProof.publicInput.hash());

        return new RequestHelperRollupState({
          actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [
            [requestInput.toFields()].flat(),
          ]),
          R_Root: newR_Root,
          M_Root: newM_Root,
        });
      },
    },

    firstStep: {
      privateInputs: [],

      method(input: RequestHelperRollupState): RequestHelperRollupState {
        return input;
      },
    },
  },
});

class requestHelperProof extends Experimental.ZkProgram.Proof(
  createRequestHelperProof
) {}

export class RequestHelper extends SmartContract {
  @state(Field) R_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum R
  @state(Field) M_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum M
  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: RequestInput });

  init() {
    super.init();
    this.R_Root.set(EmptyMerkleMap.getRoot());
    this.M_Root.set(EmptyMerkleMap.getRoot());
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

  @method rollupRequest(proof: requestHelperProof) {
    proof.verify();
    let actionState = this.actionState.getAndAssertEquals();
    let R_Root = this.R_Root.getAndAssertEquals();
    let M_Root = this.M_Root.getAndAssertEquals();

    actionState.assertEquals(proof.publicInput.actionHash);
    R_Root.assertEquals(proof.publicInput.R_Root);
    M_Root.assertEquals(proof.publicInput.M_Root);

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
          // sendAmount = Provable.if(
          //   action.committeeId.equals(Field(0)),
          //   ZeroFee,
          //   sendAmount
          // );
          // this.send({
          //   to: PublicKey.fromGroup(action.requester),
          //   amount: UInt64.from(sendAmount),
          // });
          return Field(0);
        },
        { state: Field(0), actionState: actionState }
      );

    newActionState.assertEquals(proof.publicOutput.actionHash);

    // update on-chain state
    this.actionState.set(newActionState);
    this.R_Root.set(proof.publicOutput.R_Root);
    this.M_Root.set(proof.publicOutput.M_Root);
  }

  // to-do: after finished request, committee can take fee (maybe using another contract)
}
