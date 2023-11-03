import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Bool,
  Reducer,
  MerkleMapWitness,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
  MerkleTree,
  MerkleWitness,
  Proof,
  Provable,
  PublicKey,
  Group,
} from 'o1js';
import { DKG, Utils } from '@auxo-dev/dkg-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import { BatchEncryptionInput, BatchDecryptionInput } from './Encryption.js';

export const CONTRIBUTION_TREE_HEIGHT = 6;
export const SubMT = new MerkleTree(CONTRIBUTION_TREE_HEIGHT);
export class SubMTWitness extends MerkleWitness(2 ** (CONTRIBUTION_TREE_HEIGHT - 1)) { }
export class FullMTWitness extends Struct({
  level1: SubMTWitness,
  level2: MerkleMapWitness,
}) { }

class GroupDynamicArray extends Utils.GroupDynamicArray(32) { }
class PublicKeyDynamicArray extends Utils.PublicKeyDynamicArray(32) { }
class ScalarDynamicArray extends Utils.ScalarDynamicArray(32) { }

export const enum KeyStatus {
  EMPTY,
  ROUND_1_CONTRIBUTION,
  ROUND_2_CONTRIBUTION,
  ACTIVE,
  DEPRECATED,
}

export const enum RequestStatus {
  EMPTY,
  RESPONSE_CONTRIBUTION,
  COMPLETED,
}

export const enum ActionStatus {
  NOT_EXISTED,
  REDUCED,
  ROLLUPED,
}

export const enum ActionEnum {
  GENERATE_KEY,
  DEPRECATE_KEY,
  REGISTER_REQUEST,
  CONTRIBUTE_ROUND_1,
  CONTRIBUTE_ROUND_2,
  CONTRIBUTE_RESPONSE,
  __LENGTH,
}

export const enum EventEnum {
  GENERATE_KEY,
  DEPRECATE_KEY,
  REGISTER_REQUEST,
  CONTRIBUTE_ROUND_1,
  CONTRIBUTE_ROUND_2,
  CONTRIBUTE_RESPONSE,
  KEY_GENERATED,
  KEY_DEPRECATED,
  REQUEST_REGISTERED,
  ROUND_1_FINALIZED,
  ROUND_2_FINALIZED,
  RESPONSE_COMPLETED,
}

export class ActionMask extends Utils.DynamicArray(Bool, ActionEnum.__LENGTH) { }

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
  [ActionEnum.REGISTER_REQUEST]: ActionMask.from(
    [...Array(ActionEnum.__LENGTH).keys()].map((e) =>
      e == ActionEnum.REGISTER_REQUEST ? Bool(true) : Bool(false)
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
    })
  }
  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
  toFields(): Field[] {
    return [this.mask.length].concat(this.mask.toFields())
      .concat([this.committeeId, this.keyId, this.memberId, this.requestId])
      .concat(this.round1Contribution.toFields())
      .concat(this.round2Contribution.toFields())
      .concat(this.responseContribution.toFields()).flat();
  }
}

const ActionEvent = Action;

export class KeyGeneratedEvent extends Struct({
  committeeId: Field,
  keyId: Field,
}) { }

export class KeyDeprecatedEvent extends Struct({
  committeeId: Field,
  keyId: Field,
}) { }

export class Round1FinalizedEvent extends Struct({
  committeeId: Field,
  keyId: Field,
  publicKey: Field,
}) { }

export class Round2FinalizedEvent extends Struct({
  committeeId: Field,
  keyId: Field,
}) { }

export class RequestRegisteredEvent extends Struct({
  committeeId: Field,
  keyId: Field,
  requestId: Field,
  R: GroupDynamicArray,
}) { }

export class ResponseCompletedEvent extends Struct({
  committeeId: Field,
  keyId: Field,
  requestId: Field,
  D: GroupDynamicArray,
}) { }

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
}) { }

export class KeyUpdateOutput extends Struct({
  newKeyStatus: Field,
  newRollupState: Field,
}) { }

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
  keyStatusRoot: Field,
  initialContributionRoot: Field,
  initialPublicKeyRoot: Field,
  initialRollupState: Field,
  previousActionState: Field,
  action: Action,
}) { }

