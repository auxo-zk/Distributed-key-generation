import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Struct,
  Poseidon,
  Reducer,
  Provable,
  Bool,
  Experimental,
  SelfProof,
  MerkleMapWitness,
} from 'o1js';
import DynamicArray from '../libs/DynamicArray.js';
import { updateOutOfSnark } from '../libs/utils.js';

export const enum ActionEnum {
  ADDITION,
  MULTIPLICATION,
  __LENGTH,
}
export class ActionMask extends DynamicArray(Bool, ActionEnum.__LENGTH) {}

export const ACTIONS = {
  [ActionEnum.ADDITION]: ActionMask.from([Bool(true), Bool(false)]),
  [ActionEnum.MULTIPLICATION]: ActionMask.from([Bool(false), Bool(true)]),
};

export class Action extends Struct({
  mask: ActionMask,
  data: Field,
}) {
  hash(): Field {
    return Poseidon.hash(
      [this.mask.length, this.mask.toFields(), this.data].flat()
    );
  }
}

export class ReduceInput extends Struct({
  initialRollupState: Field,
  initialActionState: Field,
  action: Action,
}) {}

export class ReduceOutput extends Struct({
  newActionState: Field,
  newRollupState: Field,
}) {}

export const ReduceActions = Experimental.ZkProgram({
  publicInput: ReduceInput,
  publicOutput: ReduceOutput,

  methods: {
    // First action to reduce
    firstStep: {
      privateInputs: [],
      method(input: ReduceInput) {
        // Do nothing
        return {
          newActionState: input.initialActionState,
          newRollupState: input.initialRollupState,
        };
      },
    },
    // Next actions to reduce
    nextStep: {
      privateInputs: [
        SelfProof<ReduceInput, ReduceOutput>,
        MerkleMapWitness,
        MerkleMapWitness,
      ],
      method(
        input: ReduceInput,
        earlierProof: SelfProof<ReduceInput, ReduceOutput>,
        notReducedWitness: MerkleMapWitness,
        reducedWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();
        // Check consistency of the initial rollupState value
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );
        // Calculate action hash
        let actionHash = input.action.hash();
        Provable.log(input.action);
        Provable.log(actionHash);
        // Current value of the action hash should be 0
        let [root, key] = notReducedWitness.computeRootAndKey(Field(0));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionHash);

        // New value of the action hash should be 1
        [root, key] = reducedWitness.computeRootAndKey(Field(1));
        key.assertEquals(actionHash);

        return {
          newActionState: updateOutOfSnark(
            earlierProof.publicOutput.newActionState,
            [
              [
                input.action.mask.length,
                input.action.mask.toFields(),
                input.action.data,
              ].flat(),
            ]
          ),
          newRollupState: root,
        };
      },
    },
  },
});

export class RollupInput extends Struct({
  initialValue: Field,
  initialRollupState: Field,
  action: Action,
}) {}

export class RollupOutput extends Struct({
  newValue: Field,
  newRollupState: Field,
}) {}

export const RollupActions = Experimental.ZkProgram({
  publicInput: RollupInput,
  publicOutput: RollupOutput,

  methods: {
    // First action to rollup
    firstStep: {
      privateInputs: [],
      method(input: RollupInput) {
        // Do nothing
        return {
          newValue: input.initialValue,
          newRollupState: input.initialRollupState,
        };
      },
    },
    // Next actions to rollup
    nextStep: {
      privateInputs: [
        SelfProof<RollupInput, RollupOutput>,
        MerkleMapWitness,
        MerkleMapWitness,
      ],
      method(
        input: RollupInput,
        earlierProof: SelfProof<RollupInput, RollupOutput>,
        notRollupedWitness: MerkleMapWitness,
        rollupedWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();
        // Check consistency of the initial value & rollupState value
        input.initialValue.assertEquals(earlierProof.publicInput.initialValue);
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );
        // Calculate action hash
        let actionHash = input.action.hash();
        // Current value of the action hash should be 1
        let [root, key] = notRollupedWitness.computeRootAndKey(Field(1));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionHash);

        // New value of the action hash should be 1
        [root, key] = rollupedWitness.computeRootAndKey(Field(2));
        key.assertEquals(actionHash);

        return {
          newValue: Provable.switch(input.action.mask.values, Field, [
            earlierProof.publicOutput.newValue.add(input.action.data),
            earlierProof.publicOutput.newValue.mul(input.action.data),
          ]),
          newRollupState: root,
        };
      },
    },
  },
});

