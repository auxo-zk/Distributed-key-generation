import {
    Field,
    method,
    Poseidon,
    Reducer,
    SmartContract,
    state,
    State,
    Struct,
    ZkProgram,
    Group,
    Bool,
    SelfProof,
    Void,
    Provable,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { CommitteeMemberInput, CommitteeContract } from './Committee.js';
import { AddressMap, ZkAppRef } from '../storages/AddressStorage.js';
import { ProcessedActions } from '../storages/ProcessStorage.js';
import {
    COMMITTEE_LEVEL_1_TREE,
    CommitteeLevel1Witness,
    CommitteeWitness,
} from '../storages/CommitteeStorage.js';
import {
    KEY_LEVEL_1_TREE,
    KeeFeeStorage,
    KeyLevel1Witness,
    KeyStatusStorage,
    KeyStorage,
    calculateKeyIndex,
} from '../storages/KeyStorage.js';
import { INSTANCE_LIMITS } from '../constants.js';
import {
    ErrorEnum,
    EventEnum,
    ZkAppAction,
    ZkAppIndex,
    ZkProgramEnum,
} from './constants.js';
import { getBitLength } from '../libs/index.js';
import { rollup, rollupField } from './Rollup.js';

export {
    KeyStatus,
    ActionEnum as DkgActionEnum,
    Action as DkgAction,
    KeyStatusInput,
    KeyInput,
    KeyFeeInput,
    RollupKeyOutput,
    RollupKey,
    RollupKeyProof,
    KeyContract,
};

const enum KeyStatus {
    EMPTY,
    CONTRIBUTION,
    ACTIVE,
    DEPRECATED,
}

const enum ActionEnum {
    GENERATE,
    FINALIZE,
    DEPRECATE,
    __LENGTH,
}

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
        packedData: Field,
        fee: Field,
        key: Group,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            fee: Field(0),
            key: Group.zero,
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static pack(committeeId: Field, keyId: Field, actionType: Field): Field {
        return Field.fromBits([
            ...committeeId.toBits(getBitLength(INSTANCE_LIMITS.COMMITTEE)),
            ...keyId.toBits(getBitLength(INSTANCE_LIMITS.KEY)),
            ...actionType.toBits(getBitLength(ActionEnum.__LENGTH)),
        ]);
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
    get committeeId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(0, getBitLength(INSTANCE_LIMITS.COMMITTEE))
        );
    }
    get keyId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    getBitLength(INSTANCE_LIMITS.COMMITTEE),
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        getBitLength(INSTANCE_LIMITS.KEY)
                )
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        getBitLength(INSTANCE_LIMITS.KEY),
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        getBitLength(INSTANCE_LIMITS.KEY) +
                        getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}

class KeyStatusInput extends Struct({
    committeeId: Field,
    keyId: Field,
    status: Field,
    witness: KeyLevel1Witness,
}) {}

class KeyInput extends Struct({
    committeeId: Field,
    keyId: Field,
    key: Group,
    witness: KeyLevel1Witness,
}) {}

class KeyFeeInput extends Struct({
    committeeId: Field,
    keyId: Field,
    fee: Field,
    witness: KeyLevel1Witness,
}) {}

class RollupKeyOutput extends Struct({
    initialActionState: Field,
    initialKeyCounterRoot: Field,
    initialKeyStatusRoot: Field,
    initialKeyRoot: Field,
    initialKeyFeeRoot: Field,
    nextActionState: Field,
    nextKeyCounterRoot: Field,
    nextKeyStatusRoot: Field,
    nextKeyRoot: Field,
    nextKeyFeeRoot: Field,
}) {}