export class Round1Output extends Struct({
  newContributionRoot: Field,
  newPublicKeyRoot: Field,
  newRollupState: Field,
  publicKey: PublicKey,
  counter: Field,
}) { }

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
        rollupWitness: MerkleMapWitness,
      ) {
        // Verify earlier proof
        earlierProof.verify();

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
        ])

        // Check the selected key is in round 1 contribution period
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.ROUND_1_CONTRIBUTION));
        keyStatus.assertEquals(input.keyStatusRoot);
        keyStatusIndex.equals(keyIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level1.calculateIndex().assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(Field(0))
        );
        contributionRoot.assertEquals(earlierProof.publicOutput.newContributionRoot);
        contributionIndex.assertEquals(keyIndex);

        // Compute new contribution root
        [contributionRoot,] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(input.action.round1Contribution.hash())
        );

        // Check if this member's public key has not been registered
        publicKeyWitness.level1.calculateIndex().assertEquals(input.action.memberId);
        let [publicKeyRoot, publicKeyIndex] = publicKeyWitness.level2.computeRootAndKey(
          publicKeyWitness.level1.calculateRoot(Field(0))
        );
        publicKeyRoot.assertEquals(earlierProof.publicOutput.newPublicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Compute new public key root
        let memberPublicKey = input.action.round1Contribution.C.values[0];
        [publicKeyRoot,] = contributionWitness.level2.computeRootAndKey(
          publicKeyWitness.level1.calculateRoot(
            Poseidon.hash(memberPublicKey.toFields())
          )
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          input.previousActionState,
          [input.action.toFields()]
        );

        // Current value of the action hash should be 1
        let [root, key] = rollupWitness.computeRootAndKey(Field(ActionStatus.REDUCED));
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
  }
})

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
}) { }

export class Round2Output extends Struct({
  newContributionRoot: Field,
  newRollupState: Field,
  counter: Field,
}) { }

export class EncryptionProof extends Proof<BatchEncryptionInput, void> {}

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
        }
      }
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
        rollupWitness: MerkleMapWitness,
      ) {
        // Verify earlier proof
        earlierProof.verify();

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
        for (let i = 0; i < Number(input.N); i++) {
          encryptionProof.verify();
          
          encryptionProof.publicInput.publicKeys.length.assertEquals(
            input.publicKeys.length
          );
          encryptionProof.publicInput.c.length.assertEquals(
            input.action.round2Contribution.c.length
          );
          encryptionProof.publicInput.U.length.assertEquals(
            input.action.round2Contribution.U.length
          );

          for (let j = 0; j < Number(input.N); j++) {
            encryptionProof.publicInput.publicKeys.get(Field(j)).assertEquals(
              input.publicKeys.get(Field(i))
            );
            encryptionProof.publicInput.c.get(Field(j)).toScalar().assertEquals(
              input.action.round2Contribution.c.get(Field(j)).toScalar()
            );
            encryptionProof.publicInput.U.get(Field(j)).assertEquals(
              input.action.round2Contribution.U.get(Field(j))
            );
          }
        }

        // Check if members' public keys have been registered
        let publicKeyMT = new MerkleTree(CONTRIBUTION_TREE_HEIGHT);
        for (let i = 0; i < Number(input.N); i++) {
          publicKeyMT.setLeaf(BigInt(i), Poseidon.hash(input.publicKeys.get(Field(i)).toFields()))
        }
        let publicKeyLeaf = Provable.witness(Field, () => publicKeyMT.getRoot());
        let [publicKeyRoot,] = publicKeyWitness.computeRootAndKey(publicKeyLeaf);
        publicKeyRoot.assertEquals(input.publicKeyRoot);

        // Check the selected key is in round 2 contribution period
        let [keyStatus, keyStatusIndex] = keyStatusWitness.computeRootAndKey(Field(KeyStatus.ROUND_2_CONTRIBUTION));
        keyStatus.assertEquals(input.keyStatusRoot);
        keyStatusIndex.equals(keyIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level1.calculateIndex().assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(Field(0))
        );
        contributionRoot.assertEquals(earlierProof.publicOutput.newContributionRoot);
        contributionIndex.assertEquals(keyIndex);

        // Compute new contribution root
        [contributionRoot,] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(input.action.round2Contribution.hash())
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          input.previousActionState,
          [input.action.toFields()]
        );

        // Current value of the action hash should be 1
        let [root, key] = rollupWitness.computeRootAndKey(Field(ActionStatus.REDUCED));
        root.assertEquals(earlierProof.publicOutput.newRollupState);
        key.assertEquals(actionState);
        // New value of the action hash should be 2
        [root] = rollupWitness.computeRootAndKey(Field(ActionStatus.ROLLUPED));

        return {
          newContributionRoot: contributionRoot,
          newRollupState: root,
          counter: earlierProof.publicOutput.counter.add(1),
        };
      }
    }
  }
});

