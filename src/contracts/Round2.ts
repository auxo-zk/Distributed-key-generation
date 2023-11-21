import {
  Field,
  method,
  Poseidon,
  Provable,
  Reducer,
  SelfProof,
  SmartContract,
  state,
  State,
  Struct,
  ZkProgram,
} from 'o1js';
import {
  EncryptionHashArray,
  PublicKeyArray,
  Round2Contribution,
} from '../libs/Committee.js';
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
import { BatchEncryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import {
  COMMITTEE_MAX_SIZE,
  INSTANCE_LIMITS,
  ZkAppEnum,
} from '../constants.js';
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
  contribution: Round2Contribution,
}) {
  static empty(): Action {
    return new Action({
      committeeId: Field(0),
      keyId: Field(0),
      memberId: Field(0),
      contribution: Round2Contribution.empty(),
    });
  }
}

export class ReduceOutput extends Struct({
  initialReduceState: Field,
  newActionState: Field,
  newReduceState: Field,
}) {}

export const ReduceRound2 = ZkProgram({
  name: 'reduce-round-2-contribution',
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

export class ReduceRound2Proof extends ZkProgram.Proof(ReduceRound2) {}

export class Round2Input extends Struct({
  previousActionState: Field,
  action: Action,
}) {}

export class Round2Output extends Struct({
  T: Field,
  N: Field,
  initialContributionRoot: Field,
  publicKeys: PublicKeyArray,
  reduceStateRoot: Field,
  newContributionRoot: Field,
  keyIndex: Field,
  counter: Field,
  ecryptionHashes: EncryptionHashArray,
}) {}

export const FinalizeRound2 = ZkProgram({
  name: 'finalize-round-2',
  publicInput: Round2Input,
  publicOutput: Round2Output,
  methods: {
    firstStep: {
      privateInputs: [
        Field,
        Field,
        Field,
        PublicKeyArray,
        Field,
        Field,
        EncryptionHashArray,
        Level1Witness,
      ],
      // initialHashArray must be filled with Field(0) with correct length
      method(
        input: Round2Input,
        T: Field,
        N: Field,
        initialContributionRoot: Field,
        publicKeys: PublicKeyArray,
        reduceStateRoot: Field,
        keyIndex: Field,
        initialHashArray: EncryptionHashArray,
        contributionWitness: Level1Witness
      ) {
        let contributionRoot = contributionWitness.calculateRoot(Field(0));
        let contributionIndex = contributionWitness.calculateIndex();
        contributionRoot.assertEquals(initialContributionRoot);
        contributionIndex.assertEquals(keyIndex);

        contributionRoot = contributionWitness.calculateRoot(
          EMPTY_LEVEL_2_TREE().getRoot()
        );

        return new Round2Output({
          T: T,
          N: N,
          initialContributionRoot: initialContributionRoot,
          publicKeys: publicKeys,
          reduceStateRoot: reduceStateRoot,
          newContributionRoot: contributionRoot,
          keyIndex: keyIndex,
          counter: Field(0),
          ecryptionHashes: initialHashArray,
        });
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<Round2Input, Round2Output>,
        BatchEncryptionProof,
        DKGWitness,
        ReduceWitness,
      ],
      method(
        input: Round2Input,
        earlierProof: SelfProof<Round2Input, Round2Output>,
        encryptionProof: BatchEncryptionProof,
        contributionWitness: DKGWitness,
        reduceWitness: ReduceWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();
        input.action.memberId.assertEquals(earlierProof.publicOutput.counter);
        input.action.contribution.c.length.assertEquals(
          earlierProof.publicOutput.N
        );
        input.action.contribution.U.length.assertEquals(
          earlierProof.publicOutput.N
        );

        // Check if the actions have the same keyIndex
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
          .mul(input.action.committeeId)
          .add(input.action.keyId);
        keyIndex.assertEquals(earlierProof.publicOutput.keyIndex);

        // Check if encryption is correct
        encryptionProof.verify();
        encryptionProof.publicInput.memberId.assertEquals(
          input.action.memberId
        );
        encryptionProof.publicInput.publicKeys
          .hash()
          .assertEquals(earlierProof.publicOutput.publicKeys.hash());
        encryptionProof.publicInput.c
          .hash()
          .assertEquals(input.action.contribution.c.hash());
        encryptionProof.publicInput.U.hash().assertEquals(
          input.action.contribution.U.hash()
        );

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

        // Update encryption hash array
        let encryptionHashes = earlierProof.publicOutput.ecryptionHashes;
        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          let hashChain = encryptionHashes.get(Field(i));
          hashChain = Provable.if(
            Field(i).greaterThanOrEqual(
              earlierProof.publicOutput.ecryptionHashes.length
            ),
            Field(0),
            Poseidon.hash(
              [
                hashChain,
                input.action.contribution.c.get(Field(i)).toFields(),
                input.action.contribution.U.get(Field(i)).toFields(),
              ].flat()
            )
          );
          encryptionHashes.set(Field(i), hashChain);
        }

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

        return new Round2Output({
          T: earlierProof.publicOutput.T,
          N: earlierProof.publicOutput.N,
          initialContributionRoot:
            earlierProof.publicOutput.initialContributionRoot,
          publicKeys: earlierProof.publicOutput.publicKeys,
          reduceStateRoot: earlierProof.publicOutput.reduceStateRoot,
          newContributionRoot: contributionRoot,
          keyIndex: keyIndex,
          counter: earlierProof.publicOutput.counter.add(Field(1)),
          ecryptionHashes: encryptionHashes,
        });
      },
    },
  },
});

export class FinalizeRound2Proof extends ZkProgram.Proof(FinalizeRound2) {}

const DefaultRoot = EMPTY_LEVEL_1_TREE().getRoot();
const DefaultReduceRoot = EMPTY_REDUCE_MT().getRoot();
export class Round2Contract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.CONTRIBUTIONS_REDUCED]: Field,
  };

  @state(Field) zkApps = State<Field>();
  @state(Field) reduceState = State<Field>();
  @state(Field) contributions = State<Field>();
  @state(Field) encryptions = State<Field>();

  init() {
    super.init();
    this.zkApps.set(DefaultRoot);
    this.reduceState.set(DefaultReduceRoot);
    this.contributions.set(DefaultRoot);
    this.encryptions.set(DefaultRoot);
  }

  @method
  verifyZkApp(zkApp: ZkAppRef, index: Field) {
    let zkApps = this.zkApps.getAndAssertEquals();
    let root = zkApp.witness.calculateRoot(
      Poseidon.hash(zkApp.address.toFields())
    );
    let id = zkApp.witness.calculateIndex();
    root.assertEquals(zkApps);
    id.assertEquals(index);
  }

  @method
  contribute(
    action: Action,
    committee: ZkAppRef,
    memberWitness: CommitteeFullWitness,
    dkg: ZkAppRef,
    keyStatusWitness: Level1Witness
  ) {
    // Verify sender's index
    this.verifyZkApp(committee, Field(ZkAppEnum.COMMITTEE));
    const committeeContract = new CommitteeContract(committee.address);
    let memberId = committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender,
        commiteeId: action.committeeId,
        memberWitness: memberWitness,
      })
    );
    memberId.assertEquals(action.memberId);

    // Verify key status
    this.verifyZkApp(dkg, Field(ZkAppEnum.DKG));
    const dkgContract = new DKGContract(dkg.address);
    dkgContract.verifyKeyStatus(
      Field.from(BigInt(INSTANCE_LIMITS.KEY))
        .mul(action.committeeId)
        .add(action.keyId),
      Field(KeyStatus.ROUND_2_CONTRIBUTION),
      keyStatusWitness
    );

    // Dispatch action
    this.reducer.dispatch(action);
  }

  @method
  reduce(proof: ReduceRound2Proof) {
    // Get current state values
    let reduceState = this.reduceState.getAndAssertEquals();
    let actionState = this.account.actionState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicOutput.initialReduceState.assertEquals(reduceState);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new states
    this.reduceState.set(proof.publicOutput.newReduceState);

    // Emit events
    this.emitEvent(EventEnum.CONTRIBUTIONS_REDUCED, actionState);
  }

  @method
  finalize(
    proof: FinalizeRound2Proof,
    encryptionWitness: Level1Witness,
    round1: ZkAppRef,
    publicKeysWitness: Level1Witness,
    committee: ZkAppRef,
    settingWitness: CommitteeLevel1Witness,
    dkg: ZkAppRef
  ) {
    // Get current state values
    let contributions = this.contributions.getAndAssertEquals();
    let encryptions = this.encryptions.getAndAssertEquals();
    let reduceState = this.reduceState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicOutput.initialContributionRoot.assertEquals(contributions);
    proof.publicOutput.reduceStateRoot.assertEquals(reduceState);
    proof.publicOutput.counter.assertEquals(proof.publicOutput.N);

    // Verify encryption hashes do not exist
    let encryptionLeaf = Provable.witness(Field, () => {
      let encryptionHashesMT = EMPTY_LEVEL_2_TREE();
      for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
        let value = Provable.if(
          Field(i).greaterThanOrEqual(
            proof.publicOutput.ecryptionHashes.length
          ),
          Field(0),
          EncryptionHashArray.hash(
            proof.publicOutput.ecryptionHashes.get(Field(i))
          )
        );
        encryptionHashesMT.setLeaf(BigInt(i), value);
      }
      return encryptionHashesMT.getRoot();
    });
    let encryptionRoot = encryptionWitness.calculateRoot(Field(0));
    let encryptionIndex = encryptionWitness.calculateIndex();
    encryptionRoot.assertEquals(encryptions);
    encryptionIndex.assertEquals(proof.publicOutput.keyIndex);

    // Calculate new encryptions root
    encryptionRoot = encryptionWitness.calculateRoot(encryptionLeaf);

    // Verify public keys
    this.verifyZkApp(round1, Field(ZkAppEnum.ROUND1));
    let publicKeysLeaf = Provable.witness(Field, () => {
      let publicKeysMT = EMPTY_LEVEL_2_TREE();
      for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
        let value = Provable.if(
          Field(i).greaterThanOrEqual(proof.publicOutput.publicKeys.length),
          Field(0),
          PublicKeyArray.hash(proof.publicOutput.publicKeys.get(Field(i)))
        );
        publicKeysMT.setLeaf(BigInt(i), value);
      }
      return publicKeysMT.getRoot();
    });

    const round1Contract = new Round1Contract(round1.address);
    let publicKeysRoot = publicKeysWitness.calculateRoot(publicKeysLeaf);
    let publicKeysIndex = publicKeysWitness.calculateIndex();
    publicKeysRoot.assertEquals(round1Contract.publicKeys.getAndAssertEquals());
    publicKeysIndex.assertEquals(proof.publicOutput.keyIndex);

    // Verify committee config
    this.verifyZkApp(committee, Field(ZkAppEnum.COMMITTEE));
    const committeeContract = new CommitteeContract(committee.address);
    committeeContract.checkConfig(
      new CheckConfigInput({
        N: proof.publicOutput.N,
        T: proof.publicOutput.T,
        commiteeId: proof.publicInput.action.committeeId,
        settingWitness: settingWitness,
      })
    );

    // Set new states
    this.contributions.set(proof.publicOutput.newContributionRoot);
    this.encryptions.set(encryptionRoot);

    // Dispatch action in DKG contract
    this.verifyZkApp(dkg, Field(ZkAppEnum.DKG));
    const dkgContract = new DKGContract(dkg.address);
    dkgContract.publicAction(
      proof.publicInput.action.committeeId,
      proof.publicInput.action.keyId,
      Field(KeyUpdateEnum.FINALIZE_ROUND_2)
    );
  }
}
