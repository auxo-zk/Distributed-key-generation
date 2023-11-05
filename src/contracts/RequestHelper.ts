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
  provablePure,
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

const treeHeight = 7; // setting vector size 64
const size = 2 ** (treeHeight - 1);
const EmptyMerkleMap = new MerkleMap();

export class CustomScalarArray extends DynamicArray(Utils.CustomScalar, size) {}

export class GroupArray extends DynamicArray(Group, size) {}

export class RequestHelperInput extends Struct({
  committeeId: Field,
  keyId: Field,
  //   N: Field,
  //   T: Field,
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
  R: GroupArray,
  M: GroupArray,
}) {
  toFields(): Field[] {
    return [this.requestId, this.R.toFields(), this.M.toFields()].flat();
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}

export class RollupStatusOutput extends Struct({
  // Actually don't need initialActionState, since we check initialRollupStatusRoot and finalActionState on-chain
  // Do this to increase security: from finding x,y that hash(x,y) = Z to finding x that hash(x,Y) = Z
  initialActionState: Field,
  initialRollupStatusRoot: Field,
  finalActionState: Field,
  finalRollupStatusRoot: Field,
}) {}

export const CreateRollupStatus = Experimental.ZkProgram({
  publicOutput: RollupStatusOutput,

  methods: {
    // First action to rollup
    firstStep: {
      privateInputs: [Field, Field],
      method(
        initialActionState: Field,
        initialRollupStatusRoot: Field
      ): RollupStatusOutput {
        return new RollupStatusOutput({
          initialActionState,
          initialRollupStatusRoot,
          finalActionState: initialActionState,
          finalRollupStatusRoot: initialRollupStatusRoot,
        });
      },
    },
    // Next actions to rollup
    nextStep: {
      privateInputs: [
        SelfProof<Void, RollupStatusOutput>,
        RequestHelperAction,
        MerkleMapWitness,
      ],
      method(
        earlierProof: SelfProof<Void, RollupStatusOutput>,
        action: RequestHelperAction,
        rollupStatusWitness: MerkleMapWitness
      ): RollupStatusOutput {
        // Verify earlier proof
        earlierProof.verify();

        // Calculate new action state == action id in the tree
        let newActionState = updateOutOfSnark(
          earlierProof.publicOutput.finalActionState,
          [action.toFields()]
        );

        // Current value of the action hash should be 0
        let [root, key] = rollupStatusWitness.computeRootAndKey(Field(0));
        key.assertEquals(newActionState);
        root.assertEquals(earlierProof.publicOutput.finalRollupStatusRoot);

        // New value of the action hash = 1
        [root] = rollupStatusWitness.computeRootAndKey(Field(1));

        return new RollupStatusOutput({
          initialActionState: earlierProof.publicOutput.initialActionState,
          initialRollupStatusRoot:
            earlierProof.publicOutput.initialRollupStatusRoot,
          finalActionState: newActionState,
          finalRollupStatusRoot: root,
        });
      },
    },
  },
});
class RollupStatusProof extends Experimental.ZkProgram.Proof(
  CreateRollupStatus
) {}

export class RollupActionsOutput extends Struct({
  requestId: Field,
  sum_R: GroupArray,
  sum_M: GroupArray,
  cur_T: Field,
  initialStatusRoot: Field,
  finalStatusRoot: Field,
}) {
  hash(): Field {
    return Poseidon.hash(
      [
        this.requestId,
        this.sum_R.toFields(),
        this.sum_M.toFields(),
        this.cur_T,
        this.initialStatusRoot,
        this.finalStatusRoot,
      ].flat()
    );
  }
}

export const CreateProofRollupAction = Experimental.ZkProgram({
  publicOutput: RollupActionsOutput,

  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<Void, RollupActionsOutput>,
        RequestHelperAction,
        Field,
        MerkleMapWitness,
      ],

      method(
        preProof: SelfProof<Void, RollupActionsOutput>,
        action: RequestHelperAction,
        preActionState: Field,
        rollupStatusWitness: MerkleMapWitness
      ): RollupActionsOutput {
        preProof.verify();
        let requestId = action.requestId;
        requestId.assertEquals(preProof.publicOutput.requestId);

        let actionState = updateOutOfSnark(preActionState, [action.toFields()]);

        // It's status has to be 1
        let [root, key] = rollupStatusWitness.computeRootAndKey(Field(1));
        key.assertEquals(actionState);
        root.assertEquals(preProof.publicOutput.finalStatusRoot);

        // Update satus to 2
        let [newRoot] = rollupStatusWitness.computeRootAndKey(Field(2));

        let sum_R = preProof.publicOutput.sum_R;
        let sum_M = preProof.publicOutput.sum_M;

        for (let i = 0; i < size; i++) {
          sum_R.set(Field(i), sum_R.get(Field(i)).add(action.R.get(Field(i))));
          sum_M.set(Field(i), sum_M.get(Field(i)).add(action.M.get(Field(i))));
        }

        return new RollupActionsOutput({
          requestId: requestId,
          sum_R,
          sum_M,
          cur_T: preProof.publicOutput.cur_T.add(Field(1)),
          initialStatusRoot: preProof.publicOutput.initialStatusRoot,
          finalStatusRoot: newRoot,
        });
      },
    },

    firstStep: {
      privateInputs: [Field, Field, Field],

      method(
        requestId: Field,
        size: Field,
        initialStatusRoot: Field
      ): RollupActionsOutput {
        return new RollupActionsOutput({
          requestId,
          sum_R: GroupArray.empty(size),
          sum_M: GroupArray.empty(size),
          cur_T: Field(0),
          initialStatusRoot,
          finalStatusRoot: initialStatusRoot,
        });
      },
    },
  },
});

