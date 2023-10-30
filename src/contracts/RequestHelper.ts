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
  Void,
  Scalar,
} from 'o1js';

import { DKG, Utils } from '@auxo-dev/dkg-libs';

import DynamicArray from '../libs/DynamicArray.js';
import { updateOutOfSnark } from '../libs/utils.js';
import { Request, RequestInput, RequestFee, ZeroFee } from './Request.js';

// import {
//   Committee,
//   CheckConfigInput,
//   CommitteeMerkleWitness,
// } from './Committee.js';

const treeHeight = 8; // setting vector size 128
const size = 2 ** (treeHeight - 1);
const EmptyMerkleMap = new MerkleMap();

export class CustomScalarArray extends DynamicArray(Utils.CustomScalar, size) {}

export class GroupArray extends DynamicArray(Group, size) {}
export class FieldArray extends DynamicArray(Field, size) {}

export class RequestHelperInput extends Struct({
  committeeId: Field,
  keyId: Field,
  //   n: Field,
  //   t: Field,
  requetsTime: Field,
  committeePublicKey: PublicKey,
  // to-do wintess to check if it the right publickey
  secreteVector: CustomScalarArray,
  //   settingMerkleMapWitness: MerkleMapWitness,
}) {
  requestId(): Field {
    return Poseidon.hash([this.committeeId, this.keyId, this.requetsTime]);
  }
}

