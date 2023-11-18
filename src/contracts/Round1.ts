import {
  Field,
  Group,
  MerkleMapWitness,
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
import { Round1Contribution } from '../libs/Committee.js';
import { ZkAppRef } from '../libs/ZkAppRef.js';
import { updateOutOfSnark } from '../libs/utils.js';
import { FullMTWitness as CommitteeWitness } from './CommitteeStorage.js';
import { FullMTWitness as DKGWitness } from './DKGStorage.js';
import {
  CheckConfigInput,
  CheckMemberInput,
  CommitteeContract,
} from './Committee.js';
import { ActionEnum as KeyUpdateEnum, DKGContract, KeyStatus } from './DKG.js';
import { ZK_APP } from '../constants.js';

export enum EventEnum {
  CONTRIBUTIONS_REDUCED,
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
}) {}

export class ReduceInput extends Struct({
  initialReduceState: Field,
  action: Action,
}) {}

export class ReduceOutput extends Struct({
  newActionState: Field,
  newReduceState: Field,
}) {}

export const ReduceRound1 = ZkProgram({
  name: 'reduce-round-1-contribution',
  publicInput: ReduceInput,
  publicOutput: ReduceOutput,
  methods: {
    firstStep: {
      privateInputs: [Field],
      method(input: ReduceInput, initialActionState: Field) {
        return new ReduceOutput({
          newActionState: initialActionState,
          newReduceState: input.initialReduceState,
        });
      },
    },
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
        input.initialReduceState.assertEquals(
          earlierProof.publicInput.initialReduceState
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [Action.toFields(input.action)]
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
          newActionState: actionState,
          newReduceState: root,
        });
      },
    },
  },
});

export class ReduceRound1Proof extends ZkProgram.Proof(ReduceRound1) {}

