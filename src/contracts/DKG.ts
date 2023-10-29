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
  ROUND_1_CONTRIBUTION,
  ROUND_2_CONTRIBUTION,
  TALLY_CONTRIBUTION,
  __LENGTH,
}

export class ActionMask extends Utils.DynamicArray(Bool, ActionEnum.__LENGTH) {}

export const ACTIONS = {
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

export class Action extends Struct({
  mask: ActionMask,
  contribution:
    Field ||
    DKG.Committee.Round1Contribution ||
    DKG.Committee.Round2Contribution ||
    DKG.Committee.TallyContribution,
}) {
  hash(): Field {
    return Poseidon.hash(
      [
        this.mask.length,
        this.mask.toFields(),
        this.contribution.toFields(),
      ].flat()
    );
  }
  // isRound1Contribution(): Bool {
  //   return Bool(this.contribution instanceof DKG.Committee.Round1Contribution);
  // }
  // isRound2Contribution(): Bool {
  //   return Bool(this.contribution instanceof DKG.Committee.Round2Contribution);
  // }
  // isTallyContribution(): Bool {
  //   return Bool(this.contribution instanceof DKG.Committee.TallyContribution);
  // }
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
                input.action.contribution.toFields(),
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
            earlierProof.publicOutput.newValue.add(input.action.data),
            earlierProof.publicOutput.newValue.mul(input.action.data),
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

  @method generateKey() {
    return;
  }

  @method submitRound1Contribution() {
    return;
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
