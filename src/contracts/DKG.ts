import {
  Bool,
  Encoding,
  Experimental,
  Field,
  Group,
  method,
  MerkleMapWitness,
  MerkleTree,
  MerkleWitness,
  Poseidon,
  Provable,
  PublicKey,
  Reducer,
  SmartContract,
  state,
  State,
  Struct,
  SelfProof,
} from 'o1js';
import { DKG, Utils } from '@auxo-dev/dkg-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import { EncryptionProof, DecryptionProof } from './Encryption.js';
import {
  CheckConfigInput,
  CheckMemberInput,
  Committee,
  CommitteeMerkleWitness,
} from './Committee.js';

export class OtherZkApp extends Struct({
  address: PublicKey,
  witness: MerkleMapWitness,
}) {}
export const ZK_APP = {
  COMMITTEE: Encoding.stringToFields('committee'),
  REQUEST: Encoding.stringToFields('request'),
};
export const CONTRIBUTION_TREE_HEIGHT = 5;
export const SUB_MT = new MerkleTree(CONTRIBUTION_TREE_HEIGHT);
export class SubMTWitness extends MerkleWitness(
  2 ** (CONTRIBUTION_TREE_HEIGHT - 1)
) {}
export class FullMTWitness extends Struct({
  level1: SubMTWitness,
  level2: MerkleMapWitness,
}) {}

class GroupDynamicArray extends Utils.GroupDynamicArray(16) {}
class PublicKeyDynamicArray extends Utils.PublicKeyDynamicArray(16) {}
class ScalarDynamicArray extends Utils.ScalarDynamicArray(16) {}
class RequestVector extends Utils.GroupDynamicArray(64) {}
class UpdatedValues extends Utils.FieldDynamicArray(64) {}

export const enum KeyStatus {
  EMPTY,
  ROUND_1_CONTRIBUTION,
  ROUND_2_CONTRIBUTION,
  ACTIVE,
  DEPRECATED,
}

export const enum ActionStatus {
  NOT_EXISTED,
  REDUCED,
  ROLLUPED,
}

export const enum ActionEnum {
  GENERATE_KEY,
  DEPRECATE_KEY,
  CONTRIBUTE_ROUND_1,
  CONTRIBUTE_ROUND_2,
  CONTRIBUTE_RESPONSE,
  __LENGTH,
}

export const enum EventEnum {
  COMMITTEE_ACTION = 'committee-action',
  REDUCE = 'reduce-actions',
  KEY_GENERATED = 'key-generated',
  KEY_DEPRECATED = 'key-deprecated',
  ROUND_1_FINALIZED = 'round-1-finalized',
  ROUND_2_FINALIZED = 'round-2-finalized',
  RESPONSE_COMPLETED = 'response-completed',
}

export class ActionMask extends Utils.BoolDynamicArray(ActionEnum.__LENGTH) {}