class ProofRollupAction extends Experimental.ZkProgram.Proof(
  CreateProofRollupAction
) {}

export class RequestHelper extends SmartContract {
  @state(Field) actionState = State<Field>();

  // hash(preActionState, Action) -> status
  // 0 : action not valid
  // 1 : action valid
  // 2 : action rolled up
  @state(Field) rollupStatusRoot = State<Field>();
  @state(Field) R_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum R
  @state(Field) M_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum M

  reducer = Reducer({ actionType: RequestHelperAction });

  init() {
    super.init();
    this.actionState.set(Reducer.initialActionState);
    this.rollupStatusRoot.set(EmptyMerkleMap.getRoot());
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
        Poseidon.hash(
          requestInput.secreteVector.get(Field(i)).toFields()
        ).equals(Poseidon.hash([Field(0), Field(0)])),
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

    this.reducer.dispatch(
      new RequestHelperAction({
        requestId,
        R,
        M,
      })
    );

    return { r, R, M };
  }

  @method rollupActionsState(proof: RollupStatusProof) {
    // Verify proof
    proof.verify();

    // assert initialActionState
    let actionState = this.actionState.getAndAssertEquals();
    proof.publicOutput.initialActionState.assertEquals(actionState);

    // assert initialRollupStatusRoot
    let rollupStatusRoot = this.rollupStatusRoot.getAndAssertEquals();
    proof.publicOutput.initialRollupStatusRoot.assertEquals(rollupStatusRoot);

    // assert finalActionState
    let lastActionState = this.account.actionState.getAndAssertEquals();
    lastActionState.assertEquals(proof.publicOutput.finalActionState);

    this.actionState.set(lastActionState);
    this.rollupStatusRoot.set(proof.publicOutput.finalRollupStatusRoot);
  }

  // to-do: adding N, T to check size by interact with Committee contract
  // to-do: request to Request contract
  @method rollupRequest(
    proof: ProofRollupAction,
    R_wintess: MerkleMapWitness,
    M_wintess: MerkleMapWitness
  ) {
    proof.verify();

    let R_Root = this.R_Root.getAndAssertEquals();
    let M_Root = this.M_Root.getAndAssertEquals();
    let rollupStatusRoot = this.rollupStatusRoot.getAndAssertEquals();

    rollupStatusRoot.assertEquals(proof.publicOutput.initialStatusRoot);
    let [old_R_root, R_key] = R_wintess.computeRootAndKey(Field(0));
    let [old_M_root, M_key] = M_wintess.computeRootAndKey(Field(0));

    R_key.assertEquals(proof.publicOutput.requestId);
    M_key.assertEquals(proof.publicOutput.requestId);

    R_Root.assertEquals(old_R_root);
    M_Root.assertEquals(old_M_root);

    // to-do: adding check cur_T == T
    let [new_R_root] = R_wintess.computeRootAndKey(
      proof.publicOutput.sum_R.hash()
    );
    let [new_M_root] = M_wintess.computeRootAndKey(
      proof.publicOutput.sum_M.hash()
    );

    // update on-chain state
    this.R_Root.set(new_R_root);
    this.M_Root.set(new_M_root);
    this.rollupStatusRoot.set(proof.publicOutput.finalStatusRoot);

    // to-do: request to Request contract
    //...
  }

  // to-do: after finished request, committee can take fee (maybe using another contract)
}