class ReduceProof extends Experimental.ZkProgram.Proof(ReduceActions) {}

class RollupProof extends Experimental.ZkProgram.Proof(RollupActions) {}

export class TestZkapp extends SmartContract {
  reducer = Reducer({ actionType: Action });
  @state(Field) num = State<Field>();
  // Not necessary
  @state(Field) actionState = State<Field>();
  // TODO Check if updating merkle map value causes any unexpected consequences
  @state(Field) rollupState = State<Field>();

  @method add(x: Field) {
    this.reducer.dispatch(
      new Action({
        mask: ACTIONS[ActionEnum.ADDITION],
        data: x,
      })
    );
  }

  @method mul(x: Field) {
    this.reducer.dispatch(
      new Action({
        mask: ACTIONS[ActionEnum.MULTIPLICATION],
        data: x,
      })
    );
  }

  @method simpleRollup() {
    let num = this.num.get();
    this.num.assertEquals(num);
    let actionState = this.actionState.get();
    this.actionState.assertEquals(actionState);

    let pendingActions = this.reducer.getActions({
      fromActionState: actionState,
    });

    let { state: newNum, actionState: newActionState } = this.reducer.reduce(
      pendingActions,
      Field,
      (state: Field, action: Action) => {
        return Provable.switch(action.mask.values, Field, [
          state.add(action.data),
          state.mul(action.data),
        ]);
      },
      { state: num, actionState }
    );

    // update on-chain state
    this.num.set(newNum);
    this.actionState.set(newActionState);
  }

  @method reduceActions(proof: ReduceProof) {
    // Verify proof
    proof.verify();

    // Get actions to reduce
    let fromActionState = proof.publicInput.initialActionState;
    fromActionState.assertEquals(proof.publicInput.initialActionState);

    let pendingActions = this.reducer.getActions({
      fromActionState: fromActionState,
    });

    this.reducer.reduce(
      pendingActions,
      Field,
      (state: Field, action: Action) => state,
      { state: Field(0), actionState: fromActionState }
    );

    // Check if last action state is correct
    let lastActionState = this.account.actionState.getAndAssertEquals();
    proof.publicOutput.newActionState.assertEquals(lastActionState);

    // Check if previous rollup state is correct
    let oldRollupState = this.rollupState.getAndAssertEquals();
    proof.publicInput.initialRollupState.assertEquals(oldRollupState);
    this.rollupState.set(proof.publicOutput.newRollupState);

    // update on-chain state (not necessary, for this test contract only)
    this.actionState.set(lastActionState);
  }

  @method rollupActionsWithoutReduce(proof: RollupProof) {
    // Verify proof
    proof.verify();

    // Check if current rollup state is correct
    let currentRollupState = this.rollupState.getAndAssertEquals();
    proof.publicInput.initialRollupState.assertEquals(currentRollupState);
    this.rollupState.set(proof.publicOutput.newRollupState);

    // Check if current value  is correct
    let currentValue = this.num.getAndAssertEquals();
    proof.publicInput.initialValue.assertEquals(currentValue);
    this.num.set(proof.publicOutput.newValue);
  }

  @method rollupActionsWithReduce(
    reduceProof: ReduceProof,
    rollupProof: RollupProof
  ) {
    this.reduceActions(reduceProof);
    this.rollupActionsWithoutReduce(rollupProof);
  }
}