export const ACTION_MASKS = {
  [ActionEnum.GENERATE_KEY]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.GENERATE_KEY ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.DEPRECATE_KEY]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.DEPRECATE_KEY ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.CONTRIBUTE_ROUND_1]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.CONTRIBUTE_ROUND_1 ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.CONTRIBUTE_ROUND_2]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.CONTRIBUTE_ROUND_2 ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.CONTRIBUTE_RESPONSE]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.CONTRIBUTE_RESPONSE ? Bool(true) : Bool(false)
    )
  ),
  EMPTY: ActionMask.from(
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
 * @param responseContribution Tally contribution in the key usage process
 * @function hash Return the action's hash to append in the action state hash chain
 * @function toFields Return the action in the form of Fields[]
 */
export class Action extends Struct({
  mask: ActionMask,
  committeeId: Field,
  keyId: Field,
  memberId: Field,
  requestId: Field,
  round1Contribution: DKG.Committee.Round1Contribution,
  round2Contribution: DKG.Committee.Round2Contribution,
  responseContribution: DKG.Committee.TallyContribution,
}) {
  static empty(): Action {
    return new Action({
      mask: ACTION_MASKS.EMPTY,
      committeeId: Field(0),
      keyId: Field(0),
      memberId: Field(0),
      requestId: Field(0),
      round1Contribution: DKG.Committee.Round1Contribution.empty(),
      round2Contribution: DKG.Committee.Round2Contribution.empty(),
      responseContribution: DKG.Committee.TallyContribution.empty(),
    });
  }
  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
  toFields(): Field[] {
    return [this.mask.length]
      .concat(this.mask.toFields())
      .concat([this.committeeId, this.keyId, this.memberId, this.requestId])
      .concat(this.round1Contribution.toFields())
      .concat(this.round2Contribution.toFields())
      .concat(this.responseContribution.toFields())
      .flat();
  }
}

const ActionEvent = Action;

export class KeyGeneratedEvent extends Struct({
  keyIndexes: UpdatedValues,
}) {}

export class KeyDeprecatedEvent extends Struct({
  keyIndexes: UpdatedValues,
}) {}

export class Round1FinalizedEvent extends Struct({
  keyIndex: Field,
  publicKey: PublicKey,
}) {}

export class Round2FinalizedEvent extends Struct({
  keyIndex: Field,
}) {}

export class ResponseCompletedEvent extends Struct({
  requestIndex: Field,
  D: GroupDynamicArray,
}) {}

export class ReduceInput extends Struct({
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
      privateInputs: [Field],
      method(input: ReduceInput, initialActionState: Field) {
        // Do nothing
        return {
          newActionState: initialActionState,
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
        let [root, key] = reduceWitness.computeRootAndKey(
          Field(ActionStatus.NOT_EXISTED)
        );
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

class ReduceProof extends Experimental.ZkProgram.Proof(ReduceActions) {}

export class KeyUpdateInput extends Struct({
  initialKeyStatus: Field,
  initialRollupState: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class KeyUpdateOutput extends Struct({
  newKeyStatus: Field,
  newRollupState: Field,
  updatedKeys: UpdatedValues,
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
          updatedKeys: new UpdatedValues(),
        };
      },
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
        rollupWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check correct action type
        let checkMask = new ActionMask(
          input.action.mask
            .toFields()
            .map((e, i) =>
              Provable.if(
                Field(i).equals(Field(ActionEnum.GENERATE_KEY)),
                Bool.fromFields([e]).equals(Bool(true)),
                Bool.fromFields([e]).equals(Bool(false))
              )
            )
        );
        checkMask.includes(Bool(false)).assertFalse();

        // Check consistency of the initial values
        input.initialKeyStatus.assertEquals(
          earlierProof.publicInput.initialKeyStatus
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Check if the key is empty
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(
          Field(KeyStatus.EMPTY)
        );
        keyStatus.assertEquals(input.initialKeyStatus);
        keyStatusIndex.assertEquals(keyIndex);

        // Calculate the new keyStatus tree root
        [keyStatus] = keyStatusWitness.computeRootAndKey(
          Field(KeyStatus.ROUND_1_CONTRIBUTION)
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(input.previousActionState, [
          input.action.toFields(),
        ]);

        // Check if the action was reduced and is waiting for rollup
        let [rollupRoot, rollupIndex] = rollupWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        rollupRoot.assertEquals(earlierProof.publicOutput.newRollupState);
        rollupIndex.assertEquals(actionState);

        // Calculate the new rollupState tree root
        [rollupRoot] = rollupWitness.computeRootAndKey(
          Field(ActionStatus.ROLLUPED)
        );

        // Add updated key
        let updatedKeys = earlierProof.publicOutput.updatedKeys;
        updatedKeys.push(keyIndex);

        return {
          newKeyStatus: keyStatus,
          newRollupState: rollupRoot,
          updatedKeys: updatedKeys,
        };
      },
    },
  },
});

class GenerateKeyProof extends Experimental.ZkProgram.Proof(GenerateKey) {}

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
          updatedKeys: new UpdatedValues(),
        };
      },
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
        rollupWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check correct action type
        let checkMask = new ActionMask(
          input.action.mask
            .toFields()
            .map((e, i) =>
              Provable.if(
                Field(i).equals(Field(ActionEnum.GENERATE_KEY)),
                Bool.fromFields([e]).equals(Bool(true)),
                Bool.fromFields([e]).equals(Bool(false))
              )
            )
        );
        checkMask.includes(Bool(false)).assertFalse();

        // Check consistency of the initial values
        input.initialKeyStatus.assertEquals(
          earlierProof.publicInput.initialKeyStatus
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Check if the key is active
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(
          Field(KeyStatus.ACTIVE)
        );
        keyStatus.assertEquals(input.initialKeyStatus);
        keyStatusIndex.assertEquals(keyIndex);

        // Calculate the new keyStatus tree root
        [keyStatus] = keyStatusWitness.computeRootAndKey(
          Field(KeyStatus.DEPRECATED)
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(input.previousActionState, [
          input.action.toFields(),
        ]);

        // Check if the action was reduced and is waiting for rollup
        let [rollupRoot, rollupIndex] = rollupWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        rollupRoot.assertEquals(earlierProof.publicOutput.newRollupState);
        rollupIndex.assertEquals(actionState);

        // Calculate the new rollupState tree root
        [rollupRoot] = rollupWitness.computeRootAndKey(
          Field(ActionStatus.ROLLUPED)
        );

        // Add updated key
        let updatedKeys = earlierProof.publicOutput.updatedKeys;
        updatedKeys.push(keyIndex);

        return {
          newKeyStatus: keyStatus,
          newRollupState: rollupRoot,
          updatedKeys: updatedKeys,
        };
      },
    },
  },
});