export class Round1Input extends Struct({
  T: Field,
  N: Field,
  initialContributionRoot: Field,
  initialPublicKeyRoot: Field,
  reduceStateRoot: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class Round1Output extends Struct({
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
      privateInputs: [Field],
      method(input: Round1Input, keyIndex: Field) {
        return new Round1Output({
          newContributionRoot: input.initialContributionRoot,
          newPublicKeyRoot: input.initialPublicKeyRoot,
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
        MerkleMapWitness,
      ],
      method(
        input: Round1Input,
        earlierProof: SelfProof<Round1Input, Round1Output>,
        contributionWitness: DKGWitness,
        publicKeyWitness: DKGWitness,
        reduceWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check consistency of the initial values
        input.T.assertEquals(earlierProof.publicInput.T);
        input.N.assertEquals(earlierProof.publicInput.N);
        input.initialContributionRoot.assertEquals(
          earlierProof.publicInput.initialContributionRoot
        );
        input.initialPublicKeyRoot.assertEquals(
          earlierProof.publicInput.initialPublicKeyRoot
        );
        input.reduceStateRoot.assertEquals(
          earlierProof.publicInput.reduceStateRoot
        );
        input.action.memberId.assertEquals(earlierProof.publicOutput.counter);
        input.action.contribution.C.length.assertEquals(input.N);

        // Calculate key index in MT
        // Check if the actions have the same keyIndex
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);
        keyIndex.assertEquals(earlierProof.publicOutput.keyIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] =
          contributionWitness.level1.computeRootAndKey(
            contributionWitness.level2.calculateRoot(Field(0))
          );
        contributionRoot.assertEquals(
          earlierProof.publicOutput.newContributionRoot
        );
        contributionIndex.assertEquals(keyIndex);

        // Compute new contribution root
        [contributionRoot] = contributionWitness.level1.computeRootAndKey(
          contributionWitness.level2.calculateRoot(
            input.action.contribution.hash()
          )
        );

        // Check if this member's public key has not been registered
        publicKeyWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [publicKeyRoot, publicKeyIndex] =
          publicKeyWitness.level1.computeRootAndKey(
            publicKeyWitness.level2.calculateRoot(Field(0))
          );
        publicKeyRoot.assertEquals(earlierProof.publicOutput.newPublicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Compute new public key root
        let memberPublicKey = input.action.contribution.C.values[0];
        [publicKeyRoot] = contributionWitness.level1.computeRootAndKey(
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
        root.assertEquals(earlierProof.publicInput.reduceStateRoot);
        key.assertEquals(actionState);

        return new Round1Output({
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

export class Round1Contract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.CONTRIBUTIONS_REDUCED]: Field,
  };

  @state(Field) zkApps = State<Field>();
  @state(Field) reduceState = State<Field>();
  @state(Field) contributions = State<Field>();
  @state(Field) publicKeys = State<Field>();

  @method
  verifyZkApp(zkApp: ZkAppRef, index: Field) {
    let zkApps = this.zkApps.getAndAssertEquals();
    let [root, id] = zkApp.witness.computeRootAndKey(
      Poseidon.hash(zkApp.address.toFields())
    );
    root.assertEquals(zkApps);
    id.assertEquals(index);
  }

  @method
  contribute(
    action: Action,
    committee: ZkAppRef,
    memberWitness: CommitteeWitness,
    dkg: ZkAppRef,
    keyStatusWitness: MerkleMapWitness
  ) {
    // Verify sender's index
    this.verifyZkApp(committee, ZK_APP.COMMITTEE);
    const committeeContract = new CommitteeContract(committee.address);
    let memberId = committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender,
        commiteeId: action.committeeId,
        memberMerkleTreeWitness: memberWitness.level2,
        memberMerkleMapWitness: memberWitness.level1,
      })
    );
    memberId.assertEquals(action.memberId);

    // Verify key status
    this.verifyZkApp(dkg, ZK_APP.DKG);
    const dkgContract = new DKGContract(dkg.address);
    dkgContract.verifyKeyStatus(
      Poseidon.hash([action.committeeId, action.keyId]),
      Field(KeyStatus.ROUND_1_CONTRIBUTION),
      keyStatusWitness
    );

    // Dispatch action
    this.reducer.dispatch(action);
  }

  @method
  reduce(proof: ReduceRound1Proof) {
    // Get current state values
    let reduceState = this.reduceState.getAndAssertEquals();
    let actionState = this.account.actionState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialReduceState.assertEquals(reduceState);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new states
    this.reduceState.set(proof.publicOutput.newReduceState);

    // Emit events
    this.emitEvent(EventEnum.CONTRIBUTIONS_REDUCED, actionState);
  }

  @method
  finalize(
    proof: FinalizeRound1Proof,
    committee: ZkAppRef,
    settingWitness: MerkleMapWitness,
    dkg: ZkAppRef
  ) {
    // Get current state values
    let contributions = this.contributions.getAndAssertEquals();
    let publicKeys = this.publicKeys.getAndAssertEquals();
    let reduceState = this.reduceState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialContributionRoot.assertEquals(contributions);
    proof.publicInput.initialPublicKeyRoot.assertEquals(publicKeys);
    proof.publicInput.reduceStateRoot.assertEquals(reduceState);
    proof.publicOutput.counter.assertEquals(proof.publicInput.N);

    // Verify committee config
    this.verifyZkApp(committee, ZK_APP.COMMITTEE);
    const committeeContract = new CommitteeContract(committee.address);
    committeeContract.checkConfig(
      new CheckConfigInput({
        N: proof.publicInput.N,
        T: proof.publicInput.T,
        commiteeId: proof.publicInput.action.committeeId,
        settingMerkleMapWitness: settingWitness,
      })
    );

    // Set new states
    this.contributions.set(proof.publicOutput.newContributionRoot);
    this.publicKeys.set(proof.publicOutput.newPublicKeyRoot);

    // Dispatch action in DKG contract
    this.verifyZkApp(dkg, ZK_APP.DKG);
    const dkgContract = new DKGContract(dkg.address);
    dkgContract.publicAction(
      proof.publicInput.action.committeeId,
      proof.publicInput.action.keyId,
      Field(KeyUpdateEnum.FINALIZE_ROUND_1)
    );
  }
}
