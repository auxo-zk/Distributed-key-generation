import {
  Field,
  MerkleMapWitness,
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
import { GroupDynamicArray } from '@auxo-dev/auxo-libs';
import { EncryptionHashArray, Round2Contribution } from '../libs/Committee.js';
import { ZkAppRef } from '../libs/ZkAppRef.js';
import { updateOutOfSnark } from '../libs/utils.js';
import { FullMTWitness as CommitteeWitness } from './CommitteeStorage.js';
import {
  FullMTWitness as DKGWitness,
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE,
} from './DKGStorage.js';
import {
  CheckConfigInput,
  CheckMemberInput,
  CommitteeContract,
} from './Committee.js';
import { ActionEnum as KeyUpdateEnum, DKGContract, KeyStatus } from './DKG.js';
import { BatchEncryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { COMMITTEE_MAX_SIZE, ZK_APP } from '../constants.js';

export class PublicKeyArray extends GroupDynamicArray(COMMITTEE_MAX_SIZE) {}

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

export class ReduceInput extends Struct({
  initialReduceState: Field,
  action: Action,
}) {}

export class ReduceOutput extends Struct({
  newActionState: Field,
  newReduceState: Field,
}) {}

export const ReduceRound2 = ZkProgram({
  name: 'reduce-round-2-contribution',
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

export class ReduceRound2Proof extends ZkProgram.Proof(ReduceRound2) {}

export class Round2Input extends Struct({
  T: Field,
  N: Field,
  initialContributionRoot: Field,
  publicKeys: PublicKeyArray,
  reduceStateRoot: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class Round2Output extends Struct({
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
      privateInputs: [Field, EncryptionHashArray],
      // initialHashArray must be filled with Field(0) with correct length
      method(
        input: Round2Input,
        keyIndex: Field,
        initialHashArray: EncryptionHashArray
      ) {
        return new Round2Output({
          newContributionRoot: input.initialContributionRoot,
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
        MerkleMapWitness,
      ],
      method(
        input: Round2Input,
        earlierProof: SelfProof<Round2Input, Round2Output>,
        encryptionProof: BatchEncryptionProof,
        contributionWitness: DKGWitness,
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
        input.publicKeys
          .hash()
          .assertEquals(earlierProof.publicInput.publicKeys.hash());
        input.reduceStateRoot.assertEquals(
          earlierProof.publicInput.reduceStateRoot
        );
        input.action.memberId.assertEquals(earlierProof.publicOutput.counter);
        input.action.contribution.c.length.assertEquals(input.N);
        input.action.contribution.U.length.assertEquals(input.N);

        // Calculate key index in MT
        // Check if the actions have the same keyIndex
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);
        keyIndex.assertEquals(earlierProof.publicOutput.keyIndex);

        // Check if encryption is correct
        encryptionProof.verify();
        encryptionProof.publicInput.memberId.assertEquals(
          input.action.memberId
        );
        encryptionProof.publicInput.publicKeys
          .hash()
          .assertEquals(input.publicKeys.hash());
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
        root.assertEquals(earlierProof.publicInput.reduceStateRoot);
        key.assertEquals(actionState);

        return new Round2Output({
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
    this.reduceState.set(DefaultRoot);
    this.contributions.set(DefaultRoot);
    this.encryptions.set(DefaultRoot);
  }

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
    proof.publicInput.initialReduceState.assertEquals(reduceState);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new states
    this.reduceState.set(proof.publicOutput.newReduceState);

    // Emit events
    this.emitEvent(EventEnum.CONTRIBUTIONS_REDUCED, actionState);
  }

  @method
  finalize(
    proof: FinalizeRound2Proof,
    encryptionWitness: MerkleMapWitness,
    round1: ZkAppRef,
    publicKeysWitness: MerkleMapWitness,
    committee: ZkAppRef,
    settingWitness: MerkleMapWitness,
    dkg: ZkAppRef
  ) {
    // Get current state values
    let contributions = this.contributions.getAndAssertEquals();
    let encryptions = this.encryptions.getAndAssertEquals();
    let reduceState = this.reduceState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialContributionRoot.assertEquals(contributions);
    proof.publicInput.reduceStateRoot.assertEquals(reduceState);
    proof.publicOutput.counter.assertEquals(proof.publicInput.N);

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
    let [encryptionRoot, encryptionIndex] = encryptionWitness.computeRootAndKey(
      Field(0)
    );
    encryptionRoot.assertEquals(encryptions);
    encryptionIndex.assertEquals(proof.publicOutput.keyIndex);

    // Calculate new encryptions root
    [encryptionRoot] = encryptionWitness.computeRootAndKey(encryptionLeaf);

    // Verify public keys
    this.verifyZkApp(round1, ZK_APP.ROUND_1);
    let publicKeysLeaf = Provable.witness(Field, () => {
      let publicKeysMT = EMPTY_LEVEL_2_TREE();
      for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
        let value = Provable.if(
          Field(i).greaterThanOrEqual(proof.publicInput.publicKeys.length),
          Field(0),
          PublicKeyArray.hash(proof.publicInput.publicKeys.get(Field(i)))
        );
        publicKeysMT.setLeaf(BigInt(i), value);
      }
      return publicKeysMT.getRoot();
    });
    const round1Contract = new Round1Contract(round1.address);
    let publicKeysRoot = round1Contract.publicKeys.getAndAssertEquals();
    let [root, index] = publicKeysWitness.computeRootAndKey(publicKeysLeaf);
    root.assertEquals(publicKeysRoot);
    index.assertEquals(proof.publicOutput.keyIndex);

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
    this.encryptions.set(encryptionRoot);

    // Dispatch action in DKG contract
    this.verifyZkApp(dkg, ZK_APP.DKG);
    const dkgContract = new DKGContract(dkg.address);
    dkgContract.publicAction(
      proof.publicInput.action.committeeId,
      proof.publicInput.action.keyId,
      Field(KeyUpdateEnum.FINALIZE_ROUND_2)
    );
  }
}
