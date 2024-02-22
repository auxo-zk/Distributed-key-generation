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
import { CommitteeMemberInput, CommitteeContract } from './Committee.js';
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

export const enum KeyStatus {
    EMPTY,
    ROUND_1_CONTRIBUTION,
    ROUND_2_CONTRIBUTION,
    ACTIVE,
    DEPRECATED,
}

export class KeyStatusInput extends Struct({
    committeeId: Field,
    keyId: Field,
    status: Field,
    witness: Level1Witness,
}) {}

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
    initialActionState: Field,
    newActionState: Field,
}) {}

export const RollupDkg = ZkProgram({
    name: 'RollupDkg',
    publicInput: Action,
    publicOutput: RollupDkgOutput,
    methods: {
        firstStep: {
            privateInputs: [Field],
            method(input: Action, initialActionState: Field) {
                return new RollupDkgOutput({
                    initialActionState: initialActionState,
                    newActionState: initialActionState,
                });
            },
        },
        nextStep: {
            privateInputs: [SelfProof<Action, RollupDkgOutput>],
            method(
                input: Action,
                earlierProof: SelfProof<Action, RollupDkgOutput>
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Calculate corresponding action state
                let newActionState = updateActionState(
                    earlierProof.publicOutput.newActionState,
                    [Action.toFields(input)]
                );

                return new RollupDkgOutput({
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    newActionState: newActionState,
                });
            },
        },
    },
});

export class RollupDkgProof extends ZkProgram.Proof(RollupDkg) {}

export class UpdateKeysOutput extends Struct({
    initialKeyCounter: Field,
    initialKeyStatus: Field,
    nextKeyCounter: Field,
    nextKeyStatus: Field,
}) {}

export const UpdateKeys = ZkProgram({
    name: 'UpdateKeys',
    publicInput: Action,
    publicOutput: UpdateKeysOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field],
            method(
                input: Action,
                initialKeyCounter: Field,
                initialKeyStatus: Field
            ) {
                return new UpdateKeysOutput({
                    initialKeyCounter: initialKeyCounter,
                    initialKeyStatus: initialKeyStatus,
                    nextKeyCounter: initialKeyCounter,
                    nextKeyStatus: initialKeyStatus,
                });
            },
        },
        nextStep: {
            privateInputs: [SelfProof<Action, UpdateKeysOutput>, Level1Witness],
            method(
                input: Action,
                earlierProof: SelfProof<Action, UpdateKeysOutput>,
                keyStatusWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify key status
                let prevStatus = Provable.switch(input.mask.values, Field, [
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

                prevStatus.assertNotEquals(
                    Field(KeyStatus.EMPTY),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_VALUE
                    )
                );
                nextStatus.assertNotEquals(
                    Field(KeyStatus.ROUND_1_CONTRIBUTION),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_VALUE
                    )
                );

                // Check the key's previous status
                let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
                    .mul(input.committeeId)
                    .add(input.keyId);
                earlierProof.publicOutput.nextKeyStatus.assertEquals(
                    keyStatusWitness.calculateRoot(prevStatus),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_KEY
                    )
                );

                // Calculate the new keyStatus tree root
                let nextKeyStatus = keyStatusWitness.calculateRoot(nextStatus);

                return {
                    initialKeyCounter:
                        earlierProof.publicOutput.initialKeyCounter,
                    initialKeyStatus:
                        earlierProof.publicOutput.initialKeyStatus,
                    nextKeyCounter: earlierProof.publicOutput.nextKeyCounter,
                    nextKeyStatus: nextKeyStatus,
                };
            },
        },
        nextStepGeneration: {
            privateInputs: [
                SelfProof<Action, UpdateKeysOutput>,
                Field,
                CommitteeLevel1Witness,
                Level1Witness,
            ],
            method(
                input: Action,
                earlierProof: SelfProof<Action, UpdateKeysOutput>,
                currKeyId: Field,
                keyCounterWitness: CommitteeLevel1Witness,
                keyStatusWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Check the key's previous index
                earlierProof.publicOutput.nextKeyCounter.assertEquals(
                    keyCounterWitness.calculateRoot(currKeyId),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_COUNTER_ROOT
                    )
                );
                input.committeeId.assertEquals(
                    keyCounterWitness.calculateIndex(),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_COUNTER_KEY
                    )
                );
                let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
                    .mul(input.committeeId)
                    .add(currKeyId);
                keyIndex.assertLessThan(
                    Field.from(BigInt(INSTANCE_LIMITS.KEY)).mul(
                        input.committeeId.add(Field(1))
                    ),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_COUNTER_LIMIT
                    )
                );

                // Calculate new keyCounter root
                let nextKeyCounter = keyCounterWitness.calculateRoot(
                    currKeyId.add(Field(1))
                );

                // Check the key's previous status
                earlierProof.publicOutput.nextKeyStatus.assertEquals(
                    keyStatusWitness.calculateRoot(Field(KeyStatus.EMPTY)),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    buildAssertMessage(
                        UpdateKeys.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_STATUS_KEY
                    )
                );

                // Calculate the new keyStatus tree root
                let nextKeyStatus = keyStatusWitness.calculateRoot(
                    Field(KeyStatus.ROUND_1_CONTRIBUTION)
                );

                return {
                    initialKeyCounter:
                        earlierProof.publicOutput.initialKeyCounter,
                    initialKeyStatus:
                        earlierProof.publicOutput.initialKeyStatus,
                    nextKeyCounter: nextKeyCounter,
                    nextKeyStatus: nextKeyStatus,
                };
            },
        },
    },
});

