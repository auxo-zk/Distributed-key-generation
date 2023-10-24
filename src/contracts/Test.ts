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
  MerkleMap,
} from 'o1js';

const ActionMask = Provable.Array(Bool, 2);

class ActionType extends Struct({
  type: Provable.Array(Bool, 2),
  data: Field,
}) {}

class RollupOutput extends Struct({
  rollupState: Field,
  value: Field,
}) {}

const AddAction = ActionMask.fromJSON([true, false]);
const MultiplicationAction = ActionMask.fromJSON([true, false]);

const ActionNullifier = new MerkleMap();

export const ActionStatesHash = Experimental.ZkProgram({
  publicInput: Field,
  publicOutput: Field,

  methods: {
    baseCase: {
      privateInputs: [],
      method(actionState: Field): Field {
        return Poseidon.hash(actionState.toFields());
      },
    },

    inductiveCase: {
      privateInputs: [SelfProof<Field, Field>],
      method(
        nextActionState: Field,
        earlierProof: SelfProof<Field, Field>
      ): Field {
        earlierProof.verify();
        return Poseidon.hash([earlierProof.publicOutput, nextActionState]);
      },
    },
  },
});

export const ActionRollup = Experimental.ZkProgram({
  publicInput: Field,
  publicOutput: RollupOutput,

  methods: {
    baseCase: {
      privateInputs: [ActionType],
      method(actionState: Field, action: ActionType) {
        // FIXME: cannot use MerkleMap inside Provable code? => use MerkleMapWitness instead
        // Provable.assertEqual(ActionNullifier.get(actionState), Field(0));
        Provable.asProver(() => ActionNullifier.set(actionState, Field(1)));
        let newNum = Provable.switch(action.type, Field, [
          Field(0).add(action.data),
          Field(0).mul(action.data),
        ]);
        return { rollupState: ActionNullifier.getRoot(), value: newNum };
      },
    },

    inductiveCase: {
      privateInputs: [ActionType, SelfProof<Field, RollupOutput>],
      method(
        nextActionState: Field,
        nextAction: ActionType,
        earlierProof: SelfProof<Field, RollupOutput>
      ) {
        earlierProof.verify();
        // FIXME
        // Provable.assertEqual(ActionNullifier.get(nextActionState), Field(0));
        Provable.asProver(() => ActionNullifier.set(nextActionState, Field(1)));
        let newNum = Provable.switch(nextAction.type, Field, [
          earlierProof.publicOutput.value.add(nextAction.data),
          earlierProof.publicOutput.value.mul(nextAction.data),
        ]);
        return { rollupState: ActionNullifier.getRoot(), value: newNum };
      },
    },
  },
});

class ActionRecordProof extends Experimental.ZkProgram.Proof(
  ActionStatesHash
) {}

class ActionValidProof extends Experimental.ZkProgram.Proof(ActionRollup) {}

export class TestZkapp extends SmartContract {
  reducer = Reducer({ actionType: ActionType });
  @state(Field) num = State<Field>();
  @state(Field) actionState = State<Field>();
  @state(Field) rollupState = State<Field>();

  @method add(x: Field) {
    this.reducer.dispatch({ type: AddAction, data: x });
  }

  @method mul(x: Field) {
    this.reducer.dispatch({ type: MultiplicationAction, data: x });
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
      (state: Field, action: ActionType) => {
        return Provable.switch(action.type, Field, [
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

  @method plainReduce() {
    let actionState = this.actionState.get();
    this.actionState.assertEquals(actionState);

    let pendingActions = this.reducer.getActions({
      fromActionState: actionState,
    });

    let { state, actionState: newActionState } = this.reducer.reduce(
      pendingActions,
      Field,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (state: Field, action: ActionType) => {
        return Field(0);
      },
      { state: Field(0), actionState }
    );

    // update on-chain state
    this.actionState.set(newActionState);
  }

  @method selectiveRollup(
    recordProof: ActionRecordProof,
    validProof: ActionValidProof
  ) {
    /**
     * Verify proofs
     * - Rollup recorded actions only
     * - Rollup valid actions only
     */
    recordProof.verify();
    validProof.verify();

    this.actionState.assertEquals(recordProof.publicOutput);
    let rollupState = this.rollupState.getAndAssertEquals();
    // rollupState input not checked
    this.num.set(validProof.publicOutput.value);
    this.rollupState.set(validProof.publicOutput.rollupState);
  }
}