class DeprecateKeyProof extends Experimental.ZkProgram.Proof(DeprecateKey) {}

export class Round1Input extends Struct({
  T: Field,
  N: Field,
  keyStatusRoot: Field,
  initialContributionRoot: Field,
  initialPublicKeyRoot: Field,
  initialRollupState: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class Round1Output extends Struct({
  newContributionRoot: Field,
  newPublicKeyRoot: Field,
  newRollupState: Field,
  publicKey: PublicKey,
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
          newPublicKeyRoot: input.initialPublicKeyRoot,
          newRollupState: input.initialRollupState,
          publicKey: PublicKey.fromGroup(Group.zero),
          counter: Field(0),
        };
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<Round1Input, Round1Output>,
        MerkleMapWitness,
        FullMTWitness,
        FullMTWitness,
        MerkleMapWitness,
      ],
      method(
        input: Round1Input,
        earlierProof: SelfProof<Round1Input, Round1Output>,
        keyStatusWitness: MerkleMapWitness,
        contributionWitness: FullMTWitness,
        publicKeyWitness: FullMTWitness,
        rollupWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check correct action type
        let checkMask = new ActionMask(
          input.action.mask
            .toFields()
            .map((e, i) =>
              Provable.if(
                Field(i).equals(Field(ActionEnum.GENERATE_KEY)),
                Bool.fromFields([e]).equals(Bool(true)),
                Bool.fromFields([e]).equals(Bool(false))
              )
            )
        );
        checkMask.includes(Bool(false)).assertFalse();

        // Check consistency of the initial values
        input.T.assertEquals(earlierProof.publicInput.T);
        input.N.assertEquals(earlierProof.publicInput.N);
        input.keyStatusRoot.assertEquals(
          earlierProof.publicInput.keyStatusRoot
        );
        input.initialContributionRoot.assertEquals(
          earlierProof.publicInput.initialContributionRoot
        );
        input.initialPublicKeyRoot.assertEquals(
          earlierProof.publicInput.initialPublicKeyRoot
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Calculate key index in MT
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);

        // Check the selected key is in round 1 contribution period
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(
          Field(KeyStatus.ROUND_1_CONTRIBUTION)
        );
        keyStatus.assertEquals(input.keyStatusRoot);
        keyStatusIndex.equals(keyIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level1
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] =
          contributionWitness.level2.computeRootAndKey(
            contributionWitness.level1.calculateRoot(Field(0))
          );
        contributionRoot.assertEquals(
          earlierProof.publicOutput.newContributionRoot
        );
        contributionIndex.assertEquals(keyIndex);

        // Compute new contribution root
        [contributionRoot] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(
            input.action.round1Contribution.hash()
          )
        );

        // Check if this member's public key has not been registered
        publicKeyWitness.level1
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [publicKeyRoot, publicKeyIndex] =
          publicKeyWitness.level2.computeRootAndKey(
            publicKeyWitness.level1.calculateRoot(Field(0))
          );
        publicKeyRoot.assertEquals(earlierProof.publicOutput.newPublicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Compute new public key root
        let memberPublicKey = input.action.round1Contribution.C.values[0];
        memberPublicKey.equals(Group.zero).assertFalse();
        [publicKeyRoot] = contributionWitness.level2.computeRootAndKey(
          publicKeyWitness.level1.calculateRoot(
            Poseidon.hash(memberPublicKey.toFields())
          )
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(input.previousActionState, [
          input.action.toFields(),
        ]);

        // Current value of the action hash should be 1
        let [root, key] = rollupWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionState);
        // New value of the action hash should be 2
        [root] = rollupWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        return {
          newContributionRoot: contributionRoot,
          newPublicKeyRoot: input.initialPublicKeyRoot,
          newRollupState: root,
          publicKey: PublicKey.fromGroup(
            earlierProof.publicOutput.publicKey.toGroup().add(memberPublicKey)
          ),
          counter: earlierProof.publicOutput.counter.add(1),
        };
      },
    },
  },
});

