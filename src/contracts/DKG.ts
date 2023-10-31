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
  MerkleTree,
  MerkleWitness,
} from 'o1js';
import { DKG, Utils } from '@auxo-dev/dkg-libs';
import { updateOutOfSnark } from '../libs/utils.js';

const CONTRIBUTION_TREE_HEIGHT = 6;
export const Round1MT = new MerkleTree(CONTRIBUTION_TREE_HEIGHT);
export class Round1Witness extends MerkleWitness(2 ** (CONTRIBUTION_TREE_HEIGHT - 1)) {}
export const Round2MT = new MerkleTree(CONTRIBUTION_TREE_HEIGHT);
export class Round2Witness extends MerkleWitness(2 ** (CONTRIBUTION_TREE_HEIGHT - 1)) {}
export const TallyMT = new MerkleTree(CONTRIBUTION_TREE_HEIGHT);
export class TallyWitness extends MerkleWitness(2 ** (CONTRIBUTION_TREE_HEIGHT - 1)) {}

export const enum KeyStatus {
  EMPTY,
  ROUND_1,
  ROUND_2,
  ACTIVE,
  DEPRECATED,
}

export const enum ActionStatus {
  NOT_EXISTED,
  REDUCED,
  ROLLUPED,
}

export const enum ActionEnum {
  KEY_GENERATION,
  KEY_DEPRECATION,
  ROUND_1_CONTRIBUTION,
  ROUND_2_CONTRIBUTION,
  TALLY_CONTRIBUTION,
  __LENGTH,
}

export class ActionMask extends Utils.DynamicArray(Bool, ActionEnum.__LENGTH) { }

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
}) { }

export class ReduceOutput extends Struct({
  newActionState: Field,
  newRollupState: Field,
}) { }

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
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [
            [
              input.action.mask.length,
              input.action.mask.toFields(),
              input.action.data.toFields(),
            ].flat(),
          ]
        );
        // Current value of the action hash should be 0
        let [root, key] = reducedWitness.computeRootAndKey(Field(ActionStatus.NOT_EXISTED));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionState);

        // New value of the action hash should be 1
        [root] = reducedWitness.computeRootAndKey(Field(ActionStatus.REDUCED));

        return {
          newActionState: actionState,
          newRollupState: root,
        };
      },
    },
  },
});

export class Round1Input extends Struct({
  T: Field,
  N: Field,
  initialKeyRoot: Field,
  initialContributionRoot: Field,
  initialRollupState: Field,
  action: Action,
  memberIndex: Field,
}) {}

export class Round1Output extends Struct({
  newContributionRoot: Field,
  newRollupState: Field,
  counter: Field,
}) {}

export const FinalizeRound1 = Experimental.ZkProgram({
  publicInput: Round1Input,
  publicOutput: Round1Output,
  methods: {
    firstStep: {
      privateInputs: [],
      method(input: Round1Input) {
        // Do nothing
        return {
          newContributionRoot: input.initialContributionRoot,
          newRollupState: input.initialRollupState,
          counter: Field(0),
        };
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<Round1Input, Round1Output>, 
        MerkleMapWitness, 
        MerkleMapWitness,
        MerkleMapWitness, 
        Round1Witness,
      ],
      method(
        input: Round1Input,
        earlierProof: SelfProof<Round1Input, Round1Output>,
        rollupedWitness: MerkleMapWitness,
        keyStatusWitness: MerkleMapWitness,
        contributionWitnessLevel1: MerkleMapWitness, 
        contributionWitnessLevel2: Round1Witness,
      ) {
        // Verify earlier proof
        earlierProof.verify();
        // Check consistency of the initial values
        input.T.assertEquals(earlierProof.publicInput.T);
        input.N.assertEquals(earlierProof.publicInput.N);
        input.initialKeyRoot.assertEquals(
          earlierProof.publicInput.initialKeyRoot
        );
        input.initialContributionRoot.assertEquals(
          earlierProof.publicInput.initialContributionRoot
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );
        // Calculate action hash & keyId
        let actionHash = input.action.hash();
        let keyId = Poseidon.hash([
          input.action.data.committeeId,
          input.action.data.keyId,
        ])
        // Current value of the action hash should be 1
        let [root, key] = rollupedWitness.computeRootAndKey(Field(ActionStatus.REDUCED));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionHash);
        // New value of the action hash should be 2
        [root] = rollupedWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        // Check the selected key is in round 1 contribution period
        let [keysRoot, keysIndex] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.ROUND_1));
        keysRoot.assertEquals(input.initialKeyRoot);
        keysIndex.equals(keyId);

        // Check if this committee member has contributed yet
        contributionWitnessLevel2.calculateIndex().assertEquals(input.memberIndex);
        let [contributionRoot, contributionIndex] = contributionWitnessLevel1.computeRootAndKey(
          contributionWitnessLevel2.calculateRoot(Field(0))
        );
        contributionRoot.assertEquals(earlierProof.publicOutput.newContributionRoot);
        contributionIndex.assertEquals(keyId);

        // Compute new contribution root
        [contributionRoot,] = contributionWitnessLevel1.computeRootAndKey(
          contributionWitnessLevel2.calculateRoot(input.action.data.round1Contribution.hash())
        )

        return {
          newContributionRoot: contributionRoot,
          newRollupState: root,
          counter: earlierProof.publicOutput.counter.add(1),
        };
      },
    },
  }
})

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