export class ResponseInput extends Struct({
  T: Field,
  N: Field,
  DIM: Field,
  publicKeyRoot: Field,
  publicKey: PublicKey,
  requestStatusRoot: Field,
  initialContributionRoot: Field,
  initialRollupState: Field,
  previousActionState: Field,
  action: Action,
}) {}

export class ResponseOutput extends Struct({
  newContributionRoot: Field,
  newRollupState: Field,
  D: GroupDynamicArray,
  counter: Field,
}) {}

export class DecryptionProof extends Proof<BatchDecryptionInput, void> {}

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
          D: new GroupDynamicArray([...Array(Number(input.DIM)).keys()].map(e => Group.zero)),
          counter: Field(0),
        }
      }
    },
    nextStep: {
      privateInputs: [
        SelfProof<ResponseInput, ResponseOutput>,
        FullMTWitness,
        DecryptionProof,
        MerkleMapWitness,
        FullMTWitness,
        MerkleMapWitness,
      ],
      method(
        input: ResponseInput,
        earlierProof: SelfProof<ResponseInput, ResponseOutput>,
        publicKeyWitness: FullMTWitness,
        decryptionProof: DecryptionProof,
        requestStatusWitness: MerkleMapWitness,
        contributionWitness: FullMTWitness,
        rollupWitness: MerkleMapWitness,
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check consistency of the initial values
        input.T.assertEquals(earlierProof.publicInput.T);
        input.N.assertEquals(earlierProof.publicInput.N);
        input.DIM.assertEquals(earlierProof.publicInput.DIM);
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
        ])

        // Check if decryption is correct
        for (let i = 0; i < Number(input.N); i++) {
          decryptionProof.verify();
          
          decryptionProof.publicInput.publicKey.assertEquals(input.publicKey);
          decryptionProof.publicInput.c.length.assertEquals(
            input.action.round2Contribution.c.length
          );
          decryptionProof.publicInput.U.length.assertEquals(
            input.action.round2Contribution.U.length
          );

          for (let j = 0; j < Number(input.N); j++) {
            decryptionProof.publicInput.c.get(Field(j)).toScalar().assertEquals(
              input.action.round2Contribution.c.get(Field(j)).toScalar()
            );
            decryptionProof.publicInput.U.get(Field(j)).assertEquals(
              input.action.round2Contribution.U.get(Field(j))
            );
          }
        }

        // Check if the member' public key have been registered
        let memberIndex = publicKeyWitness.level1.calculateIndex();
        memberIndex.assertEquals(input.action.memberId);
        let [publicKeyRoot, publicKeyIndex] = publicKeyWitness.level2.computeRootAndKey(
          Poseidon.hash(input.publicKey.toFields())
        );
        publicKeyRoot.assertEquals(input.publicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Check the selected key is in round 2 contribution period
        let [requestStatus, requestStatusIndex] = requestStatusWitness.computeRootAndKey(Field(RequestStatus.RESPONSE_CONTRIBUTION));
        requestStatus.assertEquals(input.requestStatusRoot);
        requestStatusIndex.equals(requestIndex);

        // Check if this committee member has contributed yet
        contributionWitness.level1.calculateIndex().assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(Field(0))
        );
        contributionRoot.assertEquals(earlierProof.publicOutput.newContributionRoot);
        contributionIndex.assertEquals(requestIndex);

        // Calculate new D value
        let D = earlierProof.publicOutput.D;
        for (let i = 0; i < Number(input.DIM); i++) {
          D.set(Field(i), D.get(Field(i)).add(input.action.responseContribution.D.get(Field(i))));
        }

        // Compute new contribution root
        [contributionRoot,] = contributionWitness.level2.computeRootAndKey(
          contributionWitness.level1.calculateRoot(input.action.round2Contribution.hash())
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          input.previousActionState,
          [input.action.toFields()]
        );

        // Current value of the action hash should be 1
        let [root, key] = rollupWitness.computeRootAndKey(Field(ActionStatus.REDUCED));
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
      }
    }
  }
});

