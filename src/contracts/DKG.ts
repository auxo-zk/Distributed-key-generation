import {
  Field,
  method,
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
import { BoolDynamicArray } from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import { CheckMemberInput, CommitteeContract } from './Committee.js';
import { ZkAppRef } from './SharedStorage.js';
import { FullMTWitness as CommitteeFullWitness } from './CommitteeStorage.js';
import { EMPTY_LEVEL_1_TREE, Level1Witness } from './DKGStorage.js';
import { INSTANCE_LIMITS, ZkAppEnum } from '../constants.js';

const DefaultRoot = EMPTY_LEVEL_1_TREE().getRoot();

export const enum KeyStatus {
  EMPTY,
  ROUND_1_CONTRIBUTION,
  ROUND_2_CONTRIBUTION,
  ACTIVE,
  DEPRECATED,
}

export const enum ActionEnum {
  GENERATE_KEY,
  FINALIZE_ROUND_1,
  FINALIZE_ROUND_2,
  DEPRECATE_KEY,
  __LENGTH,
}

export const enum EventEnum {
  KEY_UPDATES_REDUCED = 'key-updated-reduced',
}

export class ActionMask extends BoolDynamicArray(ActionEnum.__LENGTH) {}
export const ACTION_MASK = {
  [ActionEnum.GENERATE_KEY]: new ActionMask(
    [...Array(ActionEnum.__LENGTH).keys()].map((e, i) =>
      i == ActionEnum.GENERATE_KEY ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.FINALIZE_ROUND_1]: new ActionMask(
    [...Array(ActionEnum.__LENGTH).keys()].map((e, i) =>
      i == ActionEnum.FINALIZE_ROUND_1 ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.FINALIZE_ROUND_2]: new ActionMask(
    [...Array(ActionEnum.__LENGTH).keys()].map((e, i) =>
      i == ActionEnum.FINALIZE_ROUND_2 ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.DEPRECATE_KEY]: new ActionMask(
    [...Array(ActionEnum.__LENGTH).keys()].map((e, i) =>
      i == ActionEnum.DEPRECATE_KEY ? Bool(true) : Bool(false)
    )
  ),
  [ActionEnum.__LENGTH]: new ActionMask(),
};

/**
 * Class of action dispatched by users
 * @param committeeId Incremental committee index
 * @param keyId Incremental key index of a committee
 * @param mask Specify action type (defined with ActionEnum)
 * @function hash Return the action's hash to append in the action state hash chain
 * @function toFields Return the action in the form of Fields[]
 */
export class Action extends Struct({
  committeeId: Field,
  keyId: Field,
  mask: ActionMask,
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
    return Poseidon.hash(Action.toFields(this));
  }
}

export class UpdateKeyOutput extends Struct({
  initialKeyStatus: Field,
  newKeyStatus: Field,
  newActionState: Field,
}) {}

export const UpdateKey = ZkProgram({
  name: 'update-key',
  publicInput: Action,
  publicOutput: UpdateKeyOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field],
      method(
        input: Action,
        initialKeyStatus: Field,
        initialActionState: Field
      ) {
        return new UpdateKeyOutput({
          initialKeyStatus: initialKeyStatus,
          newKeyStatus: initialKeyStatus,
          newActionState: initialActionState,
        });
      },
    },
    nextStep: {
      privateInputs: [SelfProof<Action, UpdateKeyOutput>, Level1Witness],
      method(
        input: Action,
        earlierProof: SelfProof<Action, UpdateKeyOutput>,
        keyStatusWitness: Level1Witness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        let previousStatus = Provable.switch(input.mask.values, Field, [
          Field(KeyStatus.EMPTY),
          Field(KeyStatus.ROUND_1_CONTRIBUTION),
          Field(KeyStatus.ROUND_2_CONTRIBUTION),
          Field(KeyStatus.ACTIVE),
        ]);

        let nextStatus = Provable.switch(input.mask.values, Field, [
          Field(KeyStatus.ROUND_1_CONTRIBUTION),
          Field(KeyStatus.ROUND_2_CONTRIBUTION),
          Field(KeyStatus.ACTIVE),
          Field(KeyStatus.DEPRECATED),
        ]);

        // Check the key's previous status
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
          .mul(input.committeeId)
          .add(input.keyId);
        let keyStatus = keyStatusWitness.calculateRoot(previousStatus);
        let keyStatusIndex = keyStatusWitness.calculateIndex();
        keyStatus.assertEquals(earlierProof.publicOutput.newKeyStatus);
        keyStatusIndex.assertEquals(keyIndex);

        // Calculate the new keyStatus tree root
        keyStatus = keyStatusWitness.calculateRoot(nextStatus);

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [Action.toFields(input)]
        );

        return {
          initialKeyStatus: earlierProof.publicOutput.initialKeyStatus,
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
  events = {
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
    let root = zkApp.witness.calculateRoot(
      Poseidon.hash(zkApp.address.toFields())
    );
    let id = zkApp.witness.calculateIndex();
    root.assertEquals(zkApps);
    id.assertEquals(index);
  }

  @method
  verifyKeyStatus(
    keyIndex: Field,
    status: Field,
    witness: Level1Witness
  ): void {
    let keyStatus = this.keyStatus.getAndAssertEquals();
    let root = witness.calculateRoot(status);
    let index = witness.calculateIndex();
    root.assertEquals(keyStatus);
    index.assertEquals(keyIndex);
  }

  @method
  committeeAction(
    committeeId: Field,
    keyId: Field,
    memberId: Field,
    actionType: Field,
    committee: ZkAppRef,
    memberWitness: CommitteeFullWitness
  ) {
    // Check if sender has the correct index in the committee
    this.verifyZkApp(committee, Field(ZkAppEnum.COMMITTEE));
    const committeeContract = new CommitteeContract(committee.address);
    committeeContract
      .checkMember(
        new CheckMemberInput({
          address: this.sender,
          commiteeId: committeeId,
          memberWitness: memberWitness,
        })
      )
      .assertEquals(memberId);

    // Create Action
    actionType
      .equals(Field(ActionEnum.GENERATE_KEY))
      .or(actionType.equals(Field(ActionEnum.DEPRECATE_KEY)));
    let mask = Provable.witness(ActionMask, () => {
      return ACTION_MASK[Number(actionType) as ActionEnum];
    });
    let action = new Action({
      committeeId: committeeId,
      keyId: keyId,
      mask: mask,
    });

    // Dispatch key generation actions
    this.reducer.dispatch(action);
  }

  @method
  publicAction(committeeId: Field, keyId: Field, actionType: Field) {
    // Create Action
    actionType
      .equals(Field(ActionEnum.FINALIZE_ROUND_1))
      .or(actionType.equals(Field(ActionEnum.FINALIZE_ROUND_2)));
    let mask = Provable.witness(ActionMask, () => {
      return ACTION_MASK[Number(actionType) as ActionEnum];
    });
    let action = new Action({
      committeeId: committeeId,
      keyId: keyId,
      mask: mask,
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
    proof.publicOutput.initialKeyStatus.assertEquals(keyStatus);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new state values
    this.keyStatus.set(proof.publicOutput.newKeyStatus);

    // Emit events
    this.emitEvent(EventEnum.KEY_UPDATES_REDUCED, actionState);
  }
}
