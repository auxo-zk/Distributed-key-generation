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
} from 'o1js';
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
import { CommitteeMemberInput, CommitteeContract } from './Committee.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessStatus,
    ProcessedActions,
    ZkAppRef,
    verifyZkApp,
} from './SharedStorage.js';
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
import { ErrorEnum, EventEnum } from './constants.js';
import {
    ActionMask as _ActionMask,
    Rollup,
    processAction,
    rollup,
} from './Actions.js';

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

export class ActionMask extends _ActionMask(ActionEnum.__LENGTH) {}

export function calculateKeyIndex(committeeId: Field, keyId: Field): Field {
    return Field.from(BigInt(INSTANCE_LIMITS.KEY)).mul(committeeId).add(keyId);
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

export const RollupDkg = Rollup('RollupDkg', Action);

export class RollupDkgProof extends ZkProgram.Proof(RollupDkg) {}

export class UpdateKeyInput extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class UpdateKeyOutput extends Struct({
    initialKeyCounterRoot: Field,
    initialKeyStatusRoot: Field,
    initialProcessRoot: Field,
    nextKeyCounterRoot: Field,
    nextKeyStatusRoot: Field,
    nextProcessRoot: Field,
    processedActions: ProcessedActions,
}) {}

export const UpdateKey = ZkProgram({
    name: 'UpdateKey',
    publicInput: UpdateKeyInput,
    publicOutput: UpdateKeyOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field],
            method(
                input: UpdateKeyInput,
                initialKeyCounter: Field,
                initialKeyStatus: Field,
                initialProcessRoot: Field
            ) {
                return new UpdateKeyOutput({
                    initialKeyCounterRoot: initialKeyCounter,
                    initialKeyStatusRoot: initialKeyStatus,
                    initialProcessRoot: initialProcessRoot,
                    nextKeyCounterRoot: initialKeyCounter,
                    nextKeyStatusRoot: initialKeyStatus,
                    nextProcessRoot: initialProcessRoot,
                    processedActions: new ProcessedActions(),
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                Level1Witness,
                ActionWitness,
            ],
            method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                keyStatusWitness: Level1Witness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify key status
                let prevStatus = Provable.switch(
                    input.action.mask.values,
                    Field,
                    [
                        Field(KeyStatus.EMPTY),
                        Field(KeyStatus.ROUND_1_CONTRIBUTION),
                        Field(KeyStatus.ROUND_2_CONTRIBUTION),
                        Field(KeyStatus.ACTIVE),
                    ]
                );

                let nextStatus = Provable.switch(
                    input.action.mask.values,
                    Field,
                    [
                        Field(KeyStatus.ROUND_1_CONTRIBUTION),
                        Field(KeyStatus.ROUND_2_CONTRIBUTION),
                        Field(KeyStatus.ACTIVE),
                        Field(KeyStatus.DEPRECATED),
                    ]
                );

                prevStatus.assertNotEquals(
                    Field(KeyStatus.EMPTY),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_VALUE
                    )
                );
                nextStatus.assertNotEquals(
                    Field(KeyStatus.ROUND_1_CONTRIBUTION),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_VALUE
                    )
                );

                // Check the key's previous status
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                earlierProof.publicOutput.nextKeyStatusRoot.assertEquals(
                    keyStatusWitness.calculateRoot(prevStatus),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStep',
                        ErrorEnum.KEY_STATUS_KEY
                    )
                );

                // Calculate the new key status MT root
                let nextKeyStatusRoot =
                    keyStatusWitness.calculateRoot(nextStatus);

                // Calculate corresponding action state
                let actionState = updateActionState(input.previousActionState, [
                    Action.toFields(input.action),
                ]);
                let processedActions =
                    earlierProof.publicOutput.processedActions;
                processedActions.push(actionState);

                // Verify the action isn't already processed
                let nextProcessRoot = processAction(
                    UpdateKey.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new UpdateKeyOutput({
                    initialKeyCounterRoot:
                        earlierProof.publicOutput.initialKeyCounterRoot,
                    initialKeyStatusRoot:
                        earlierProof.publicOutput.initialKeyStatusRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextKeyCounterRoot:
                        earlierProof.publicOutput.nextKeyCounterRoot,
                    nextKeyStatusRoot: nextKeyStatusRoot,
                    nextProcessRoot: nextProcessRoot,
                    processedActions: processedActions,
                });
            },
        },
        nextStepGeneration: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                Field,
                CommitteeLevel1Witness,
                Level1Witness,
                ActionWitness,
            ],
            method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                currKeyId: Field,
                keyCounterWitness: CommitteeLevel1Witness,
                keyStatusWitness: Level1Witness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Check the key's previous index
                earlierProof.publicOutput.nextKeyCounterRoot.assertEquals(
                    keyCounterWitness.calculateRoot(currKeyId),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_COUNTER_ROOT
                    )
                );
                input.action.committeeId.assertEquals(
                    keyCounterWitness.calculateIndex(),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_COUNTER_KEY
                    )
                );
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                keyIndex.assertLessThan(
                    Field.from(BigInt(INSTANCE_LIMITS.KEY)).mul(
                        input.action.committeeId.add(Field(1))
                    ),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_COUNTER_LIMIT
                    )
                );

                // Calculate new keyCounter root
                let nextKeyCounter = keyCounterWitness.calculateRoot(
                    currKeyId.add(Field(1))
                );

                // Check the key's previous status
                earlierProof.publicOutput.nextKeyStatusRoot.assertEquals(
                    keyStatusWitness.calculateRoot(Field(KeyStatus.EMPTY)),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStepGeneration',
                        ErrorEnum.KEY_STATUS_KEY
                    )
                );

                // Calculate the new keyStatus tree root
                let nextKeyStatus = keyStatusWitness.calculateRoot(
                    Field(KeyStatus.ROUND_1_CONTRIBUTION)
                );

                // Calculate corresponding action state
                let actionState = updateActionState(input.previousActionState, [
                    Action.toFields(input.action),
                ]);
                let processedActions =
                    earlierProof.publicOutput.processedActions;
                processedActions.push(actionState);

                // Verify the action isn't already processed
                let [processRoot, processKey] =
                    processWitness.computeRootAndKey(
                        Field(ProcessStatus.NOT_PROCESSED)
                    );
                processRoot.assertEquals(
                    earlierProof.publicOutput.nextProcessRoot,
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStep',
                        ErrorEnum.PROCESS_ROOT
                    )
                );
                processKey.assertEquals(
                    actionState,
                    buildAssertMessage(
                        UpdateKey.name,
                        'nextStep',
                        ErrorEnum.PROCESS_KEY
                    )
                );

                // Calculate the new process MT root
                let nextProcessRoot = processWitness.computeRootAndKey(
                    Field(ProcessStatus.PROCESSED)
                )[0];

                return new UpdateKeyOutput({
                    initialKeyCounterRoot:
                        earlierProof.publicOutput.initialKeyCounterRoot,
                    initialKeyStatusRoot:
                        earlierProof.publicOutput.initialKeyStatusRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextKeyCounterRoot: nextKeyCounter,
                    nextKeyStatusRoot: nextKeyStatus,
                    nextProcessRoot: nextProcessRoot,
                    processedActions: processedActions,
                });
            },
        },
    },
});