class Round1Proof extends Experimental.ZkProgram.Proof(FinalizeRound1) {}

export class Round2Input extends Struct({
  T: Field,
  N: Field,
  keyStatusRoot: Field,
  publicKeyRoot: Field,
  publicKeys: PublicKeyDynamicArray,
  initialContributionRoot: Field,
  initialRollupState: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class Round2Output extends Struct({
  newContributionRoot: Field,
  newRollupState: Field,
  counter: Field,
}) {}

export const FinalizeRound2 = Experimental.ZkProgram({
  publicInput: Round2Input,
  publicOutput: Round2Output,
  methods: {
    firstStep: {
      privateInputs: [],
      method(input: Round2Input) {
        return {
          newContributionRoot: input.initialContributionRoot,
          newRollupState: input.initialRollupState,
          counter: Field(0),
        };
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<Round2Input, Round2Output>,
        MerkleMapWitness,
        MerkleMapWitness,
        EncryptionProof,
        FullMTWitness,
        MerkleMapWitness,
      ],
      method(
        input: Round2Input,
        earlierProof: SelfProof<Round2Input, Round2Output>,
        keyStatusWitness: MerkleMapWitness,
        publicKeyWitness: MerkleMapWitness,
        encryptionProof: EncryptionProof,
        contributionWitness: FullMTWitness,
        rollupWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check correct action type
        let checkMask = new ActionMask(
          input.action.mask
            .toFields()
            .map((e, i) =>
              Provable.if(
                Field(i).equals(Field(ActionEnum.GENERATE_KEY)),
                Bool.fromFields([e]).equals(Bool(true)),
                Bool.fromFields([e]).equals(Bool(false))
              )
            )
        );
        checkMask.includes(Bool(false)).assertFalse();

        // Check consistency of the initial values
        input.T.assertEquals(earlierProof.publicInput.T);
        input.N.assertEquals(earlierProof.publicInput.N);
        input.keyStatusRoot.assertEquals(
          earlierProof.publicInput.keyStatusRoot
        );
        input.publicKeyRoot.assertEquals(
          earlierProof.publicInput.publicKeyRoot
        );
        input.initialContributionRoot.assertEquals(
          earlierProof.publicInput.initialContributionRoot
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Calculate key index in MT
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);

        // Check if encryption is correct
        encryptionProof.verify();
        encryptionProof.publicInput.memberId.assertEquals(
          input.action.memberId
        );
        encryptionProof.publicInput.publicKeys.length.assertEquals(
          input.publicKeys.length
        );
        encryptionProof.publicInput.c.length.assertEquals(
          input.action.round2Contribution.c.length
        );
        encryptionProof.publicInput.U.length.assertEquals(
          input.action.round2Contribution.U.length
        );
        for (let i = 0; i < 16; i++) {
          let iField = Field(i);
          PublicKey.fromGroup(
            encryptionProof.publicInput.publicKeys.get(iField)
          ).assertEquals(input.publicKeys.get(iField));
          encryptionProof.publicInput.c
            .get(iField)
            .equals(input.action.round2Contribution.c.get(iField))
            .assertTrue();
          encryptionProof.publicInput.U.get(iField).assertEquals(
            input.action.round2Contribution.U.get(iField)
          );
        }

        // Check if members' public keys have been registered
        let publicKeyMT = new MerkleTree(CONTRIBUTION_TREE_HEIGHT);
        for (let i = 0; i < 16; i++) {
          publicKeyMT.setLeaf(
            BigInt(i),
            Poseidon.hash(input.publicKeys.get(Field(i)).toFields())
          );
        }
        let publicKeyLeaf = Provable.witness(Field, () =>
          publicKeyMT.getRoot()
        );
        let [publicKeyRoot] = publicKeyWitness.computeRootAndKey(publicKeyLeaf);
        publicKeyRoot.assertEquals(input.publicKeyRoot);

        // Check the selected key is in round 2 contribution period
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(
          Field(KeyStatus.ROUND_2_CONTRIBUTION)
        );
        keyStatus.assertEquals(input.keyStatusRoot);
        keyStatusIndex.equals(keyIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level1
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] =
          contributionWitness.level2.computeRootAndKey(
            contributionWitness.level1.calculateRoot(Field(0))
          );
        contributionRoot.assertEquals(
          earlierProof.publicOutput.newContributionRoot
        );
        contributionIndex.assertEquals(keyIndex);

        // Compute new contribution root
        [contributionRoot] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(
            input.action.round2Contribution.hash()
          )
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(input.previousActionState, [
          input.action.toFields(),
        ]);

        // Current value of the action hash should be 1
        let [root, key] = rollupWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionState);
        // New value of the action hash should be 2
        [root] = rollupWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        return {
          newContributionRoot: contributionRoot,
          newRollupState: root,
          counter: earlierProof.publicOutput.counter.add(1),
        };
      },
    },
  },
});

class Round2Proof extends Experimental.ZkProgram.Proof(FinalizeRound2) {}

export class ResponseInput extends Struct({
  T: Field,
  N: Field,
  publicKeyRoot: Field,
  publicKey: PublicKey,
  initialContributionRoot: Field,
  initialRollupState: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class ResponseOutput extends Struct({
  newContributionRoot: Field,
  newRollupState: Field,
  D: RequestVector,
  counter: Field,
}) {}

export const CompleteResponse = Experimental.ZkProgram({
  publicInput: ResponseInput,
  publicOutput: ResponseOutput,
  methods: {
    firstStep: {
      privateInputs: [],
      method(input: ResponseInput) {
        return {
          newContributionRoot: input.initialContributionRoot,
          newRollupState: input.initialRollupState,
          D: new RequestVector(),
          counter: Field(0),
        };
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<ResponseInput, ResponseOutput>,
        FullMTWitness,
        DecryptionProof,
        FullMTWitness,
        MerkleMapWitness,
      ],
      method(
        input: ResponseInput,
        earlierProof: SelfProof<ResponseInput, ResponseOutput>,
        publicKeyWitness: FullMTWitness,
        decryptionProof: DecryptionProof,
        contributionWitness: FullMTWitness,
        rollupWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check correct action type
        let checkMask = new ActionMask(
          input.action.mask
            .toFields()
            .map((e, i) =>
              Provable.if(
                Field(i).equals(Field(ActionEnum.GENERATE_KEY)),
                Bool.fromFields([e]).equals(Bool(true)),
                Bool.fromFields([e]).equals(Bool(false))
              )
            )
        );
        checkMask.includes(Bool(false)).assertFalse();

        // Check consistency of the initial values
        input.T.assertEquals(earlierProof.publicInput.T);
        input.N.assertEquals(earlierProof.publicInput.N);
        input.publicKeyRoot.assertEquals(
          earlierProof.publicInput.publicKeyRoot
        );
        input.initialContributionRoot.assertEquals(
          earlierProof.publicInput.initialContributionRoot
        );
        input.initialRollupState.assertEquals(
          earlierProof.publicInput.initialRollupState
        );

        // Calculate key index in MT
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);
        let requestIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
          input.action.requestId,
        ]);

        // Check if decryption is correct
        decryptionProof.verify();
        decryptionProof.publicInput.memberId.assertEquals(
          input.action.memberId
        );
        decryptionProof.publicInput.publicKey.assertEquals(input.publicKey);
        decryptionProof.publicInput.c.length.assertEquals(
          input.action.round2Contribution.c.length
        );
        decryptionProof.publicInput.U.length.assertEquals(
          input.action.round2Contribution.U.length
        );
        for (let i = 0; i < 16; i++) {
          let iField = Field(i);
          decryptionProof.publicInput.c
            .get(iField)
            .equals(input.action.round2Contribution.c.get(iField))
            .assertTrue();
          decryptionProof.publicInput.U.get(iField).assertEquals(
            input.action.round2Contribution.U.get(iField)
          );
        }

        // Check if the member' public key have been registered
        let memberIndex = publicKeyWitness.level1.calculateIndex();
        memberIndex.assertEquals(input.action.memberId);
        let [publicKeyRoot, publicKeyIndex] =
          publicKeyWitness.level2.computeRootAndKey(
            Poseidon.hash(input.publicKey.toFields())
          );
        publicKeyRoot.assertEquals(input.publicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level1
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] =
          contributionWitness.level2.computeRootAndKey(
            contributionWitness.level1.calculateRoot(Field(0))
          );
        contributionRoot.assertEquals(
          earlierProof.publicOutput.newContributionRoot
        );
        contributionIndex.assertEquals(requestIndex);

        // Calculate new D value
        let D = earlierProof.publicOutput.D;
        for (let i = 0; i < 64; i++) {
          D.set(
            Field(i),
            D.get(Field(i)).add(
              input.action.responseContribution.D.get(Field(i))
            )
          );
        }

        // Compute new contribution root
        [contributionRoot] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(
            input.action.round2Contribution.hash()
          )
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(input.previousActionState, [
          input.action.toFields(),
        ]);

        // Current value of the action hash should be 1
        let [root, key] = rollupWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionState);
        // New value of the action hash should be 2
        [root] = rollupWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        return {
          newContributionRoot: contributionRoot,
          newRollupState: root,
          D: D,
          counter: earlierProof.publicOutput.counter.add(1),
        };
      },
    },
  },
});