export class DKGContract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.GENERATE_KEY]: ActionEvent,
    [EventEnum.DEPRECATE_KEY]: ActionEvent,
    [EventEnum.REGISTER_REQUEST]: ActionEvent,
    [EventEnum.CONTRIBUTE_ROUND_1]: ActionEvent,
    [EventEnum.CONTRIBUTE_ROUND_2]: ActionEvent,
    [EventEnum.CONTRIBUTE_RESPONSE]: ActionEvent,
    [EventEnum.KEY_GENERATED]: KeyGeneratedEvent,
    [EventEnum.KEY_DEPRECATED]: KeyDeprecatedEvent,
    [EventEnum.REQUEST_REGISTERED]: RequestRegisteredEvent,
    [EventEnum.ROUND_1_FINALIZED]: Round1FinalizedEvent,
    [EventEnum.ROUND_2_FINALIZED]: Round2FinalizedEvent,
    [EventEnum.RESPONSE_COMPLETED]: ResponseCompletedEvent,
  }

  @state(Field) actionState = State<Field>();
  @state(Field) rollupState = State<Field>();

  @state(Field) keyStatus = State<Field>();
  @state(Field) publicKey = State<Field>();
  @state(Field) round1Contribution = State<Field>();
  @state(Field) round2Contribution = State<Field>();

  @state(Field) requestStatus = State<Field>();
  @state(Field) tallyContribution = State<Field>();

  @method generateKey(committeeId: Field, keyId: Field, memberId: Field) {
    // TODO - Check if sender has the correct index in the committee

    // Dispatch key generation actions
    this.reducer.dispatch(
      new Action({
        mask: ACTION_MASKS[ActionEnum.GENERATE_KEY],
        committeeId: committeeId,
        keyId: keyId,
        memberId: memberId,
        requestId: Field(0),
        round1Contribution: DKG.Committee.Round1Contribution.empty(),
        round2Contribution: DKG.Committee.Round2Contribution.empty(),
        responseContribution: DKG.Committee.TallyContribution.empty(),
      })
    );
  }

  @method deprecateKey(keyId: Field) {
    // this.reducer.dispatch(
    //   new Action({
    //     mask: ACTIONS[ActionEnum.DEPRECATE_KEY],
    //     data: keyId,
    //   })
    // );
  }

  @method registerRequest() {
    return;
  }

  @method contributeRound1(
    round1Contribution: DKG.Committee.Round1Contribution
  ) {
    // this.reducer.dispatch(
    //   new Action({
    //     mask: ACTIONS[ActionEnum.ROUND_1_CONTRIBUTION],
    //     data: round1Contribution,
    //   })
    // );
  }

  @method contributeRound2() {
    return;
  }

  @method contributeResponse() {
    return;
  }

  @method generateKeys() {
    return;
  }

  @method deprecateKeys() {
    return;
  }

  @method registerRequests() {
    return;
  }

  @method finalizeRound1() {
    return;
  }

  @method finalizeRound2() {
    return;
  }

  @method completeResponse() {
    return;
  }

  @method reduce() {
    return;
  }
}