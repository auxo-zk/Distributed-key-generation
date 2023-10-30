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
  Provable,
} from 'o1js';
import { DKG, Utils } from '@auxo-dev/dkg-libs';
import { updateOutOfSnark } from '../libs/utils.js';

const EmptyMerkleMap = new MerkleMap();

export const enum KeyStatus {
  EMPTY,
  ROUND_1,
  ROUND_2,
  ACTIVE,
  DEPRECATED,
}

export const enum ActionEnum {
  KEY_GENERATION,
  KEY_DEPRECATION,
  ROUND_1_CONTRIBUTION,
  ROUND_2_CONTRIBUTION,
  TALLY_CONTRIBUTION,
  __LENGTH,
}

export class ActionMask extends Utils.DynamicArray(Bool, ActionEnum.__LENGTH) {}

export const ACTIONS = {
  [ActionEnum.KEY_GENERATION]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.KEY_GENERATION ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.KEY_DEPRECATION]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.KEY_DEPRECATION ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.ROUND_1_CONTRIBUTION]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.ROUND_1_CONTRIBUTION ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.ROUND_2_CONTRIBUTION]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.ROUND_2_CONTRIBUTION ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.TALLY_CONTRIBUTION]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.TALLY_CONTRIBUTION ? Bool(true) : Bool(false)
    )
  ),
};

export class ActionData extends Struct({
  committeeId: Field,
  keyId: Field,
  round1Contribution: DKG.Committee.Round1Contribution,
  round2Contribution: DKG.Committee.Round2Contribution,
  tallyContribution: DKG.Committee.TallyContribution,
}) {
  toFields(): Field[] {
    return [this.committeeId]
      .concat([this.keyId])
      .concat(this.round1Contribution.toFields())
      .concat(this.round2Contribution.toFields())
      .concat(this.tallyContribution.toFields());
  }
}

export class Action extends Struct({
  mask: ActionMask,
  data: ActionData,
}) {
  hash(): Field {
    return Poseidon.hash(
      [this.mask.length, this.mask.toFields(), this.data.toFields()].flat()
    );
  }
}

export class ReduceInput extends Struct({
  initialActionState: Field,
  initialRollupState: Field,
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
      privateInputs: [SelfProof<ReduceInput, ReduceOutput>, MerkleMapWitness],
      method(
        input: ReduceInput,
        earlierProof: SelfProof<ReduceInput, ReduceOutput>,
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
        // Current value of the action hash should be 0
        let [root, key] = reducedWitness.computeRootAndKey(Field(0));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionHash);

        // New value of the action hash should be 1
        [root] = reducedWitness.computeRootAndKey(Field(1));

        return {
          newActionState: updateOutOfSnark(
            earlierProof.publicOutput.newActionState,
            [
              [
                input.action.mask.length,
                input.action.mask.toFields(),
                input.action.data.toFields(),
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
      privateInputs: [SelfProof<RollupInput, RollupOutput>, MerkleMapWitness],
      method(
        input: RollupInput,
        earlierProof: SelfProof<RollupInput, RollupOutput>,
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
        let [root, key] = rollupedWitness.computeRootAndKey(Field(1));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionHash);

        // New value of the action hash should be 2
        [root] = rollupedWitness.computeRootAndKey(Field(2));

        return {
          newValue: Provable.switch(input.action.mask.values, Field, [
            Field(0),
            Field(0),
          ]),
          newRollupState: root,
        };
      },
    },
  },
});

export class DKGContract extends SmartContract {
  reducer = Reducer({ actionType: Action });

  @state(Field) actionState = State<Field>();
  @state(Field) rollupState = State<Field>();

  @state(Field) keys = State<Field>();
  @state(Field) round1Contributions = State<Field>();
  @state(Field) round2Contributions = State<Field>();
  @state(Field) tallyContributions = State<Field>();

  @method generateKey(committeeId: Field) {
    // this.reducer.dispatch(
    //   new Action({
    //     mask: ACTIONS[ActionEnum.KEY_GENERATION],
    //     data: committeeId,
    //   })
    // );
  }

  @method deprecateKey(keyId: Field) {
    // this.reducer.dispatch(
    //   new Action({
    //     mask: ACTIONS[ActionEnum.KEY_DEPRECATION],
    //     data: keyId,
    //   })
    // );
  }

  @method submitRound1Contribution(
    round1Contribution: DKG.Committee.Round1Contribution
  ) {
    // this.reducer.dispatch(
    //   new Action({
    //     mask: ACTIONS[ActionEnum.ROUND_1_CONTRIBUTION],
    //     data: round1Contribution,
    //   })
    // );
  }

  @method submitRound2Contribution() {
    return;
  }

  @method submitTallyContribution() {
    return;
  }

  @method reduce() {
    return;
  }

  @method rollup() {
    return;
  }

  @method reduceAndRollup() {
    return;
  }
}
