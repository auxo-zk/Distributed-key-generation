import {
  Field,
  method,
  MerkleMapWitness,
  Poseidon,
  Provable,
  Reducer,
  SmartContract,
  state,
  State,
  Struct,
  SelfProof,
  ZkProgram,
  Bool,
} from 'o1js';
import { BoolDynamicArray, GroupDynamicArray } from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import {
  CheckMemberInput,
  CommitteeContract,
  CommitteeMerkleWitness,
} from './Committee.js';
import { ZkAppRef } from '../libs/ZkAppRef.js';
import { EMPTY_LEVEL_1_TREE } from './DKGStorage.js';
import { COMMITTEE_MAX_SIZE, ZK_APP } from '../constants.js';

export class PublicKeyArray extends GroupDynamicArray(COMMITTEE_MAX_SIZE) {}

const DefaultRoot = EMPTY_LEVEL_1_TREE().getRoot();

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
}

export const enum ActionEnum {
  GENERATE_KEY,
  FINALIZE_ROUND_1,
  FINALIZE_ROUND_2,
  DEPRECATE_KEY,
  __LENGTH,
}

export const enum EventEnum {
  KEY_UPDATES_REDUCED,
}

export class ActionMask extends BoolDynamicArray(ActionEnum.__LENGTH) {}
export const ACTION_MASK = {
  [ActionEnum.GENERATE_KEY]: new ActionMask([...Array(ActionEnum.__LENGTH).keys()].map(
    (e, i) => i == ActionEnum.GENERATE_KEY ? Bool(true) : Bool(false)
  )),
  [ActionEnum.FINALIZE_ROUND_1]: new ActionMask([...Array(ActionEnum.__LENGTH).keys()].map(
    (e, i) => i == ActionEnum.FINALIZE_ROUND_1 ? Bool(true) : Bool(false)
  )),
  [ActionEnum.FINALIZE_ROUND_2]: new ActionMask([...Array(ActionEnum.__LENGTH).keys()].map(
    (e, i) => i == ActionEnum.FINALIZE_ROUND_2 ? Bool(true) : Bool(false)
  )),
  [ActionEnum.DEPRECATE_KEY]: new ActionMask([...Array(ActionEnum.__LENGTH).keys()].map(
    (e, i) => i == ActionEnum.DEPRECATE_KEY ? Bool(true) : Bool(false)
  )),
  [ActionEnum.__LENGTH]: new ActionMask()
}

/**
 * Class of action dispatched by users
 * @param mask Specify action type (defined with ActionEnum)
 * @param committeeId Incremental committee index
 * @param keyId Incremental key index of a committee
 * @param memberId Incremental member index of a committee
 * @param requestId Unique index of a key usage request
 * @function hash Return the action's hash to append in the action state hash chain
 * @function toFields Return the action in the form of Fields[]
 */
export class Action extends Struct({
  mask: ActionMask,
  committeeId: Field,
  keyId: Field,
}) {
  static empty(): Action {
    return new Action({
      committeeId: Field(0),
      keyId: Field(0),
      mask: new ActionMask(),
    });
  }
  static fromFields(fields: Field[]): Action {
    return super.fromFields(fields) as Action;
  }
  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
  toFields(): Field[] {
    return Action.toFields(this);
  }
}

export class UpdateKeyInput extends Struct({
  initialKeyStatus: Field,
  action: Action,
}) {}

export class UpdateKeyOutput extends Struct({
  newKeyStatus: Field,
  newActionState: Field,
}) {}

