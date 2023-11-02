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
  MerkleMapWitness,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
  MerkleTree,
  MerkleWitness,
  Provable,
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

class GroupDynamicArray extends Utils.GroupDynamicArray(32) {}

export const enum KeyStatus {
  EMPTY,
  ROUND_1_CONTRIBUTION,
  ROUND_2_CONTRIBUTION,
  ACTIVE,
  DEPRECATED,
}

export const enum RequestStatus {
  EMPTY,
  CONTRIBUTION,
  COMPLETED,
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

export const enum EventEnum {
  GENERATE_KEY,
  DEPRECATE_KEY,
  SUBMIT_ROUND_1_CONTRIBUTION,
  SUBMIT_ROUND_2_CONTRIBUTION,
  SUBMIT_TALLY_CONTRIBUTION,
  KEY_GENERATED,
  KEY_DEPRECATED,
  ROUND_1_FINALIZED,
  ROUND_2_FINALIZED,
  TALLY_FINALIZED,
}

export class ActionMask extends Utils.DynamicArray(Bool, ActionEnum.__LENGTH) { }

export const ACTION_MASKS = {
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
  'EMPTY': ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) => Bool(false))
  ),
};


/**
 * Class of actions dispatched by users
 * @param mask Specify action type (defined with ActionEnum)
 * @param committeeId Incremental committee index
 * @param keyId Incremental key index of a committee
 * @param memberId Incremental member index of a committee
 * @param round1Contribution Round 1 contribution in the key generation process
 * @param round2Contribution Round 2 contribution in the key generation process
 * @param tallyContribution Tally contribution in the key usage process
 * @function hash Return the action's hash to append in the action state hash chain
 * @function toFields Return the action in the form of Fields[]
 */
export class Action extends Struct({
  mask: ActionMask,
  committeeId: Field,
  keyId: Field,
  memberId: Field,
  round1Contribution: DKG.Committee.Round1Contribution,
  round2Contribution: DKG.Committee.Round2Contribution,
  tallyContribution: DKG.Committee.TallyContribution,
}) {
  static empty(): Action {
    return new Action({
      mask: ACTION_MASKS.EMPTY,
      committeeId: Field(0),
      keyId: Field(0),
      memberId: Field(0),
      round1Contribution: DKG.Committee.Round1Contribution.empty(),
      round2Contribution: DKG.Committee.Round2Contribution.empty(),
      tallyContribution: DKG.Committee.TallyContribution.empty(),
    })
  }
  hash(): Field {
    return Poseidon.hash(this.toFields());
  }

  toFields(): Field[] {
    return [this.mask.length].concat(this.mask.toFields())
      .concat([this.committeeId, this.keyId, this.memberId])
      .concat(this.round1Contribution.toFields())
      .concat(this.round2Contribution.toFields())
      .concat(this.tallyContribution.toFields()).flat();
  }
}

export class GenerateKeyEvent extends Struct({
  committeeId: Field,
  sender: Field,
}) {}

export class DeprecateKeyEvent extends Struct({
  committeeId: Field,
  keyId: Field,
  memberId: Field,
}) {}

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
        reduceWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();
        
        // Check consistency of the initial values
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [input.action.toFields()]
        );

        // Check the non-existence of the action
        let [root, key] = reduceWitness.computeRootAndKey(Field(ActionStatus.NOT_EXISTED));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionState);

        // Check the new tree contains the reduced action
        [root] = reduceWitness.computeRootAndKey(Field(ActionStatus.REDUCED));

        return {
          newActionState: actionState,
          newRollupState: root,
        };
      },
    },
  },
});

export class KeyUpdateInput extends Struct({
  initialKeyStatus: Field,
  initialRollupState: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class KeyUpdateOutput extends Struct({
  newKeyStatus: Field,
  newRollupState: Field,
}) {}

export const GenerateKey = Experimental.ZkProgram({
  publicInput: KeyUpdateInput,
  publicOutput: KeyUpdateOutput,
  methods: {
    firstStep: {
      privateInputs: [],
      method(input: KeyUpdateInput) {
        return {
          newKeyStatus: input.initialKeyStatus,
          newRollupState: input.initialRollupState,
        }
      }
    },
    nextStep: {
      privateInputs: [
        SelfProof<KeyUpdateInput, KeyUpdateOutput>,
        MerkleMapWitness,
        MerkleMapWitness,
      ],
      method(
        input: KeyUpdateInput,
        earlierProof: SelfProof<KeyUpdateInput, KeyUpdateOutput>,
        keyStatusWitness: MerkleMapWitness,
        rollupWitness: MerkleMapWitness,
      ) {
        // Verify earlier proof
        earlierProof.verify();
        
        // Check consistency of the initial values
        input.initialKeyStatus.assertEquals(
          earlierProof.publicInput.initialKeyStatus
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Check if the key is empty
        let keyIndex = Poseidon.hash([input.action.committeeId, input.action.keyId]);
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.EMPTY));
        keyStatus.assertEquals(input.initialKeyStatus);
        keyStatusIndex.assertEquals(keyIndex);

        // Calculate the new keyStatus tree root
        [keyStatus] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.ROUND_1_CONTRIBUTION));

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          input.previousActionState,
          [input.action.toFields()] 
        );

        // Check if the action was reduced and is waiting for rollup
        let [rollupRoot, rollupIndex] = rollupWitness.computeRootAndKey(Field(ActionStatus.REDUCED));
        rollupRoot.assertEquals(earlierProof.publicOutput.newRollupState);
        rollupIndex.assertEquals(actionState);

        // Calculate the new rollupState tree root
        [rollupRoot] = rollupWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        return {
          newKeyStatus: keyStatus,
          newRollupState: rollupRoot,
        }
      }
    }
  }
});

