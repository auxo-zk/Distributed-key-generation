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
    Group,
    UInt8,
    Bool,
} from 'o1js';
import { ActionMask as _ActionMask, Utils } from '@auxo-dev/auxo-libs';
import { CommitteeMemberInput, CommitteeContract } from './Committee.js';
import {
    ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from '../storages/AddressStorage.js';
import {
    PROCESS_MT,
    ProcessWitness,
    ProcessedActions,
    processAction,
} from '../storages/ProcessStorage.js';
import {
    COMMITTEE_LEVEL_1_TREE,
    CommitteeLevel1Witness,
    CommitteeWitness,
} from '../storages/CommitteeStorage.js';
import {
    DKG_LEVEL_1_TREE,
    DkgLevel1Witness,
    calculateKeyIndex,
} from '../storages/DkgStorage.js';
import { INSTANCE_LIMITS } from '../constants.js';
import {
    ErrorEnum,
    EventEnum,
    ZkAppAction,
    ZkAppIndex,
    ZkProgramEnum,
} from './constants.js';
import { RollupContract, verifyRollup } from './Rollup.js';
import {
    RollupWitness,
    calculateActionIndex,
} from '../storages/RollupStorage.js';

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
    witness: DkgLevel1Witness,
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
        key: Group,
        mask: ActionMask,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            committeeId: Field(0),
            keyId: Field(0),
            key: Group.zero,
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
    rollupRoot: Field,
    initialKeyCounterRoot: Field,
    initialKeyStatusRoot: Field,
    initialKeyRoot: Field,
    initialProcessRoot: Field,
    nextKeyCounterRoot: Field,
    nextKeyStatusRoot: Field,
    nextKeyRoot: Field,
    nextProcessRoot: Field,
    processedActions: ProcessedActions,
}) {}

