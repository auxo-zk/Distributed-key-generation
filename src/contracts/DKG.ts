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
    PublicKey,
    Group,
} from 'o1js';
import { ActionMask as _ActionMask, Utils } from '@auxo-dev/auxo-libs';
import { CommitteeMemberInput, CommitteeContract } from './Committee.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessedActions,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import {
    EMPTY_LEVEL_1_TREE as COMMITTEE_LEVEL_1_TREE,
    FullMTWitness as CommitteeFullWitness,
    Level1Witness as CommitteeLevel1Witness,
} from '../storages/CommitteeStorage.js';
import {
    EMPTY_LEVEL_1_TREE as DKG_LEVEL_1_TREE,
    Level1Witness,
    calculateKeyIndex,
} from '../storages/DKGStorage.js';
import { INSTANCE_LIMITS, ZkAppEnum, ZkProgramEnum } from '../constants.js';
import { ErrorEnum, EventEnum, ZkAppAction } from './constants.js';
import { RollupContract, processAction, verifyRollup } from './Rollup.js';

export {
    KeyStatus,
    KeyStatusInput,
    ActionEnum as DkgActionEnum,
    ActionMask as DkgActionMask,
    Action as DkgAction,
    UpdateKeyInput,
    UpdateKeyOutput,
    UpdateKey,
    UpdateKeyProof,
    DkgContract,
};

const enum KeyStatus {
    EMPTY,
    ROUND_1_CONTRIBUTION,
    ROUND_2_CONTRIBUTION,
    ACTIVE,
    DEPRECATED,
}

class KeyStatusInput extends Struct({
    committeeId: Field,
    keyId: Field,
    status: Field,
    witness: Level1Witness,
}) {}

const enum ActionEnum {
    GENERATE_KEY,
    FINALIZE_ROUND_1,
    FINALIZE_ROUND_2,
    DEPRECATE_KEY,
    __LENGTH,
}

class ActionMask extends _ActionMask(ActionEnum.__LENGTH) {}

/**
 * Class of action dispatched by users
 * @param committeeId Incremental committee index
 * @param keyId Incremental key index of a committee
 * @param mask Specify action type (defined with ActionEnum)
 * @function hash Return the action's hash to append in the action state hash chain
 * @function toFields Return the action in the form of Fields[]
 */