export class RequestHelperAction extends Struct({
  requestId: Field,
  R: Field,
  M: Field,
}) {
  toFields(): Field[] {
    return [this.requestId, this.R, this.M].flat();
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}

// export class RequestHelperRollupState extends Struct({
//   preActionHash: Field,
//   R_Root: Field,
//   M_Root: Field,
//   rollupStateRoot: Field,
// }) {
//   hash(): Field {
//     return Poseidon.hash([this.actionHash, this.R_Root, this.M_Root]);
//   }
// }

export class RequestHelperRollupOutput extends Struct({
  // Actually don't need initialActionState, since we check initialRollupStateRoot and finalActionState on-chain
  // Do this to increase security: from finding x,y that hash(x,y) = Z to finding x that hash(x,Y) = Z
  initialActionState: Field,
  initialRollupStateRoot: Field,
  finalActionState: Field,
  finalRollupStateRoot: Field,
}) {}

export const RequestHelperRollupState = Experimental.ZkProgram({
  publicOutput: RequestHelperRollupOutput,

  methods: {
    // First action to rollup
    firstStep: {
      privateInputs: [Field, Field],
      method(
        initialActionState: Field,
        initialRollupStateRoot: Field
      ): RequestHelperRollupOutput {
        return new RequestHelperRollupOutput({
          initialActionState,
          initialRollupStateRoot,
          finalActionState: initialActionState,
          finalRollupStateRoot: initialRollupStateRoot,
        });
      },
    },
    // Next actions to rollup
    nextStep: {
      privateInputs: [
        SelfProof<Void, RequestHelperRollupOutput>,
        RequestHelperAction,
        MerkleMapWitness,
      ],
      method(
        earlierProof: SelfProof<Void, RequestHelperRollupOutput>,
        action: RequestHelperAction,
        rollupStateWitness: MerkleMapWitness
      ): RequestHelperRollupOutput {
        // Verify earlier proof
        earlierProof.verify();

        // Calculate new action state == action id in the tree
        let newActionState = updateOutOfSnark(
          earlierProof.publicOutput.finalActionState,
          [action.toFields()]
        );

        // Current value of the action hash should be 0
        let [root, key] = rollupStateWitness.computeRootAndKey(Field(0));
        key.assertEquals(newActionState);
        root.assertEquals(earlierProof.publicOutput.finalRollupStateRoot);

        // New value of the action hash = 1
        [root] = rollupStateWitness.computeRootAndKey(Field(1));

        return new RequestHelperRollupOutput({
          initialActionState: earlierProof.publicOutput.initialActionState,
          initialRollupStateRoot:
            earlierProof.publicOutput.initialRollupStateRoot,
          finalActionState: newActionState,
          finalRollupStateRoot: root,
        });
      },
    },
  },
});
class RequestHelperRollupStateProof extends Experimental.ZkProgram.Proof(
  RequestHelperRollupState
) {}

// export const createRequestHelperProof = Experimental.ZkProgram({
//   publicInput: RequestHelperRollupState,
//   publicOutput: RequestHelperRollupState,

//   methods: {
//     nextStep: {
//       privateInputs: [
//         SelfProof<RequestHelperRollupState, RequestHelperRollupState>,
//         // RequestInput,
//         // MerkleMapWitness,
//         // MerkleMapWitness,
//       ],

//       method(
//         input: RequestHelperRollupState,
//         preProof: SelfProof<RequestHelperRollupState, RequestHelperRollupState>
//         // requestInput: RequestInput,
//         // requestStateWitness: MerkleMapWitness,
//         // requesterWitness: MerkleMapWitness
//       ): RequestHelperRollupState {
//         preProof.verify();

//         input.hash().assertEquals(preProof.publicInput.hash());

//         return new RequestHelperRollupState({
//           actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [
//             [requestInput.toFields()].flat(),
//           ]),
//           R_Root: newR_Root,
//           M_Root: newM_Root,
//         });
//       },
//     },

//     firstStep: {
//       privateInputs: [],

//       method(input: RequestHelperRollupState): RequestHelperRollupState {
//         return input;
//       },
//     },
//   },
// });

// class requestHelperProof extends Experimental.ZkProgram.Proof(
//   createRequestHelperProof
// ) {}

export class RequestHelper extends SmartContract {
  @state(Field) actionState = State<Field>();

  // hash(preActionState, Action) -> status
  // 0 : action not valid
  // 1 : action valid
  // 2 : action rolled up
  @state(Field) rollupStateRoot = State<Field>();
  @state(Field) R_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum R
  @state(Field) M_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum M

  reducer = Reducer({ actionType: RequestHelperAction });

  init() {
    super.init();
    this.actionState.set(Reducer.initialActionState);
    this.rollupStateRoot.set(EmptyMerkleMap.getRoot());
    this.R_Root.set(EmptyMerkleMap.getRoot());
    this.M_Root.set(EmptyMerkleMap.getRoot());
  }

  @method request(requestInput: RequestHelperInput): {
    r: CustomScalarArray;
    R: GroupArray;
    M: GroupArray;
  } {
    let requestId = requestInput.requestId();
    let dimension = requestInput.secreteVector.length;
    let r = new CustomScalarArray();
    let R = new GroupArray();
    let M = new GroupArray();
    for (let i = 0; i < size; i++) {
      let random = Scalar.random();
      r.push(Utils.CustomScalar.fromScalar(random));
      R.push(Group.generator.scale(random));
      let M_i = Provable.if(
        // Will improve this when update lib: Scalar.hash()
        FieldArray.from(requestInput.secreteVector.get(Field(i)).toFields())
          .hash()
          .equals(FieldArray.from([Field(0), Field(0)]).hash()),
        Group.generator
          .scale(requestInput.secreteVector.get(Field(i)).toScalar())
          .add(requestInput.committeePublicKey.toGroup().scale(random)),
        Group.zero.add(requestInput.committeePublicKey.toGroup().scale(random))
      );
      M.push(M_i);
    }
    let dercementAmount = Field(size).sub(dimension);
    r.decrementLength(dercementAmount);
    R.decrementLength(dercementAmount);
    M.decrementLength(dercementAmount);

    return { r, R, M };
  }

  @method rollupActionsState(proof: RequestHelperRollupStateProof) {
    // Verify proof
    proof.verify();

    // assert initialActionState
    let actionState = this.actionState.getAndAssertEquals();
    proof.publicOutput.initialActionState.assertEquals(actionState);

    // assert initialRollupStateRoot
    let rollupStateRoot = this.rollupStateRoot.getAndAssertEquals();
    proof.publicOutput.initialRollupStateRoot.assertEquals(rollupStateRoot);

    // assert finalActionState
    let lastActionState = this.account.actionState.getAndAssertEquals();
    lastActionState.assertEquals(proof.publicOutput.finalActionState);

    this.actionState.set(lastActionState);
    this.rollupStateRoot.set(proof.publicOutput.finalRollupStateRoot);
  }

  // @method rollupRequest(proof: requestHelperProof) {
  //   proof.verify();
  //   let actionState = this.actionState.getAndAssertEquals();
  //   let R_Root = this.R_Root.getAndAssertEquals();
  //   let M_Root = this.M_Root.getAndAssertEquals();

  //   actionState.assertEquals(proof.publicInput.actionHash);
  //   R_Root.assertEquals(proof.publicInput.R_Root);
  //   M_Root.assertEquals(proof.publicInput.M_Root);

  //   let pendingActions = this.reducer.getActions({
  //     fromActionState: actionState,
  //   });

  //   let { state: finalState, actionState: newActionState } =
  //     this.reducer.reduce(
  //       pendingActions,
  //       // state type
  //       Field,
  //       // function that says how to apply an action
  //       (state: Field, action: RequestInput) => {
  //         let sendAmount = Provable.if(action.isRequest, ZeroFee, RequestFee);
  //         // do this again to check if this action is dummy
  //         // since dummy action will have isRequest is False
  //         // sendAmount = Provable.if(
  //         //   action.committeeId.equals(Field(0)),
  //         //   ZeroFee,
  //         //   sendAmount
  //         // );
  //         // this.send({
  //         //   to: PublicKey.fromGroup(action.requester),
  //         //   amount: UInt64.from(sendAmount),
  //         // });
  //         return Field(0);
  //       },
  //       { state: Field(0), actionState: actionState }
  //     );

  //   newActionState.assertEquals(proof.publicOutput.actionHash);

  //   // update on-chain state
  //   this.actionState.set(newActionState);
  //   this.R_Root.set(proof.publicOutput.R_Root);
  //   this.M_Root.set(proof.publicOutput.M_Root);
  // }

  // to-do: after finished request, committee can take fee (maybe using another contract)
}