const RollupKey = ZkProgram({
    name: ZkProgramEnum.RollupKey,
    publicOutput: RollupKeyOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field],
            async method(
                initialActionState: Field,
                initialKeyCounterRoot: Field,
                initialKeyStatusRoot: Field,
                initialKeyRoot: Field,
                initialKeyFeeRoot: Field
            ) {
                return new RollupKeyOutput({
                    initialActionState,
                    initialKeyCounterRoot,
                    initialKeyStatusRoot,
                    initialKeyRoot,
                    initialKeyFeeRoot,
                    nextActionState: initialActionState,
                    nextKeyCounterRoot: initialKeyCounterRoot,
                    nextKeyStatusRoot: initialKeyStatusRoot,
                    nextKeyRoot: initialKeyRoot,
                    nextKeyFeeRoot: initialKeyFeeRoot,
                });
            },
        },

        /**
         * Process GENERATE action
         * @param earlierProof Previous recursive proof
         * @param action Action to be processed
         * @param currKeyId Current key index
         * @param keyCounterWitness Witness for key counter MT
         * @param keyStatusWitness Witness for key status MT
         * @param keyFeeWitness Witness for key fee MT
         */
        generate: {
            privateInputs: [
                SelfProof<Void, RollupKeyOutput>,
                Action,
                Field,
                CommitteeLevel1Witness,
                KeyLevel1Witness,
                KeyLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupKeyOutput>,
                action: Action,
                currKeyId: Field,
                keyCounterWitness: typeof CommitteeLevel1Witness,
                keyStatusWitness: typeof KeyLevel1Witness,
                keyFeeWitness: typeof KeyLevel1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                action.actionType.assertNotEquals(
                    Field(ActionEnum.GENERATE),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Verify the key's previous index
                earlierProof.publicOutput.nextKeyCounterRoot.assertEquals(
                    keyCounterWitness.calculateRoot(currKeyId),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_COUNTER_ROOT
                    )
                );
                action.committeeId.assertEquals(
                    keyCounterWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_COUNTER_INDEX
                    )
                );

                let keyIndex = calculateKeyIndex(action.committeeId, currKeyId);
                // Verify the key's previous status
                earlierProof.publicOutput.nextKeyStatusRoot.assertEquals(
                    keyStatusWitness.calculateRoot(Field(KeyStatus.EMPTY)),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Verify empty key usage fee
                earlierProof.publicOutput.nextKeyFeeRoot.assertEquals(
                    keyFeeWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_FEE_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyFeeWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_FEE_INDEX
                    )
                );

                // Update keyCounterRoot
                let nextKeyCounterRoot = keyCounterWitness.calculateRoot(
                    currKeyId.add(Field(1))
                );

                // Update keyStatusRoot
                let nextKeyStatusRoot = keyStatusWitness.calculateRoot(
                    Field(KeyStatus.CONTRIBUTION)
                );

                // Update keyFeeRoot
                let nextKeyFeeRoot = keyFeeWitness.calculateRoot(action.fee);

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(action)]
                );

                return new RollupKeyOutput({
                    ...earlierProof.publicOutput,
                    nextKeyCounterRoot,
                    nextKeyStatusRoot,
                    nextKeyFeeRoot,
                    nextActionState,
                });
            },
        },

        /**
         * Process FINALIZE & DEPRECATE action
         * @param earlierProof Previous recursive proof
         * @param action Action to be processed
         * @param keyStatusWitness Witness for key status MT
         * @param keyWitness Witness for key MT
         */
        update: {
            privateInputs: [
                SelfProof<Void, RollupKeyOutput>,
                Action,
                KeyLevel1Witness,
                KeyLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupKeyOutput>,
                action: Action,
                keyStatusWitness: typeof KeyLevel1Witness,
                keyWitness: typeof KeyLevel1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                action.actionType.assertNotEquals(
                    Field(ActionEnum.GENERATE),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'update',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Skip invalid action
                let invalidAction = Bool(false);

                // Verify key status
                let keyStatus = Provable.switch(
                    [
                        action.actionType.equals(Field(ActionEnum.FINALIZE)),
                        action.actionType.equals(Field(ActionEnum.DEPRECATE)),
                    ],
                    Field,
                    [Field(KeyStatus.CONTRIBUTION), Field(KeyStatus.ACTIVE)]
                );

                // Verify the key's previous status
                // Invalid cause: key status is already finalized / deprecated
                let keyIndex = calculateKeyIndex(
                    action.committeeId,
                    action.keyId
                );
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyStatusRoot.equals(
                        keyStatusWitness.calculateRoot(keyStatus)
                    ),
                    'Skip invalid action: ' +
                        Utils.buildAssertMessage(
                            RollupKey.name,
                            'update',
                            ErrorEnum.KEY_STATUS_ROOT
                        )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'update',
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Verify empty key if CONTRIBUTION -> ACTIVE
                // Invalid cause: key is already finalized
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyRoot
                        .equals(keyWitness.calculateRoot(Field(0)))
                        .or(keyStatus.equals(Field(KeyStatus.ACTIVE))),
                    'Skip invalid action: ' +
                        Utils.buildAssertMessage(
                            RollupKey.name,
                            'update',
                            ErrorEnum.KEY_ROOT
                        )
                );
                keyIndex.assertEquals(
                    keyWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'update',
                        ErrorEnum.KEY_INDEX
                    )
                );

                // Update keyStatusRoot if action is valid
                let nextKeyStatusRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyStatusRoot,
                    keyStatusWitness.calculateRoot(keyStatus.add(1))
                );

                // Update keyRoot if action is valid and key is empty
                let nextKeyRoot = Provable.if(
                    keyStatus.equals(Field(KeyStatus.ACTIVE)).or(invalidAction),
                    earlierProof.publicOutput.nextKeyRoot,
                    keyWitness.calculateRoot(
                        KeyStorage.calculateLeaf(action.key)
                    )
                );

                // Update action state if action is valid
                let nextActionState = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextActionState,
                    Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [Action.toFields(action)]
                    )
                );

                return new RollupKeyOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextKeyStatusRoot,
                    nextKeyRoot,
                });
            },
        },
    },
});