class Action
    extends Struct({
        committeeId: Field,
        keyId: Field,
        mask: ActionMask,
    })
    implements ZkAppAction
{
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

class UpdateKeyInput extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

class UpdateKeyOutput extends Struct({
    address: PublicKey,
    rollupRoot: Field,
    initialKeyCounterRoot: Field,
    initialKeyStatusRoot: Field,
    initialProcessRoot: Field,
    nextKeyCounterRoot: Field,
    nextKeyStatusRoot: Field,
    nextProcessRoot: Field,
    processedActions: ProcessedActions,
}) {}

const UpdateKey = ZkProgram({
    name: ZkProgramEnum.UpdateKey,
    publicInput: UpdateKeyInput,
    publicOutput: UpdateKeyOutput,
    methods: {
        init: {
            privateInputs: [PublicKey, Field, Field, Field, Field],
            method(
                input: UpdateKeyInput,
                address: PublicKey,
                rollupRoot: Field,
                initialKeyCounter: Field,
                initialKeyStatus: Field,
                initialProcessRoot: Field
            ) {
                return new UpdateKeyOutput({
                    address: address,
                    rollupRoot: rollupRoot,
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
        update: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                Level1Witness,
                ActionWitness,
                ActionWitness,
            ],
            method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                keyStatusWitness: Level1Witness,
                rollupWitness: ActionWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify key status
                let keyStatus = Provable.switch(
                    input.action.mask.values,
                    Field,
                    [
                        Field(KeyStatus.EMPTY),
                        Field(KeyStatus.ROUND_1_CONTRIBUTION),
                        Field(KeyStatus.ROUND_2_CONTRIBUTION),
                        Field(KeyStatus.ACTIVE),
                    ]
                );
                keyStatus.assertNotEquals(
                    Field(KeyStatus.EMPTY),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        UpdateKey.update.name,
                        ErrorEnum.KEY_STATUS_VALUE
                    )
                );

                // Verify the key's previous status
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                earlierProof.publicOutput.nextKeyStatusRoot.assertEquals(
                    keyStatusWitness.calculateRoot(keyStatus),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        UpdateKey.update.name,
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        UpdateKey.update.name,
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Calculate the new key status MT root
                let nextKeyStatusRoot = keyStatusWitness.calculateRoot(
                    keyStatus.add(1)
                );

                // Verify action is rolluped
                let actionIndex = Poseidon.hash(
                    [
                        earlierProof.publicOutput.address.toFields(),
                        input.action.hash(),
                        input.actionId,
                    ].flat()
                );
                verifyRollup(
                    UpdateKey.name,
                    earlierProof.publicOutput.rollupRoot,
                    actionIndex,
                    rollupWitness
                );

                // Calculate corresponding action state
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );
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
                    address: earlierProof.publicOutput.address,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
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
        generate: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                Field,
                CommitteeLevel1Witness,
                Level1Witness,
                ActionWitness,
                ActionWitness,
            ],
            method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                currKeyId: Field,
                keyCounterWitness: CommitteeLevel1Witness,
                keyStatusWitness: Level1Witness,
                rollupWitness: ActionWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify the key's previous index
                earlierProof.publicOutput.nextKeyCounterRoot.assertEquals(
                    keyCounterWitness.calculateRoot(currKeyId),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        UpdateKey.generate.name,
                        ErrorEnum.KEY_COUNTER_ROOT
                    )
                );
                input.action.committeeId.assertEquals(
                    keyCounterWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        UpdateKey.generate.name,
                        ErrorEnum.KEY_COUNTER_INDEX
                    )
                );

                // Calculate new keyCounter root
                let nextKeyCounter = keyCounterWitness.calculateRoot(
                    currKeyId.add(Field(1))
                );

                // Verify the key's previous status
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                earlierProof.publicOutput.nextKeyStatusRoot.assertEquals(
                    keyStatusWitness.calculateRoot(Field(KeyStatus.EMPTY)),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        UpdateKey.generate.name,
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        UpdateKey.generate.name,
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Calculate the new key status MT root
                let nextKeyStatus = keyStatusWitness.calculateRoot(
                    Field(KeyStatus.ROUND_1_CONTRIBUTION)
                );

                // Verify action is rolluped
                let actionIndex = Poseidon.hash(
                    [
                        earlierProof.publicOutput.address.toFields(),
                        input.action.hash(),
                        input.actionId,
                    ].flat()
                );
                verifyRollup(
                    UpdateKey.name,
                    earlierProof.publicOutput.rollupRoot,
                    actionIndex,
                    rollupWitness
                );

                // Calculate corresponding action state
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );
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
                    address: earlierProof.publicOutput.address,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
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

class UpdateKeyProof extends ZkProgram.Proof(UpdateKey) {}

class DkgContract extends SmartContract {
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
     * @description MT storing keys
     * @todo To be implemented
     */
    @state(Field) keyRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.PROCESSED]: ProcessedActions,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.keyCounterRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.keyStatusRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    /**
     * Generate a new key or deprecate an existed key
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param memberWitness Witness for proof of committee's member
     * @param committee Reference to Committee Contract
     * @param rollup Reference to Rollup Contract
     */
    @method
    committeeAction(
        keyId: Field,
        actionType: Field,
        memberWitness: CommitteeFullWitness,
        committee: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify Committee Contract address
        verifyZkApp(
            DkgContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            DkgContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify committee member
        Utils.requireSignature(this.sender);
        committeeContract.verifyMember(
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
                Utils.buildAssertMessage(
                    DkgContract.name,
                    DkgContract.prototype.committeeAction.name,
                    ErrorEnum.ACTION_TYPE
                )
            );

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.committeeAction.name,
                ErrorEnum.KEY_COUNTER_LIMIT
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

        // Record action for rollup
        rollupContract.recordAction(action.hash(), this.address);
    }

    /**
     * Finalize contributions of round 1 or 2
     * @param committeeId Global committee Id
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param round Reference to Round1/Round2 Contract
     * @param rollup Reference to Rollup Contract
     */
    @method
    finalizeContributionRound(
        committeeId: Field,
        keyId: Field,
        actionType: Field,
        round: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify action type
        actionType
            .equals(Field(ActionEnum.FINALIZE_ROUND_1))
            .or(actionType.equals(Field(ActionEnum.FINALIZE_ROUND_2)))
            .assertTrue(
                Utils.buildAssertMessage(
                    DkgContract.name,
                    DkgContract.prototype.finalizeContributionRound.name,
                    ErrorEnum.ACTION_TYPE
                )
            );

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.committeeAction.name,
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Verify caller address
        Utils.requireCaller(round.address, this);
        verifyZkApp(
            DkgContract.name,
            round,
            zkAppRoot,
            Provable.switch(
                [
                    actionType.equals(Field(ActionEnum.FINALIZE_ROUND_1)),
                    actionType.equals(Field(ActionEnum.FINALIZE_ROUND_2)),
                ],
                Field,
                [Field(ZkAppEnum.ROUND1), Field(ZkAppEnum.ROUND2)]
            )
        );

        // Verify Rollup Contract address
        verifyZkApp(
            DkgContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );
        const rollupContract = new RollupContract(rollup.address);

        // Create & dispatch action
        let action = new Action({
            committeeId: committeeId,
            keyId: keyId,
            mask: ActionMask.createMask(actionType),
        });
        this.reducer.dispatch(action);

        // Record action for rollup
        rollupContract.recordAction(action.hash(), this.address);
    }

    /**
     * Update keys' status and counter values
     * @param proof Verification proof
     */
    @method updateKeys(proof: UpdateKeyProof, rollup: ZkAppRef) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let keyCounterRoot = this.keyCounterRoot.getAndRequireEquals();
        let keyStatusRoot = this.keyStatusRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        // Verify Rollup Contract address
        verifyZkApp(
            DkgContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );
        const rollupContract = new RollupContract(rollup.address);

        // Verify proof
        proof.verify();
        proof.publicOutput.address.assertEquals(this.address);
        proof.publicOutput.rollupRoot.assertEquals(
            rollupContract.rollupRoot.getAndRequireEquals(),
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.updateKeys.name,
                ErrorEnum.ROLLUP_ROOT
            )
        );
        proof.publicOutput.initialKeyCounterRoot.assertEquals(
            keyCounterRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.updateKeys.name,
                ErrorEnum.KEY_COUNTER_ROOT
            )
        );
        proof.publicOutput.initialKeyStatusRoot.assertEquals(
            keyStatusRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.updateKeys.name,
                ErrorEnum.KEY_STATUS_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.updateKeys.name,
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
        // Verify keyId
        input.keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.verifyKeyStatus.name,
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
            .mul(input.committeeId)
            .add(input.keyId);

        this.keyStatusRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.calculateRoot(input.status),
                Utils.buildAssertMessage(
                    DkgContract.name,
                    DkgContract.prototype.verifyKeyStatus.name,
                    ErrorEnum.KEY_STATUS_ROOT
                )
            );
        keyIndex.assertEquals(
            input.witness.calculateIndex(),
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.verifyKeyStatus.name,
                ErrorEnum.KEY_STATUS_INDEX
            )
        );
    }

    /**
     * Verify a generated key
     * @param keyIndex Unique key index
     * @param key Generated value as Group
     * @param witness Witness for proof of generated key
     */
    verifyKey(keyIndex: Field, key: Group, witness: Level1Witness) {
        this.keyRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(Poseidon.hash(key.toFields())),
                Utils.buildAssertMessage(
                    DkgContract.name,
                    DkgContract.prototype.verifyKey.name,
                    ErrorEnum.KEY_ROOT
                )
            );
        keyIndex.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                DkgContract.name,
                DkgContract.prototype.verifyKey.name,
                ErrorEnum.KEY_INDEX
            )
        );
    }
}