export class UpdateKeysProof extends ZkProgram.Proof(UpdateKeys) {}

export class DkgContract extends SmartContract {
    /**
     * @description MT root storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();
    /**
     * @description MT root storing incremental counter of committees' keys
     */
    @state(Field) keyCounterRoot = State<Field>();

    /**
     * @description MT root storing keys' status
     */
    @state(Field) keyStatusRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    /**
     * @description MT root storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.keyCounterRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.keyStatusRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Generate a new key or deprecate an existed key
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param committee Reference to committee zkApp
     * @param memberWitness Witness for proof of committee's member
     */
    @method
    committeeAction(
        keyId: Field,
        actionType: Field,
        committee: ZkAppRef,
        memberWitness: CommitteeFullWitness
    ) {
        // Verify Committee Contract address
        this.verifyZkApp(committee, Field(ZkAppEnum.COMMITTEE));
        const committeeContract = new CommitteeContract(committee.address);

        // Verify committee member - FIXME check if using this.sender is secure
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();
        committeeContract.checkMember(
            new CommitteeMemberInput({
                address: this.sender,
                committeeId: committeeId,
                memberId: memberId,
                memberWitness: memberWitness,
            })
        );

        // Verify action type
        actionType
            .equals(Field(ActionEnum.GENERATE_KEY))
            .or(actionType.equals(Field(ActionEnum.DEPRECATE_KEY)))
            .assertTrue(
                buildAssertMessage(
                    DkgContract.name,
                    'committeeAction',
                    ErrorEnum.ACTION_TYPE
                )
            );

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
     * @param committeeId Global committee Id
     * @param keyId Committee's key Id
     * @param actionType Action type
     */
    @method
    publicAction(committeeId: Field, keyId: Field, actionType: Field) {
        // Verify action type
        actionType
            .equals(Field(ActionEnum.FINALIZE_ROUND_1))
            .or(actionType.equals(Field(ActionEnum.FINALIZE_ROUND_2)))
            .assertTrue(
                buildAssertMessage(
                    DkgContract.name,
                    'publicAction',
                    ErrorEnum.ACTION_TYPE
                )
            );

        // Create & dispatch action
        let action = new Action({
            committeeId: committeeId,
            keyId: keyId,
            mask: createActionMask(actionType),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Rollup DKG actions
     * @param proof Verification proof
     */
    @method rollup(proof: RollupDkgProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.initialActionState.assertEquals(
            curActionState,
            buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.CURRENT_ACTION_STATE
            )
        );
        proof.publicOutput.newActionState.assertEquals(
            lastActionState,
            buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.LAST_ACTION_STATE
            )
        );

        // Emit events
        this.emitEvent(EventEnum.ROLLUPED, lastActionState);
    }

    /**
     * Process DKG actions and update status and counter values
     * @param proof Verification proof
     */
    @method updateKeys(proof: UpdateKeysProof) {
        // Get current state values
        let keyCounterRoot = this.keyCounterRoot.getAndRequireEquals();
        let keyStatusRoot = this.keyStatusRoot.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.initialKeyCounter.assertEquals(
            keyCounterRoot,
            buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.KEY_COUNTER_ROOT
            )
        );
        proof.publicOutput.initialKeyStatus.assertEquals(
            keyStatusRoot,
            buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.KEY_STATUS_ROOT
            )
        );

        // Set new state values
        this.keyCounterRoot.set(proof.publicOutput.nextKeyCounter);
        this.keyStatusRoot.set(proof.publicOutput.nextKeyStatus);
    }

    /**
     * Verify the status of a key
     * @param input Verification input
     */
    verifyKeyStatus(input: KeyStatusInput) {
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
            .mul(input.committeeId)
            .add(input.keyId);

        this.keyStatusRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.calculateRoot(input.status),
                buildAssertMessage(
                    DkgContract.name,
                    'verifyKeyStatus',
                    ErrorEnum.KEY_STATUS_ROOT
                )
            );
        keyIndex.assertEquals(
            input.witness.calculateIndex(),
            buildAssertMessage(
                DkgContract.name,
                'verifyKeyStatus',
                ErrorEnum.KEY_STATUS_KEY
            )
        );
    }

    /**
     * Verify the address of a zkApp
     * @param ref Reference to a zkApp
     * @param key Index of its address in MT
     */
    verifyZkApp(ref: ZkAppRef, key: Field) {
        this.zkAppRoot
            .getAndRequireEquals()
            .assertEquals(
                ref.witness.calculateRoot(
                    Poseidon.hash(ref.address.toFields())
                ),
                buildAssertMessage(
                    DkgContract.name,
                    'verifyZkApp',
                    ErrorEnum.ZKAPP_ROOT
                )
            );

        key.assertEquals(
            ref.witness.calculateIndex(),
            buildAssertMessage(
                DkgContract.name,
                'verifyZkApp',
                ErrorEnum.ZKAPP_KEY
            )
        );
    }
}