class RollupKeyProof extends ZkProgram.Proof(RollupKey) {}

class KeyContract extends SmartContract {
    /**
     * Slot 0
     * @description MT storing addresses of other zkApps
     * @see AddressStorage for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * Slot 1
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    /**
     * Slot 2
     * @description MT storing incremental counter of committees' keys
     * @see KeyCounterStorage for off-chain storage implementation
     */
    @state(Field) keyCounterRoot = State<Field>();

    /**
     * Slot 3
     * @description MT storing keys' status
     * @see KeyStatusStorage for off-chain storage implementation
     */
    @state(Field) keyStatusRoot = State<Field>();

    /**
     * Slot 4
     * @description MT storing keys
     * @see KeyStorage for off-chain storage implementation
     */
    @state(Field) keyRoot = State<Field>();

    /**
     * Slot 5
     * @description MT storing key usage fee
     * @see KeeFeeStorage for off-chain storage implementation
     */
    @state(Field) keyUsageFeeRoot = State<Field>();

    reducer = Reducer({ actionType: Action });
    events = {
        [EventEnum.ROLLUPED]: ProcessedActions,
    };

    init() {
        super.init();
        this.keyCounterRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.keyStatusRoot.set(KEY_LEVEL_1_TREE().getRoot());
        this.keyRoot.set(KEY_LEVEL_1_TREE().getRoot());
        this.keyUsageFeeRoot.set(KEY_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Generate a new key
     * Actions: dispatch 1 action of type GENERATE
     * @param usageFee Key usage fee
     * @param memberWitness Witness for proof of committee's member
     * @param committee Reference to Committee Contract
     */
    @method
    async generateKey(
        usageFee: Field,
        memberWitness: CommitteeWitness,
        committee: InstanceType<typeof ZkAppRef>
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify Committee Contract address
        AddressMap.verifyZkApp(
            KeyContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );
        const committeeContract = new CommitteeContract(committee.address);

        // Verify committee member
        let address = this.sender.getAndRequireSignatureV2();
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address,
                committeeId,
                memberId,
                isActive: Bool(true),
                memberWitness,
            })
        );