const UpdateKey = ZkProgram({
    name: ZkProgramEnum.UpdateKey,
    publicInput: UpdateKeyInput,
    publicOutput: UpdateKeyOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field],
            async method(
                input: UpdateKeyInput,
                rollupRoot: Field,
                initialKeyCounterRoot: Field,
                initialKeyStatusRoot: Field,
                initialKeyRoot: Field,
                initialProcessRoot: Field
            ) {
                return new UpdateKeyOutput({
                    rollupRoot,
                    initialKeyCounterRoot,
                    initialKeyStatusRoot,
                    initialKeyRoot,
                    initialProcessRoot,
                    nextKeyCounterRoot: initialKeyCounterRoot,
                    nextKeyStatusRoot: initialKeyStatusRoot,
                    nextKeyRoot: initialKeyRoot,
                    nextProcessRoot: initialProcessRoot,
                    processedActions: new ProcessedActions(),
                });
            },
        },
        update: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                DkgLevel1Witness,
                DkgLevel1Witness,
                RollupWitness,
                ProcessWitness,
            ],
            async method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                keyStatusWitness: DkgLevel1Witness,
                keyWitness: DkgLevel1Witness,
                rollupWitness: RollupWitness,
                processWitness: ProcessWitness
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
                        'update',
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
                        'update',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'update',
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Calculate the new key status MT root
                let nextKeyStatusRoot = keyStatusWitness.calculateRoot(
                    keyStatus.add(1)
                );

                // Verify empty key if round 1 -> round 2
                earlierProof.publicOutput.nextKeyRoot
                    .equals(keyWitness.calculateRoot(Field(0)))
                    .assertEquals(
                        Provable.if(
                            keyStatus.equals(
                                Field(KeyStatus.ROUND_1_CONTRIBUTION)
                            ),
                            Bool(true),
                            Bool(false)
                        ),
                        Utils.buildAssertMessage(
                            UpdateKey.name,
                            'update',
                            ErrorEnum.KEY_ROOT
                        )
                    );
                keyIndex.assertEquals(
                    keyWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'update',
                        ErrorEnum.KEY_INDEX
                    )
                );

                // Calculate new key root
                let nextKeyRoot = Provable.if(
                    keyStatus.equals(Field(KeyStatus.ROUND_1_CONTRIBUTION)),
                    keyWitness.calculateRoot(
                        Poseidon.hash(input.action.key.toFields())
                    ),
                    earlierProof.publicOutput.nextKeyRoot
                );

                // Verify action is rolluped
                let actionIndex = calculateActionIndex(
                    Field(ZkAppIndex.DKG),
                    input.actionId
                );
                verifyRollup(
                    UpdateKey.name,
                    actionIndex,
                    input.action.hash(),
                    earlierProof.publicOutput.rollupRoot,
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
                    input.actionId,
                    UInt8.from(0),
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new UpdateKeyOutput({
                    ...earlierProof.publicOutput,
                    nextKeyStatusRoot,
                    nextKeyRoot,
                    nextProcessRoot,
                    processedActions,
                });
            },
        },
        generate: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                Field,
                CommitteeLevel1Witness,
                DkgLevel1Witness,
                RollupWitness,
                ProcessWitness,
            ],
            async method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                currKeyId: Field,
                keyCounterWitness: CommitteeLevel1Witness,
                keyStatusWitness: DkgLevel1Witness,
                rollupWitness: RollupWitness,
                processWitness: ProcessWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify the key's previous index
                earlierProof.publicOutput.nextKeyCounterRoot.assertEquals(
                    keyCounterWitness.calculateRoot(currKeyId),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'generate',
                        ErrorEnum.KEY_COUNTER_ROOT
                    )
                );
                input.action.committeeId.assertEquals(
                    keyCounterWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'generate',
                        ErrorEnum.KEY_COUNTER_INDEX
                    )
                );

                // Calculate new keyCounter root
                let nextKeyCounterRoot = keyCounterWitness.calculateRoot(
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
                        'generate',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'generate',
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Calculate the new key status MT root
                let nextKeyStatusRoot = keyStatusWitness.calculateRoot(
                    Field(KeyStatus.ROUND_1_CONTRIBUTION)
                );

                // Verify action is rolluped
                let actionIndex = calculateActionIndex(
                    Field(ZkAppIndex.DKG),
                    input.actionId
                );
                verifyRollup(
                    UpdateKey.name,
                    actionIndex,
                    input.action.hash(),
                    earlierProof.publicOutput.rollupRoot,
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
                    input.actionId,
                    UInt8.from(0),
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new UpdateKeyOutput({
                    ...earlierProof.publicOutput,
                    nextKeyCounterRoot,
                    nextKeyStatusRoot,
                    nextProcessRoot,
                    processedActions,
                });
            },
        },
    },
});

class UpdateKeyProof extends ZkProgram.Proof(UpdateKey) {}

class DkgContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     * @see AddressStorage for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing incremental counter of committees' keys
     * @see KeyCounterStorage for off-chain storage implementation
     */
    @state(Field) keyCounterRoot = State<Field>();

    /**
     * @description MT storing keys' status
     * @see KeyStatusStorage for off-chain storage implementation
     */
    @state(Field) keyStatusRoot = State<Field>();

    /**
     * @description MT storing keys
     * @todo To be implemented
     */
    @state(Field) keyRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     * @see ActionSto
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.PROCESSED]: ProcessedActions,
    };

    init() {
        super.init();
        this.zkAppRoot.set(ADDRESS_MT().getRoot());
        this.keyCounterRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.keyStatusRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.processRoot.set(PROCESS_MT().getRoot());
    }

    /**
     * Generate a new key or deprecate an existed key
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param memberWitness Witness for proof of committee's member
     * @param committee Reference to Committee Contract
     * @param rollup Reference to Rollup Contract
     * @param selfRef Reference to this contract itself
     */
    @method
    async committeeAction(
        keyId: Field,
        actionType: Field,
        memberWitness: CommitteeWitness,
        committee: ZkAppRef,
        rollup: ZkAppRef,
        selfRef: ZkAppRef
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
            Field(ZkAppIndex.COMMITTEE)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            DkgContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify committee member
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address: this.sender.getAndRequireSignature(),
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
                    'committeeAction',
                    ErrorEnum.ACTION_TYPE
                )
            );

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                DkgContract.name,
                'committeeAction',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Create & dispatch action
        let action = new Action({
            committeeId,
            keyId: Provable.if(
                actionType.equals(ActionEnum.GENERATE_KEY),
                Field(-1),
                keyId
            ),
            key: Group.zero,
            mask: ActionMask.createMask(actionType),
        });
        this.reducer.dispatch(action);

        // Record action for rollup
        selfRef.address.assertEquals(this.address);
        await rollupContract.recordAction(action.hash(), selfRef);
    }

    /**
     * Finalize contributions of round 1 or 2
     * @param committeeId Global committee Id
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param round Reference to Round1/Round2 Contract
     * @param rollup Reference to Rollup Contract
     * @param selfRef Reference to this contract itself
     */
    @method
    async finalizeContributionRound(
        committeeId: Field,
        keyId: Field,
        actionType: Field,
        key: Group,
        round: ZkAppRef,
        rollup: ZkAppRef,
        selfRef: ZkAppRef
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
                    'finalizeContributionRound',
                    ErrorEnum.ACTION_TYPE
                )
            );

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                DkgContract.name,
                'finalizeContributionRound',
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
                [Field(ZkAppIndex.ROUND1), Field(ZkAppIndex.ROUND2)]
            )
        );

        const rollupContract = new RollupContract(rollup.address);

        // Create & dispatch action
        let action = new Action({
            committeeId,
            keyId,
            key,
            mask: ActionMask.createMask(actionType),
        });
        this.reducer.dispatch(action);

        // Record action for rollup
        selfRef.address.assertEquals(this.address);
        await rollupContract.recordAction(action.hash(), selfRef);
    }

    /**
     * Update keys' status and counter values
     * @param proof Verification proof
     */
    @method
    async updateKeys(proof: UpdateKeyProof, rollup: ZkAppRef) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let keyCounterRoot = this.keyCounterRoot.getAndRequireEquals();
        let keyStatusRoot = this.keyStatusRoot.getAndRequireEquals();
        let keyRoot = this.keyRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        // Verify Rollup Contract address
        verifyZkApp(
            DkgContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );
        const rollupContract = new RollupContract(rollup.address);

        // Verify proof
        proof.verify();
        proof.publicOutput.rollupRoot.assertEquals(
            rollupContract.rollupRoot.getAndRequireEquals(),
            Utils.buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.ROLLUP_ROOT
            )
        );
        proof.publicOutput.initialKeyCounterRoot.assertEquals(
            keyCounterRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.KEY_COUNTER_ROOT
            )
        );
        proof.publicOutput.initialKeyStatusRoot.assertEquals(
            keyStatusRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.KEY_STATUS_ROOT
            )
        );
        proof.publicOutput.initialKeyRoot.assertEquals(
            keyRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.KEY_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                'updateKeys',
                ErrorEnum.PROCESS_ROOT
            )
        );

        // Set new state values
        this.keyCounterRoot.set(proof.publicOutput.nextKeyCounterRoot);
        this.keyStatusRoot.set(proof.publicOutput.nextKeyStatusRoot);
        this.keyRoot.set(proof.publicOutput.nextKeyRoot);
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
                'verifyKeyStatus',
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
                    'verifyKeyStatus',
                    ErrorEnum.KEY_STATUS_ROOT
                )
            );
        keyIndex.assertEquals(
            input.witness.calculateIndex(),
            Utils.buildAssertMessage(
                DkgContract.name,
                'verifyKeyStatus',
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
    verifyKey(keyIndex: Field, key: Group, witness: DkgLevel1Witness) {
        this.keyRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(Poseidon.hash(key.toFields())),
                Utils.buildAssertMessage(
                    DkgContract.name,
                    'verifyKey',
                    ErrorEnum.KEY_ROOT
                )
            );
        keyIndex.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                DkgContract.name,
                'verifyKey',
                ErrorEnum.KEY_INDEX
            )
        );
    }
}
