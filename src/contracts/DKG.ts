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
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
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
import { ErrorEnum, EventEnum } from './shared.js';
import { MemberArray } from '../libs/Committee.js';

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

export class ActionMask extends BoolDynamicArray(ActionEnum.__LENGTH) {}

export function createActionMask(action: Field): ActionMask {
    let mask = ActionMask.empty(Field(ActionEnum.__LENGTH));
    mask.set(action, Bool(true));
    return mask;
}

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

export class RollupDkgOutput extends Struct({
    initialKeyCounter: Field,
    initialKeyStatus: Field,
    nextKeyCounter: Field,
    nextKeyStatus: Field,
    nextActionState: Field,
}) {}

export const RollupDkg = ZkProgram({
    name: 'RollupDkg',
    publicInput: Action,
    publicOutput: RollupDkgOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field],
            method(
                input: Action,
                initialKeyCounter: Field,
                initialKeyStatus: Field,
                initialActionState: Field
            ) {
                return new RollupDkgOutput({
                    initialKeyCounter: initialKeyCounter,
                    initialKeyStatus: initialKeyStatus,
                    nextKeyCounter: initialKeyCounter,
                    nextKeyStatus: initialKeyStatus,
                    nextActionState: initialActionState,
                });
            },
        },
        nextStep: {
            privateInputs: [SelfProof<Action, RollupDkgOutput>, Level1Witness],
            method(
                input: Action,
                earlierProof: SelfProof<Action, RollupDkgOutput>,
                keyStatusWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // FIXME - should not allow empty key status
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
                earlierProof.publicOutput.nextKeyStatus.assertEquals(
                    keyStatusWitness.calculateRoot(previousStatus)
                );
                keyIndex.assertEquals(keyStatusWitness.calculateIndex());

                // Calculate the new keyStatus tree root
                let nextKeyStatus = keyStatusWitness.calculateRoot(nextStatus);

                // Calculate corresponding action state
                let actionState = updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return {
                    initialKeyCounter:
                        earlierProof.publicOutput.initialKeyCounter,
                    initialKeyStatus:
                        earlierProof.publicOutput.initialKeyStatus,
                    nextKeyCounter: earlierProof.publicOutput.nextKeyCounter,
                    nextKeyStatus: nextKeyStatus,
                    nextActionState: actionState,
                };
            },
        },
        nextStepGeneration: {
            privateInputs: [
                SelfProof<Action, RollupDkgOutput>,
                Field,
                CommitteeLevel1Witness,
                Level1Witness,
            ],
            method(
                input: Action,
                earlierProof: SelfProof<Action, RollupDkgOutput>,
                currKeyId: Field,
                keyCounterWitness: CommitteeLevel1Witness,
                keyStatusWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // FIXME - previousStatus and nextStatus should be fixed
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
                earlierProof.publicOutput.nextKeyCounter.assertEquals(
                    keyCounterWitness.calculateRoot(currKeyId)
                );
                input.committeeId.assertEquals(
                    keyCounterWitness.calculateIndex()
                );
                let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
                    .mul(input.committeeId)
                    .add(currKeyId);
                keyIndex.assertLessThan(
                    Field.from(BigInt(INSTANCE_LIMITS.KEY)).mul(
                        input.committeeId.add(Field(1))
                    )
                );

                // Calculate new keyCounter root
                let nextKeyCounter = keyCounterWitness.calculateRoot(
                    currKeyId.add(Field(1))
                );

                // Check the key's previous status
                earlierProof.publicOutput.nextKeyStatus.assertEquals(
                    keyStatusWitness.calculateRoot(previousStatus)
                );
                keyIndex.assertEquals(keyStatusWitness.calculateIndex());

                // Calculate the new keyStatus tree root
                let nextKeyStatus = keyStatusWitness.calculateRoot(nextStatus);

                // Calculate corresponding action state
                let actionState = updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return {
                    initialKeyCounter:
                        earlierProof.publicOutput.initialKeyCounter,
                    initialKeyStatus:
                        earlierProof.publicOutput.initialKeyStatus,
                    nextKeyCounter: nextKeyCounter,
                    nextKeyStatus: nextKeyStatus,
                    nextActionState: actionState,
                };
            },
        },
    },
});

export class RollupDkgProof extends ZkProgram.Proof(RollupDkg) {}

export class DkgContract extends SmartContract {
    // MT of other zkApp address
    @state(Field) zkAppRoot = State<Field>();
    // MT of next keyId for all committees
    @state(Field) keyCounterRoot = State<Field>();
    // MT of all keys' status
    @state(Field) keyStatusRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.keyCounterRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.keyStatusRoot.set(DKG_LEVEL_1_TREE().getRoot());
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
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Committee Contract address
        zkAppRoot.assertEquals(
            committee.witness.calculateRoot(
                Poseidon.hash(committee.address.toFields())
            ),
            buildAssertMessage(
                DkgContract.name,
                'committeeAction',
                ErrorEnum.ZKAPP_ROOT
            )
        );
        Field(ZkAppEnum.COMMITTEE).assertEquals(
            committee.witness.calculateIndex(),
            buildAssertMessage(
                DkgContract.name,
                'committeeAction',
                ErrorEnum.ZKAPP_KEY
            )
        );

        const committeeContract = new CommitteeContract(committee.address);

        // Verify committee member - FIXME check if using this.sender is secure
        committeeContract
            .checkMember(
                new CheckMemberInput({
                    address: this.sender,
                    committeeId: committeeId,
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
            mask: createActionMask(actionType),
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
            mask: createActionMask(actionType),
        });
        this.reducer.dispatch(action);
    }

    @method updateKeys(proof: RollupDkgProof) {
        // Get current state values
        let keyCounter = this.keyCounterRoot.getAndRequireEquals();
        let keyStatus = this.keyStatusRoot.getAndRequireEquals();
        let actionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.initialKeyCounter.assertEquals(keyCounter);
        proof.publicOutput.initialKeyStatus.assertEquals(keyStatus);
        proof.publicOutput.nextActionState.assertEquals(actionState);

        // Set new state values
        this.keyCounterRoot.set(proof.publicOutput.nextKeyCounter);
        this.keyStatusRoot.set(proof.publicOutput.nextKeyStatus);

        // Emit events
        this.emitEvent(EventEnum.ROLLUPED, actionState);
    }
}
