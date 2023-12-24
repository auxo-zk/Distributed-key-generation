import {
  Field,
  Group,
  Poseidon,
  Reducer,
  SelfProof,
  SmartContract,
  State,
  Struct,
  ZkProgram,
  method,
  state,
} from 'o1js';
import { CArray, Round1Contribution } from '../libs/Committee.js';
import { updateOutOfSnark } from '../libs/utils.js';
import {
  FullMTWitness as CommitteeFullWitness,
  Level1Witness as CommitteeLevel1Witness,
} from './CommitteeStorage.js';
import {
  FullMTWitness as DKGWitness,
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE,
  Level1Witness,
} from './DKGStorage.js';
import {
  CheckConfigInput,
  CheckMemberInput,
  CommitteeContract,
} from './Committee.js';
import { ActionEnum as KeyUpdateEnum, DKGContract, KeyStatus } from './DKG.js';
import { INSTANCE_LIMITS, ZkAppEnum } from '../constants.js';
import { EMPTY_REDUCE_MT, ReduceWitness, ZkAppRef } from './SharedStorage.js';

export enum EventEnum {
  CONTRIBUTIONS_REDUCED = 'contributions-reduced',
}

export enum ActionStatus {
  NOT_EXISTED,
  REDUCED,
}

export class Action extends Struct({
  committeeId: Field,
  keyId: Field,
  memberId: Field,
  contribution: Round1Contribution,
}) {
  static empty(): Action {
    return new Action({
      committeeId: Field(0),
      keyId: Field(0),
      memberId: Field(0),
      contribution: Round1Contribution.empty(),
    });
  }
}

export class ReduceOutput extends Struct({
  initialReduceState: Field,
  newActionState: Field,
  newReduceState: Field,
}) {}

export const ReduceRound1 = ZkProgram({
  name: 'reduce-round-1-contribution',
  publicInput: Action,
  publicOutput: ReduceOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field],
      method(
        input: Action,
        initialReduceState: Field,
        initialActionState: Field
      ) {
        return new ReduceOutput({
          initialReduceState: initialReduceState,
          newActionState: initialActionState,
          newReduceState: initialReduceState,
        });
      },
    },
    nextStep: {
      privateInputs: [SelfProof<Action, ReduceOutput>, ReduceWitness],
      method(
        input: Action,
        earlierProof: SelfProof<Action, ReduceOutput>,
        reduceWitness: ReduceWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [Action.toFields(input)]
        );

        // Check the non-existence of the action
        let [root, key] = reduceWitness.computeRootAndKey(
          Field(ActionStatus.NOT_EXISTED)
        );
        root.assertEquals(earlierProof.publicOutput.newReduceState);
        key.assertEquals(actionState);

        // Check the new tree contains the reduced action
        [root] = reduceWitness.computeRootAndKey(Field(ActionStatus.REDUCED));

        return new ReduceOutput({
          initialReduceState: earlierProof.publicOutput.initialReduceState,
          newActionState: actionState,
          newReduceState: root,
        });
      },
    },
  },
});

export class ReduceRound1Proof extends ZkProgram.Proof(ReduceRound1) {}

export class Round1Input extends Struct({
  previousActionState: Field,
  action: Action,
}) {}

/**
 *
 */
export class Round1Output extends Struct({
  T: Field,
  N: Field,
  initialContributionRoot: Field,
  initialPublicKeyRoot: Field,
  reduceStateRoot: Field,
  newContributionRoot: Field,
  newPublicKeyRoot: Field,
  keyIndex: Field,
  publicKey: Group,
  counter: Field,
}) {}