export const UpdateKey = ZkProgram({
  name: 'update-key',
  publicInput: UpdateKeyInput,
  publicOutput: UpdateKeyOutput,
  methods: {
    firstStep: {
      privateInputs: [Field],
      method(input: UpdateKeyInput, initialActionState: Field) {
        return {
          newKeyStatus: input.initialKeyStatus,
          newActionState: initialActionState,
        };
      },
    },
    nextStep: {
      privateInputs: [SelfProof<UpdateKeyInput, UpdateKeyOutput>,MerkleMapWitness],
      method(
        input: UpdateKeyInput,
        earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
        keyStatusWitness: MerkleMapWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check consistency of the initial values
        input.initialKeyStatus.assertEquals(
          earlierProof.publicInput.initialKeyStatus
        );

        let previousStatus = Provable.switch(input.action.mask.values, Field, [
          Field(KeyStatus.EMPTY),
          Field(KeyStatus.ROUND_1_CONTRIBUTION),
          Field(KeyStatus.ROUND_2_CONTRIBUTION),
          Field(KeyStatus.ACTIVE),
        ]);

        let nextStatus = Provable.switch(input.action.mask.values, Field, [
          Field(KeyStatus.ROUND_1_CONTRIBUTION),
          Field(KeyStatus.ROUND_2_CONTRIBUTION),
          Field(KeyStatus.ACTIVE),
          Field(KeyStatus.DEPRECATED),
        ]);

        // Check the key's previous status
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);
        let [keyStatus, keyStatusIndex] =
          keyStatusWitness.computeRootAndKey(previousStatus);
        keyStatus.assertEquals(input.initialKeyStatus);
        keyStatusIndex.assertEquals(keyIndex);

        // Calculate the new keyStatus tree root
        [keyStatus] = keyStatusWitness.computeRootAndKey(nextStatus);

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(earlierProof.publicOutput.newActionState, [
          input.action.toFields(),
        ]);

        return {
          newKeyStatus: keyStatus,
          newActionState: actionState,
        };
      },
    },
  },
});

class UpdateKeyProof extends ZkProgram.Proof(UpdateKey) {}

export class DKGContract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  event = {
    [EventEnum.KEY_UPDATES_REDUCED]: Field,
  };

  // Merkle tree of other zkApp address
  @state(Field) zkApps = State<Field>();
  // Merkle tree of all keys' status
  @state(Field) keyStatus = State<Field>();

  init() {
    super.init();
    this.zkApps.set(DefaultRoot);
    this.keyStatus.set(DefaultRoot);
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
  verifyKeyStatus(keyIndex: Field, status: Field, witness: MerkleMapWitness): void {
    let keyStatus = this.keyStatus.getAndAssertEquals();
    let [root, index] = witness.computeRootAndKey(status);
    root.assertEquals(keyStatus);
    index.assertEquals(keyIndex);
  }

  @method
  committeeAction(
    committeeId: Field,
    keyId: Field,
    actionType: Field,
    committee: ZkAppRef,
    memberMerkleTreeWitness: CommitteeMerkleWitness,
    memberMerkleMapWitness: MerkleMapWitness,
    memberId: Field,
  ) {
    // Check if sender has the correct index in the committee
    this.verifyZkApp(committee, ZK_APP.COMMITTEE);const committeeContract = new CommitteeContract(committee.address);
    committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender,
        commiteeId: committeeId,
        memberMerkleTreeWitness: memberMerkleTreeWitness,
        memberMerkleMapWitness: memberMerkleMapWitness,
      })
    ).assertEquals(memberId);

    // Create Action
    actionType.equals(Field(ActionEnum.GENERATE_KEY))
      .or(actionType.equals(Field(ActionEnum.DEPRECATE_KEY)))
    let mask = Provable.witness(ActionMask, () => {
      return ACTION_MASK[Number(actionType) as ActionEnum];
    });
    let action = new Action({
      committeeId: committeeId,
      keyId: keyId,
      mask: mask
    });

    // Dispatch key generation actions
    this.reducer.dispatch(action);
  }

  @method
  publicAction(committeeId: Field, keyId: Field, actionType: Field) {
    // Create Action
    actionType.equals(Field(ActionEnum.FINALIZE_ROUND_1))
      .or(actionType.equals(Field(ActionEnum.FINALIZE_ROUND_2)))
    let mask = Provable.witness(ActionMask, () => {
      return ACTION_MASK[Number(actionType) as ActionEnum];
    });
    let action = new Action({
      committeeId: committeeId,
      keyId: keyId,
      mask: mask
    });

    // Dispatch key generation actions
    this.reducer.dispatch(action);
  }

  @method updateKeys(proof: UpdateKeyProof) {
    // Get current state values
    let keyStatus = this.keyStatus.getAndAssertEquals();
    let actionState = this.account.actionState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialKeyStatus.assertEquals(keyStatus);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new state values
    this.keyStatus.set(proof.publicOutput.newKeyStatus);

    // Emit events
    this.emitEvent(EventEnum.KEY_UPDATES_REDUCED, actionState);
  }
}