        // Create & dispatch action
        let action = new Action({
            packedData: Action.pack(
                committeeId,
                Field(INSTANCE_LIMITS.KEY),
                Field(ActionEnum.GENERATE)
            ),
            fee: usageFee,
            key: Group.zero,
        });
        this.reducer.dispatch(action);
    }

    @method
    async deprecate(
        keyId: Field,
        memberWitness: CommitteeWitness,
        committee: InstanceType<typeof ZkAppRef>
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify Committee Contract address
        AddressMap.verifyZkApp(
            KeyContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );
        const committeeContract = new CommitteeContract(committee.address);

        // Verify committee member
        let address = this.sender.getAndRequireSignatureV2();
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address,
                committeeId,
                memberId,
                isActive: Bool(true),
                memberWitness,
            })
        );

        // Create & dispatch action
        let action = new Action({
            packedData: Action.pack(
                committeeId,
                keyId,
                Field(ActionEnum.DEPRECATE)
            ),
            fee: Field(0),
            key: Group.zero,
        });
        this.reducer.dispatch(action);
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
    async finalize(
        committeeId: Field,
        keyId: Field,
        key: Group,
        contribution: InstanceType<typeof ZkAppRef>
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                KeyContract.name,
                'finalizeContributionRound',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Verify caller address
        Utils.requireCaller(contribution.address, this);
        AddressMap.verifyZkApp(
            KeyContract.name,
            contribution,
            zkAppRoot,
            Field(ZkAppIndex.CONTRIBUTION)
        );

        // Create & dispatch action
        let action = new Action({
            packedData: Action.pack(
                committeeId,
                keyId,
                Field(ActionEnum.FINALIZE)
            ),
            fee: Field(0),
            key,
        });
        this.reducer.dispatch(action);
    }

    /**
     * Update keys' status and counter values
     * @param proof RollupKeyProof
     */
    @method
    async update(proof: RollupKeyProof) {
        // Verify proof
        proof.verify();

        // Get on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();
        let keyCounterRoot = this.keyCounterRoot.getAndRequireEquals();
        let keyStatusRoot = this.keyStatusRoot.getAndRequireEquals();
        let keyRoot = this.keyRoot.getAndRequireEquals();
        let keyUsageFeeRoot = this.keyUsageFeeRoot.getAndRequireEquals();

        // Update action state
        rollup(
            CommitteeContract.name,
            proof.publicOutput,
            curActionState,
            lastActionState
        );
        this.actionState.set(proof.publicOutput.nextActionState);

        // Update key counter root
        rollupField(
            KeyContract.name,
            proof.publicOutput.initialKeyCounterRoot,
            keyCounterRoot
        );
        this.keyCounterRoot.set(proof.publicOutput.nextKeyCounterRoot);

        // Update key status root
        rollupField(
            KeyContract.name,
            proof.publicOutput.initialKeyStatusRoot,
            keyStatusRoot
        );
        this.keyStatusRoot.set(proof.publicOutput.nextKeyStatusRoot);

        // Update key root
        rollupField(
            KeyContract.name,
            proof.publicOutput.initialKeyRoot,
            keyRoot
        );
        this.keyRoot.set(proof.publicOutput.nextKeyRoot);

        // Update key usage fee root
        rollupField(
            KeyContract.name,
            proof.publicOutput.initialKeyFeeRoot,
            keyUsageFeeRoot
        );
        this.keyUsageFeeRoot.set(proof.publicOutput.nextKeyFeeRoot);

        this.emitEvent(EventEnum.ROLLUPED, proof.publicOutput.nextActionState);
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
                KeyContract.name,
                'verifyKeyStatus',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );
        let keyIndex = calculateKeyIndex(input.committeeId, input.keyId);
        this.keyStatusRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.calculateRoot(
                    KeyStatusStorage.calculateLeaf(input.status)
                ),
                Utils.buildAssertMessage(
                    KeyContract.name,
                    'verifyKeyStatus',
                    ErrorEnum.KEY_STATUS_ROOT
                )
            );
        keyIndex.assertEquals(
            input.witness.calculateIndex(),
            Utils.buildAssertMessage(
                KeyContract.name,
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
    verifyKey(input: KeyInput) {
        // Verify keyId
        input.keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                KeyContract.name,
                'verifyKeyStatus',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );
        let keyIndex = calculateKeyIndex(input.committeeId, input.keyId);
        this.keyRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.calculateRoot(
                    KeyStorage.calculateLeaf(input.key)
                ),
                Utils.buildAssertMessage(
                    KeyContract.name,
                    'verifyKey',
                    ErrorEnum.KEY_ROOT
                )
            );
        keyIndex.assertEquals(
            input.witness.calculateIndex(),
            Utils.buildAssertMessage(
                KeyContract.name,
                'verifyKey',
                ErrorEnum.KEY_INDEX
            )
        );
    }

    /**
     * Verify key usage fee
     * @param input Verification input
     */
    verifyKeyFee(input: KeyFeeInput) {
        // Verify keyId
        input.keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                KeyContract.name,
                'verifyKeyFee',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );
        let keyIndex = calculateKeyIndex(input.committeeId, input.keyId);
        this.keyUsageFeeRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.calculateRoot(
                    KeeFeeStorage.calculateLeaf(input.fee)
                ),
                Utils.buildAssertMessage(
                    KeyContract.name,
                    'verifyKeyFee',
                    ErrorEnum.KEY_FEE_ROOT
                )
            );
        keyIndex.assertEquals(
            input.witness.calculateIndex(),
            Utils.buildAssertMessage(
                KeyContract.name,
                'verifyKeyFee',
                ErrorEnum.KEY_FEE_INDEX
            )
        );
    }
}
