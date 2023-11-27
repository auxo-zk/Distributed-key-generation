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
import { EMPTY_ADDRESS_MT, ZkAppRef } from './SharedStorage.js';
import {
  EMPTY_LEVEL_1_TREE as COMMITTEE_LEVEL_1_TREE,
  FullMTWitness as CommitteeFullWitness,
  Level1Witness as CommitteeLevel1Witness,
} from './CommitteeStorage.js';
import {
  EMPTY_LEVEL_1_TREE as DKG_LEVEL_1_TREE,
  Level1Witness,
} from './DKGStorage.js';
import { INSTANCE_LIMITS, ZkAppEnum } from '../constants.js';

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
  initialKeyCounter: Field,
  initialKeyStatus: Field,
  newKeyCounter: Field,
  newKeyStatus: Field,
  newActionState: Field,
}) {}

export const UpdateKey = ZkProgram({
  name: 'update-key',
  publicInput: Action,
  publicOutput: UpdateKeyOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field, Field],
      method(
        input: Action,
        initialKeyCounter: Field,
        initialKeyStatus: Field,
        initialActionState: Field
      ) {
        return new UpdateKeyOutput({
          initialKeyCounter: initialKeyCounter,
          initialKeyStatus: initialKeyStatus,
          newKeyCounter: initialKeyCounter,
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
        earlierProof.publicOutput.newKeyStatus.assertEquals(
          keyStatusWitness.calculateRoot(previousStatus)
        );
        keyIndex.assertEquals(keyStatusWitness.calculateIndex());

        // Calculate the new keyStatus tree root
        let newKeyStatus = keyStatusWitness.calculateRoot(nextStatus);

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [Action.toFields(input)]
        );

        return {
          initialKeyCounter: earlierProof.publicOutput.initialKeyCounter,
          initialKeyStatus: earlierProof.publicOutput.initialKeyStatus,
          newKeyCounter: earlierProof.publicOutput.newKeyCounter,
          newKeyStatus: newKeyStatus,
          newActionState: actionState,
        };
      },
    },
    nextStepGeneration: {
      privateInputs: [
        SelfProof<Action, UpdateKeyOutput>,
        Field,
        CommitteeLevel1Witness,
        Level1Witness,
      ],
      method(
        input: Action,
        earlierProof: SelfProof<Action, UpdateKeyOutput>,
        currKeyId: Field,
        keyCounterWitness: CommitteeLevel1Witness,
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

        // Check the key's previous index
        earlierProof.publicOutput.newKeyCounter.assertEquals(
          keyCounterWitness.calculateRoot(currKeyId)
        );
        input.committeeId.assertEquals(keyCounterWitness.calculateIndex());
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
          .mul(input.committeeId)
          .add(currKeyId);
        keyIndex.assertLessThan(
          Field.from(BigInt(INSTANCE_LIMITS.KEY)).mul(
            input.committeeId.add(Field(1))
          )
        );

        // Calculate new keyCounter root
        let newKeyCounter = keyCounterWitness.calculateRoot(
          currKeyId.add(Field(1))
        );

        // Check the key's previous status
        earlierProof.publicOutput.newKeyStatus.assertEquals(
          keyStatusWitness.calculateRoot(previousStatus)
        );
        keyIndex.assertEquals(keyStatusWitness.calculateIndex());

        // Calculate the new keyStatus tree root
        let newKeyStatus = keyStatusWitness.calculateRoot(nextStatus);

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [Action.toFields(input)]
        );

        return {
          initialKeyCounter: earlierProof.publicOutput.initialKeyCounter,
          initialKeyStatus: earlierProof.publicOutput.initialKeyStatus,
          newKeyCounter: newKeyCounter,
          newKeyStatus: newKeyStatus,
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

  // MT of other zkApp address
  @state(Field) zkApps = State<Field>();
  // MT of next keyId for all committees
  @state(Field) keyCounter = State<Field>();
  // MT of all keys' status
  @state(Field) keyStatus = State<Field>();

  init() {
    super.init();
    this.zkApps.set(EMPTY_ADDRESS_MT().getRoot());
    this.keyCounter.set(COMMITTEE_LEVEL_1_TREE().getRoot());
    this.keyStatus.set(DKG_LEVEL_1_TREE().getRoot());
  }

  /**
   * Generate a new key or deprecate an existed key
   * - Verify zkApp references
   * - Verify committee member
   * - Verify action type
   * - Create & dispatch action
   * @param committeeId
   * @param keyId
   * @param memberId
   * @param actionType
   * @param committee
   * @param memberWitness
   */
  @method
  committeeAction(
    committeeId: Field,
    keyId: Field,
    memberId: Field,
    actionType: Field,
    committee: ZkAppRef,
    memberWitness: CommitteeFullWitness
  ) {
    // Verify zkApp references
    let zkApps = this.zkApps.getAndAssertEquals();

    // CommitteeContract
    zkApps.assertEquals(
      committee.witness.calculateRoot(
        Poseidon.hash(committee.address.toFields())
      )
    );
    Field(ZkAppEnum.COMMITTEE).assertEquals(committee.witness.calculateIndex());

    const committeeContract = new CommitteeContract(committee.address);

    // Verify committee member - FIXME check if using this.sender is secure
    committeeContract
      .checkMember(
        new CheckMemberInput({
          address: this.sender,
          commiteeId: committeeId,
          memberWitness: memberWitness,
        })
      )
      .assertEquals(memberId);

    // Verify action type
    actionType
      .equals(Field(ActionEnum.GENERATE_KEY))
      .or(actionType.equals(Field(ActionEnum.DEPRECATE_KEY)));

    // Create & dispatch action
    let action = new Action({
      committeeId: committeeId,
      keyId: Provable.if(
        actionType.equals(ActionEnum.GENERATE_KEY),
        Field(-1),
        keyId
      ),
      mask: Provable.witness(ActionMask, () => {
        return ACTION_MASK[Number(actionType) as ActionEnum];
      }),
    });
    this.reducer.dispatch(action);
  }

  /**
   * Finalize contributions of round 1 or 2
   * - Verify action type
   * - Create & dispatch action
   * @param committeeId
   * @param keyId
   * @param actionType
   */
  @method
  publicAction(committeeId: Field, keyId: Field, actionType: Field) {
    // Verify action type
    actionType
      .equals(Field(ActionEnum.FINALIZE_ROUND_1))
      .or(actionType.equals(Field(ActionEnum.FINALIZE_ROUND_2)));

    // Create & dispatch action
    let action = new Action({
      committeeId: committeeId,
      keyId: keyId,
      mask: Provable.witness(ActionMask, () => {
        return ACTION_MASK[Number(actionType) as ActionEnum];
      }),
    });
    this.reducer.dispatch(action);
  }

  @method updateKeys(proof: UpdateKeyProof) {
    // Get current state values
    let keyCounter = this.keyCounter.getAndAssertEquals();
    let keyStatus = this.keyStatus.getAndAssertEquals();
    let actionState = this.account.actionState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicOutput.initialKeyCounter.assertEquals(keyCounter);
    proof.publicOutput.initialKeyStatus.assertEquals(keyStatus);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new state values
    this.keyCounter.set(proof.publicOutput.newKeyCounter);
    this.keyStatus.set(proof.publicOutput.newKeyStatus);

    // Emit events
    this.emitEvent(EventEnum.KEY_UPDATES_REDUCED, actionState);
  }
}