class ResponseProof extends Experimental.ZkProgram.Proof(CompleteResponse) {}

export class DKGContract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.COMMITTEE_ACTION]: ActionEvent,
    [EventEnum.REDUCE]: Field,
    [EventEnum.KEY_GENERATED]: KeyGeneratedEvent,
    [EventEnum.KEY_DEPRECATED]: KeyDeprecatedEvent,
    [EventEnum.ROUND_1_FINALIZED]: Round1FinalizedEvent,
    [EventEnum.ROUND_2_FINALIZED]: Round2FinalizedEvent,
    [EventEnum.RESPONSE_COMPLETED]: ResponseCompletedEvent,
  };

  // Verify action state and rollup state
  @state(Field) rollupState = State<Field>();

  // Merkle tree of other zkApp address
  @state(Field) zkApps = State<Field>();

  // Merkle tree of all keys' status
  @state(Field) keyStatus = State<Field>();

  // Merkle tree of all members' public key for each key
  @state(Field) publicKey = State<Field>();

  // Merkle tree of all contributions
  @state(Field) round1Contribution = State<Field>();
  @state(Field) round2Contribution = State<Field>();
  @state(Field) responseContribution = State<Field>();

  @method committeeAction(
    action: Action,
    committee: OtherZkApp,
    memberMerkleTreeWitness: CommitteeMerkleWitness,
    memberMerkleMapWitness: MerkleMapWitness
  ) {
    // Check if committee address is correct
    let [zkAppRoot, zkAppKey] = committee.witness.computeRootAndKey(
      Poseidon.hash(committee.address.toFields())
    );
    let zkApps = this.zkApps.getAndAssertEquals();
    zkAppRoot.assertEquals(zkApps);
    zkAppKey.assertEquals(Poseidon.hash(ZK_APP.COMMITTEE));

    // Check if sender has the correct index in the committee
    const committeeContract = new Committee(committee.address);
    let memberId = committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender.toGroup(),
        commiteeId: action.committeeId,
        memberMerkleTreeWitness: memberMerkleTreeWitness,
        memberMerkleMapWitness: memberMerkleMapWitness,
      })
    );
    memberId.assertEquals(action.memberId);

    // Dispatch key generation actions
    this.reducer.dispatch(action);
    this.emitEvent(EventEnum.COMMITTEE_ACTION, new ActionEvent(action));
  }

  @method reduce(proof: ReduceProof) {
    // Get current state values
    let rollupState = this.rollupState.getAndAssertEquals();
    let actionState = this.account.actionState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialRollupState.assertEquals(rollupState);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new rollup state
    this.rollupState.set(proof.publicOutput.newRollupState);

    this.emitEvent(EventEnum.REDUCE, actionState);
  }

  @method generateKeys(proof: GenerateKeyProof) {
    // Get current state values
    let rollupState = this.rollupState.getAndAssertEquals();
    let keyStatus = this.keyStatus.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialRollupState.assertEquals(rollupState);
    proof.publicInput.initialKeyStatus.assertEquals(keyStatus);

    // Set new state values
    this.rollupState.set(proof.publicOutput.newRollupState);
    this.keyStatus.set(proof.publicOutput.newKeyStatus);

    this.emitEvent(
      EventEnum.KEY_GENERATED,
      new KeyGeneratedEvent({
        keyIndexes: proof.publicOutput.updatedKeys,
      })
    );
  }

  @method deprecateKeys(proof: DeprecateKeyProof) {
    // Get current state values
    let rollupState = this.rollupState.getAndAssertEquals();
    let keyStatus = this.keyStatus.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialRollupState.assertEquals(rollupState);
    proof.publicInput.initialKeyStatus.assertEquals(keyStatus);

    // Set new state values
    this.rollupState.set(proof.publicOutput.newRollupState);
    this.keyStatus.set(proof.publicOutput.newKeyStatus);

    this.emitEvent(
      EventEnum.KEY_DEPRECATED,
      new KeyDeprecatedEvent({
        keyIndexes: proof.publicOutput.updatedKeys,
      })
    );
  }

  @method finalizeRound1(
    proof: Round1Proof,
    committee: OtherZkApp,
    settingMerkleMapWitness: MerkleMapWitness
  ) {
    // Get current state values
    let keyStatus = this.keyStatus.getAndAssertEquals();
    let rollupState = this.rollupState.getAndAssertEquals();
    let publicKey = this.publicKey.getAndAssertEquals();
    let round1Contribution = this.round1Contribution.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.keyStatusRoot.assertEquals(keyStatus);
    proof.publicInput.initialRollupState.assertEquals(rollupState);
    proof.publicInput.initialPublicKeyRoot.assertEquals(publicKey);
    proof.publicInput.initialContributionRoot.assertEquals(round1Contribution);

    // Check if committee address is correct
    let [zkAppRoot, zkAppKey] = committee.witness.computeRootAndKey(
      Poseidon.hash(committee.address.toFields())
    );
    let zkApps = this.zkApps.getAndAssertEquals();
    zkAppRoot.assertEquals(zkApps);
    zkAppKey.assertEquals(Poseidon.hash(ZK_APP.COMMITTEE));

    // Check if the committee's setting is correct
    const committeeContract = new Committee(committee.address);
    committeeContract.checkConfig(
      new CheckConfigInput({
        n: proof.publicInput.N,
        t: proof.publicInput.T,
        // FIXME - check all contribution action belongs to the same key
        commiteeId: proof.publicInput.action.committeeId,
        settingMerkleMapWitness: settingMerkleMapWitness,
      })
    );
    proof.publicOutput.counter.equals(proof.publicInput.N);

    // Set new state values
    this.rollupState.set(proof.publicOutput.newRollupState);
    this.publicKey.set(proof.publicOutput.newPublicKeyRoot);
    this.round1Contribution.set(proof.publicOutput.newContributionRoot);

    this.emitEvent(
      EventEnum.ROUND_1_FINALIZED,
      new Round1FinalizedEvent({
        keyIndex: Poseidon.hash([
          proof.publicInput.action.committeeId,
          proof.publicInput.action.keyId,
        ]),
        publicKey: proof.publicOutput.publicKey,
      })
    );
  }

  @method finalizeRound2(
    proof: Round2Proof,
    committee: OtherZkApp,
    settingMerkleMapWitness: MerkleMapWitness
  ) {
    // Get current state values
    let keyStatus = this.keyStatus.getAndAssertEquals();
    let rollupState = this.rollupState.getAndAssertEquals();
    let publicKey = this.publicKey.getAndAssertEquals();
    let round1Contribution = this.round1Contribution.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.keyStatusRoot.assertEquals(keyStatus);
    proof.publicInput.publicKeyRoot.assertEquals(publicKey);
    proof.publicInput.initialRollupState.assertEquals(rollupState);
    proof.publicInput.initialContributionRoot.assertEquals(round1Contribution);

    // Check if committee address is correct
    let [zkAppRoot, zkAppKey] = committee.witness.computeRootAndKey(
      Poseidon.hash(committee.address.toFields())
    );
    let zkApps = this.zkApps.getAndAssertEquals();
    zkAppRoot.assertEquals(zkApps);
    zkAppKey.assertEquals(Poseidon.hash(ZK_APP.COMMITTEE));

    // Check if the committee's setting is correct
    const committeeContract = new Committee(committee.address);
    committeeContract.checkConfig(
      new CheckConfigInput({
        n: proof.publicInput.N,
        t: proof.publicInput.T,
        // FIXME - check all contribution action belongs to the same key
        commiteeId: proof.publicInput.action.committeeId,
        settingMerkleMapWitness: settingMerkleMapWitness,
      })
    );
    proof.publicOutput.counter.equals(proof.publicInput.N);

    // Set new state values
    this.rollupState.set(proof.publicOutput.newRollupState);
    this.round1Contribution.set(proof.publicOutput.newContributionRoot);

    this.emitEvent(
      EventEnum.ROUND_2_FINALIZED,
      new Round2FinalizedEvent({
        keyIndex: Poseidon.hash([
          proof.publicInput.action.committeeId,
          proof.publicInput.action.keyId,
        ]),
      })
    );
  }

  @method completeResponse(
    proof: ResponseProof,
    committee: OtherZkApp,
    settingMerkleMapWitness: MerkleMapWitness
  ) {
    // Get current state values
    let rollupState = this.rollupState.getAndAssertEquals();
    let publicKey = this.publicKey.getAndAssertEquals();
    let round1Contribution = this.round1Contribution.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.publicKeyRoot.assertEquals(publicKey);
    proof.publicInput.initialRollupState.assertEquals(rollupState);
    proof.publicInput.initialContributionRoot.assertEquals(round1Contribution);

    // TODO - Check if request is in the contribution stage

    // Check if committee address is correct
    let [zkAppRoot, zkAppKey] = committee.witness.computeRootAndKey(
      Poseidon.hash(committee.address.toFields())
    );
    let zkApps = this.zkApps.getAndAssertEquals();
    zkAppRoot.assertEquals(zkApps);
    zkAppKey.assertEquals(Poseidon.hash(ZK_APP.COMMITTEE));

    // Check if the committee's setting is correct
    const committeeContract = new Committee(committee.address);
    committeeContract.checkConfig(
      new CheckConfigInput({
        n: proof.publicInput.N,
        t: proof.publicInput.T,
        // FIXME - check all contribution action belongs to the same key
        commiteeId: proof.publicInput.action.committeeId,
        settingMerkleMapWitness: settingMerkleMapWitness,
      })
    );
    proof.publicOutput.counter.equals(proof.publicInput.N);

    // Set new state values
    this.rollupState.set(proof.publicOutput.newRollupState);
    this.round1Contribution.set(proof.publicOutput.newContributionRoot);

    this.emitEvent(
      EventEnum.RESPONSE_COMPLETED,
      new ResponseCompletedEvent({
        requestIndex: Poseidon.hash([
          proof.publicInput.action.committeeId,
          proof.publicInput.action.keyId,
          proof.publicInput.action.requestId,
        ]),
        D: proof.publicOutput.D,
      })
    );
  }
}