export class UpdateKeyProof extends ZkProgram.Proof(UpdateKey) {}

export class DkgContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing incremental counter of committees' keys
     */
    @state(Field) keyCounterRoot = State<Field>();

    /**
     * @description MT storing keys' status
     */
    @state(Field) keyStatusRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    /**
     * @description MT storing actions' rollup state
     */
    @state(Field) rollupRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.ROLLUPED]: Field,
        [EventEnum.PROCESSED]: ProcessedActions,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.keyCounterRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.keyStatusRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
        this.rollupRoot.set(EMPTY_ACTION_MT().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    /**
     * Generate a new key or deprecate an existed key
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param committee Reference to Committee Contract
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
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            DkgContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );
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
            mask: ActionMask.createMask(actionType),
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
            mask: ActionMask.createMask(actionType),
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
        let rollupRoot = this.rollupRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        rollup(
            DkgContract.name,
            proof.publicOutput,
            curActionState,
            rollupRoot,
            lastActionState
        );

        // Update state values
        this.rollupRoot.set(proof.publicOutput.newRollupRoot);

        // Emit events
        this.emitEvent(EventEnum.ROLLUPED, lastActionState);
    }

    /**
     * Process DKG actions and update status and counter values
     * @param proof Verification proof
     */
    @method updateKeys(proof: UpdateKeyProof) {
        // Get current state values
        let keyCounterRoot = this.keyCounterRoot.getAndRequireEquals();
        let keyStatusRoot = this.keyStatusRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.initialKeyCounterRoot.assertEquals(
            keyCounterRoot,
            buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.KEY_COUNTER_ROOT
            )
        );
        proof.publicOutput.initialKeyStatusRoot.assertEquals(
            keyStatusRoot,
            buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.KEY_STATUS_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.PROCESS_ROOT
            )
        );

        // Set new state values
        this.keyCounterRoot.set(proof.publicOutput.nextKeyCounterRoot);
        this.keyStatusRoot.set(proof.publicOutput.nextKeyStatusRoot);
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        this.emitEvent(
            EventEnum.PROCESSED,
            proof.publicOutput.processedActions
        );
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
}