export const FinalizeRound1 = ZkProgram({
  name: 'finalize-round-1',
  publicInput: Round1Input,
  publicOutput: Round1Output,
  methods: {
    firstStep: {
      privateInputs: [
        Field,
        Field,
        Field,
        Field,
        Field,
        Field,
        Level1Witness,
        Level1Witness,
      ],
      method(
        input: Round1Input,
        T: Field,
        N: Field,
        initialContributionRoot: Field,
        initialPublicKeyRoot: Field,
        reduceStateRoot: Field,
        keyIndex: Field,
        contributionWitness: Level1Witness,
        publicKeyWitness: Level1Witness
      ) {
        let contributionRoot = contributionWitness.calculateRoot(Field(0));
        let contributionIndex = contributionWitness.calculateIndex();
        contributionRoot.assertEquals(initialContributionRoot);
        contributionIndex.assertEquals(keyIndex);

        contributionRoot = contributionWitness.calculateRoot(
          EMPTY_LEVEL_2_TREE().getRoot()
        );

        let publicKeyRoot = publicKeyWitness.calculateRoot(Field(0));
        let publicKeyIndex = publicKeyWitness.calculateIndex();
        publicKeyRoot.assertEquals(initialPublicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        publicKeyRoot = publicKeyWitness.calculateRoot(
          EMPTY_LEVEL_2_TREE().getRoot()
        );

        return new Round1Output({
          T: T,
          N: N,
          initialContributionRoot: initialContributionRoot,
          initialPublicKeyRoot: initialPublicKeyRoot,
          reduceStateRoot: reduceStateRoot,
          newContributionRoot: contributionRoot,
          newPublicKeyRoot: publicKeyRoot,
          keyIndex: keyIndex,
          publicKey: Group.zero,
          counter: Field(0),
        });
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<Round1Input, Round1Output>,
        DKGWitness,
        DKGWitness,
        ReduceWitness,
      ],
      method(
        input: Round1Input,
        earlierProof: SelfProof<Round1Input, Round1Output>,
        contributionWitness: DKGWitness,
        publicKeyWitness: DKGWitness,
        reduceWitness: ReduceWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();
        input.action.contribution.C.length.assertEquals(
          earlierProof.publicOutput.T
        );

        // Check if the actions have the same keyIndex
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
          .mul(input.action.committeeId)
          .add(input.action.keyId);
        keyIndex.assertEquals(earlierProof.publicOutput.keyIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let contributionRoot = contributionWitness.level1.calculateRoot(
          contributionWitness.level2.calculateRoot(Field(0))
        );
        let contributionIndex = contributionWitness.level1.calculateIndex();
        contributionRoot.assertEquals(
          earlierProof.publicOutput.newContributionRoot
        );
        contributionIndex.assertEquals(keyIndex);

        // Compute new contribution root
        contributionRoot = contributionWitness.level1.calculateRoot(
          contributionWitness.level2.calculateRoot(
            input.action.contribution.hash()
          )
        );

        // Check if this member's public key has not been registered
        publicKeyWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let publicKeyRoot = publicKeyWitness.level1.calculateRoot(
          publicKeyWitness.level2.calculateRoot(Field(0))
        );
        let publicKeyIndex = publicKeyWitness.level1.calculateIndex();
        publicKeyRoot.assertEquals(earlierProof.publicOutput.newPublicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Compute new public key root
        let memberPublicKey = input.action.contribution.C.values[0];
        publicKeyRoot = contributionWitness.level1.calculateRoot(
          publicKeyWitness.level2.calculateRoot(
            Poseidon.hash(memberPublicKey.toFields())
          )
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(input.previousActionState, [
          Action.toFields(input.action),
        ]);

        // Current value of the action hash should be 1
        let [root, key] = reduceWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        root.assertEquals(earlierProof.publicOutput.reduceStateRoot);
        key.assertEquals(actionState);

        return new Round1Output({
          T: earlierProof.publicOutput.T,
          N: earlierProof.publicOutput.N,
          initialContributionRoot:
            earlierProof.publicOutput.initialContributionRoot,
          initialPublicKeyRoot: earlierProof.publicOutput.initialPublicKeyRoot,
          reduceStateRoot: earlierProof.publicOutput.reduceStateRoot,
          newContributionRoot: contributionRoot,
          newPublicKeyRoot: publicKeyRoot,
          keyIndex: keyIndex,
          publicKey: earlierProof.publicOutput.publicKey.add(memberPublicKey),
          counter: earlierProof.publicOutput.counter.add(Field(1)),
        });
      },
    },
  },
});

export class FinalizeRound1Proof extends ZkProgram.Proof(FinalizeRound1) {}

const DefaultRoot1 = EMPTY_LEVEL_1_TREE().getRoot();
const DefaultReduceRoot = EMPTY_REDUCE_MT().getRoot();
export class Round1Contract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.CONTRIBUTIONS_REDUCED]: Field,
  };

  @state(Field) zkApps = State<Field>();
  @state(Field) reduceState = State<Field>();
  @state(Field) contributions = State<Field>();
  @state(Field) publicKeys = State<Field>();

  init() {
    super.init();
    this.zkApps.set(DefaultRoot1);
    this.reduceState.set(DefaultReduceRoot);
    this.contributions.set(DefaultRoot1);
    this.publicKeys.set(DefaultRoot1);
  }

  /**
   * Submit round 1 contribution for key generation
   * - Verify zkApp references
   * - Verify committee member
   * - Verify contribution
   * - Create & dispatch action
   * @param action
   * @param committee
   * @param memberWitness
   */
  @method
  contribute(
    committeeId: Field,
    keyId: Field,
    C: CArray,
    committee: ZkAppRef,
    memberWitness: CommitteeFullWitness
  ) {
    // Verify zkApp references
    let zkApps = this.zkApps.getAndRequireEquals();

    // CommitteeContract
    zkApps.assertEquals(
      committee.witness.calculateRoot(
        Poseidon.hash(committee.address.toFields())
      )
    );
    Field(ZkAppEnum.COMMITTEE).assertEquals(committee.witness.calculateIndex());

    const committeeContract = new CommitteeContract(committee.address);

    // Verify committee member - FIXME check if using this.sender is secure
    let memberId = committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender,
        commiteeId: committeeId,
        memberWitness: memberWitness,
      })
    );

    // Create & dispatch action to DKGContract
    let action = new Action({
      committeeId: committeeId,
      keyId: keyId,
      memberId: memberId,
      contribution: new Round1Contribution({
        C: C,
      }),
    });
    this.reducer.dispatch(action);
  }

  @method
  reduce(proof: ReduceRound1Proof) {
    // Get current state values
    let reduceState = this.reduceState.getAndRequireEquals();
    let actionState = this.account.actionState.getAndRequireEquals();

    // Verify proof
    proof.verify();
    proof.publicOutput.initialReduceState.assertEquals(reduceState);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new states
    this.reduceState.set(proof.publicOutput.newReduceState);

    // Emit events
    this.emitEvent(EventEnum.CONTRIBUTIONS_REDUCED, actionState);
  }

  /**
   * Finalize round 2 with N members' contribution
   * - Get current state values
   * - Verify zkApp references
   * - Verify finalize proof
   * - Verify committee config
   * - Verify key status
   * - Set new states
   * - Create & dispatch action to DKGContract
   * @param proof
   * @param committee
   * @param settingWitness
   * @param dkg
   * @param keyStatusWitness
   */
  @method
  finalize(
    proof: FinalizeRound1Proof,
    committee: ZkAppRef,
    dkg: ZkAppRef,
    settingWitness: CommitteeLevel1Witness,
    keyStatusWitness: Level1Witness
  ) {
    // Get current state values
    let zkApps = this.zkApps.getAndRequireEquals();
    let contributions = this.contributions.getAndRequireEquals();
    let publicKeys = this.publicKeys.getAndRequireEquals();
    let reduceState = this.reduceState.getAndRequireEquals();

    // Verify zkApp references
    // CommitteeContract
    zkApps.assertEquals(
      committee.witness.calculateRoot(
        Poseidon.hash(committee.address.toFields())
      )
    );
    Field(ZkAppEnum.COMMITTEE).assertEquals(committee.witness.calculateIndex());

    // DKGContract
    zkApps.assertEquals(
      dkg.witness.calculateRoot(Poseidon.hash(dkg.address.toFields()))
    );
    Field(ZkAppEnum.DKG).assertEquals(dkg.witness.calculateIndex());

    const committeeContract = new CommitteeContract(committee.address);
    const dkgContract = new DKGContract(dkg.address);

    // Verify finalize proof
    proof.verify();
    proof.publicOutput.initialContributionRoot.assertEquals(contributions);
    proof.publicOutput.initialPublicKeyRoot.assertEquals(publicKeys);
    proof.publicOutput.reduceStateRoot.assertEquals(reduceState);
    proof.publicOutput.counter.assertEquals(proof.publicOutput.N);

    // Verify committee config
    committeeContract.checkConfig(
      new CheckConfigInput({
        N: proof.publicOutput.N,
        T: proof.publicOutput.T,
        commiteeId: proof.publicInput.action.committeeId,
        settingWitness: settingWitness,
      })
    );

    // Verify key status
    let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
      .mul(proof.publicInput.action.committeeId)
      .add(proof.publicInput.action.keyId);
    dkgContract.keyStatus
      .getAndRequireEquals()
      .assertEquals(
        keyStatusWitness.calculateRoot(Field(KeyStatus.ROUND_1_CONTRIBUTION))
      );
    keyIndex.assertEquals(keyStatusWitness.calculateIndex());

    // Set new states
    this.contributions.set(proof.publicOutput.newContributionRoot);
    this.publicKeys.set(proof.publicOutput.newPublicKeyRoot);

    // Create & dispatch action to DKGContract
    dkgContract.publicAction(
      proof.publicInput.action.committeeId,
      proof.publicInput.action.keyId,
      Field(KeyUpdateEnum.FINALIZE_ROUND_1)
    );
  }
}