export const DeprecateKey = Experimental.ZkProgram({
  publicInput: KeyUpdateInput,
  publicOutput: KeyUpdateOutput,
  methods: {
    firstStep: {
      privateInputs: [],
      method(input: KeyUpdateInput) {
        return {
          newKeyStatus: input.initialKeyStatus,
          newRollupState: input.initialRollupState,
        }
      }
    },
    nextStep: {
      privateInputs: [
        SelfProof<KeyUpdateInput, KeyUpdateOutput>,
        MerkleMapWitness,
        MerkleMapWitness,
      ],
      method(
        input: KeyUpdateInput,
        earlierProof: SelfProof<KeyUpdateInput, KeyUpdateOutput>,
        keyStatusWitness: MerkleMapWitness,
        rollupWitness: MerkleMapWitness,
      ) {
        // Verify earlier proof
        earlierProof.verify();
        
        // Check consistency of the initial values
        input.initialKeyStatus.assertEquals(
          earlierProof.publicInput.initialKeyStatus
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Check if the key is active
        let keyIndex = Poseidon.hash([input.action.committeeId, input.action.keyId]);
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.ACTIVE));
        keyStatus.assertEquals(input.initialKeyStatus);
        keyStatusIndex.assertEquals(keyIndex);

        // Calculate the new keyStatus tree root
        [keyStatus] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.DEPRECATED));

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          input.previousActionState,
          [input.action.toFields()] 
        );

        // Check if the action was reduced and is waiting for rollup
        let [rollupRoot, rollupIndex] = rollupWitness.computeRootAndKey(Field(ActionStatus.REDUCED));
        rollupRoot.assertEquals(earlierProof.publicOutput.newRollupState);
        rollupIndex.assertEquals(actionState);

        // Calculate the new rollupState tree root
        [rollupRoot] = rollupWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        return {
          newKeyStatus: keyStatus,
          newRollupState: rollupRoot,
        }
      }
    }
  }
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
          input.action.committeeId,
          input.action.keyId,
        ])
        // Current value of the action hash should be 1
        let [root, key] = rollupedWitness.computeRootAndKey(Field(ActionStatus.REDUCED));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionHash);
        // New value of the action hash should be 2
        [root] = rollupedWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        // Check the selected key is in round 1 contribution period
        let [keysRoot, keysIndex] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.ROUND_1_CONTRIBUTION));
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
          contributionWitnessLevel2.calculateRoot(input.action.round1Contribution.hash())
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

export class Round2Input extends Struct({
  T: Field,
  N: Field,
  keyRoot: Field,
  initialContributionRoot: Field,
  initialRollupState: Field,
  action: Action,
  memberIndex: Field,
  publicKeys: GroupDynamicArray,
}) {}

export class Round2Output extends Struct({
  newContributionRoot: Field,
  newRollupState: Field,
  counter: Field,
}) {}

export class DKGContract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.GENERATE_KEY]: Action,
    
  }

  @state(Field) actionState = State<Field>();
  @state(Field) rollupState = State<Field>();

  @state(Field) keyStatus = State<Field>();
  @state(Field) round1Contribution = State<Field>();
  @state(Field) round2Contribution = State<Field>();
  @state(Field) requestStatus = State<Field>();
  @state(Field) tallyContribution = State<Field>();

  @method generateKey(committeeId: Field, keyId: Field, memberId: Field) {
    // TODO - Check if sender has the correct index in the committee

    // Dispatch key generation actions
    this.reducer.dispatch(
      new Action({
        mask: ACTION_MASKS[ActionEnum.KEY_GENERATION],
        committeeId: committeeId,
        keyId: keyId,
        memberId: memberId,
        round1Contribution: DKG.Committee.Round1Contribution.empty(),
        round2Contribution: DKG.Committee.Round2Contribution.empty(),
        tallyContribution: DKG.Committee.TallyContribution.empty(),
      })
    );
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
