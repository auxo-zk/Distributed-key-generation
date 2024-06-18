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
import { rollup } from './Rollup.js';

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
    initialActionState: Field,
    initialKeyCounterRoot: Field,
    initialKeyStatusRoot: Field,
    initialKeyRoot: Field,
    nextActionState: Field,
    nextKeyCounterRoot: Field,
    nextKeyStatusRoot: Field,
    nextKeyRoot: Field,
}) {}

const UpdateKey = ZkProgram({
    name: ZkProgramEnum.UpdateKey,
    publicInput: UpdateKeyInput,
    publicOutput: UpdateKeyOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field],
            async method(
                input: UpdateKeyInput,
                initialActionState: Field,
                initialKeyCounterRoot: Field,
                initialKeyStatusRoot: Field,
                initialKeyRoot: Field
            ) {
                return new UpdateKeyOutput({
                    initialActionState,
                    initialKeyCounterRoot,
                    initialKeyStatusRoot,
                    initialKeyRoot,
                    nextActionState: initialActionState,
                    nextKeyCounterRoot: initialKeyCounterRoot,
                    nextKeyStatusRoot: initialKeyStatusRoot,
                    nextKeyRoot: initialKeyRoot,
                });
            },
        },
        update: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                DkgLevel1Witness,
                DkgLevel1Witness,
            ],
            async method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                keyStatusWitness: DkgLevel1Witness,
                keyWitness: DkgLevel1Witness
            ) {
                // Fail check
                let isFailed = Bool(false);

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
                isFailed = Utils.checkCondition(
                    keyStatus.equals(Field(KeyStatus.EMPTY)).not(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'update',
                        ErrorEnum.KEY_STATUS_VALUE
                    )
                )
                    .not()
                    .or(isFailed);

                // Verify the key's previous status
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'update',
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );
                isFailed = Utils.checkCondition(
                    earlierProof.publicOutput.nextKeyStatusRoot.equals(
                        keyStatusWitness.calculateRoot(keyStatus)
                    ),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'update',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                )
                    .not()
                    .or(isFailed);

                // Verify empty key if round 1 -> round 2
                isFailed = Utils.checkCondition(
                    earlierProof.publicOutput.nextKeyRoot
                        .equals(keyWitness.calculateRoot(Field(0)))
                        .equals(
                            keyStatus.equals(
                                Field(KeyStatus.ROUND_1_CONTRIBUTION)
                            )
                        ),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'update',
                        ErrorEnum.KEY_ROOT
                    )
                )
                    .not()
                    .or(isFailed);
                isFailed = Utils.checkCondition(
                    keyIndex.equals(keyWitness.calculateIndex()),
                    Utils.buildAssertMessage(
                        UpdateKey.name,
                        'update',
                        ErrorEnum.KEY_INDEX
                    )
                )
                    .not()
                    .or(isFailed);

                // Calculate the new key status MT root
                let nextKeyStatusRoot = Provable.if(
                    isFailed,
                    earlierProof.publicOutput.nextKeyStatusRoot,
                    keyStatusWitness.calculateRoot(keyStatus.add(1))
                );

                // Calculate new key root
                let nextKeyRoot = Provable.if(
                    keyStatus
                        .equals(Field(KeyStatus.ROUND_1_CONTRIBUTION))
                        .and(isFailed.not()),
                    keyWitness.calculateRoot(
                        Poseidon.hash(input.action.key.toFields())
                    ),
                    earlierProof.publicOutput.nextKeyRoot
                );

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                return new UpdateKeyOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextKeyStatusRoot,
                    nextKeyRoot,
                });
            },
        },
        generate: {
            privateInputs: [
                SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                Field,
                CommitteeLevel1Witness,
                DkgLevel1Witness,
            ],
            async method(
                input: UpdateKeyInput,
                earlierProof: SelfProof<UpdateKeyInput, UpdateKeyOutput>,
                currKeyId: Field,
                keyCounterWitness: CommitteeLevel1Witness,
                keyStatusWitness: DkgLevel1Witness
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
                    currKeyId
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

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );

                return new UpdateKeyOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextKeyCounterRoot,
                    nextKeyStatusRoot,
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
     * @see KeyStorage for off-chain storage implementation
     */
    @state(Field) keyRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.PROCESSED]: Field,
    };

    init() {
        super.init();
        this.zkAppRoot.set(ADDRESS_MT().getRoot());
        this.keyCounterRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.keyStatusRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.keyRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Generate a new key or deprecate an existed key
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param memberWitness Witness for proof of committee's member
     * @param committee Reference to Committee Contract
     */
    @method
    async committeeAction(
        keyId: Field,
        actionType: Field,
        memberWitness: CommitteeWitness,
        committee: ZkAppRef
    ) {
        keyId.assertLessThanOrEqual(Field(-1));
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
        const committeeContract = new CommitteeContract(committee.address);

        // Verify committee member
        let address = this.sender.getAndRequireSignature();
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address,
                committeeId,
                memberId,
                memberWitness,
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
        keyId = Provable.if(
            actionType.equals(ActionEnum.GENERATE_KEY),
            Field(-1),
            keyId
        );
        keyId
            .lessThanOrEqual(INSTANCE_LIMITS.KEY)
            .assertEquals(
                Provable.if(
                    actionType.equals(ActionEnum.GENERATE_KEY),
                    Bool(false),
                    Bool(true)
                ),
                Utils.buildAssertMessage(
                    DkgContract.name,
                    'committeeAction',
                    ErrorEnum.KEY_COUNTER_LIMIT
                )
            );

        // Create & dispatch action
        let action = new Action({
            committeeId,
            keyId,
            key: Group.zero,
            mask: ActionMask.createMask(actionType),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Finalize contributions of round 1 or 2
     * @param committeeId Global committee Id
     * @param keyId Committee's key Id
     * @param actionType Action type
     * @param round Reference to Round1/Round2 Contract
     */
    @method
    async finalizeContributionRound(
        committeeId: Field,
        keyId: Field,
        actionType: Field,
        key: Group,
        round: ZkAppRef
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

        // Create & dispatch action
        let action = new Action({
            committeeId,
            keyId,
            key,
            mask: ActionMask.createMask(actionType),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Update keys' status and counter values
     * @param proof Verification proof
     */
    @method
    async update(proof: UpdateKeyProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let keyCounterRoot = this.keyCounterRoot.getAndRequireEquals();
        let keyStatusRoot = this.keyStatusRoot.getAndRequireEquals();
        let keyRoot = this.keyRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify rollup
        rollup(
            CommitteeContract.name,
            proof.publicOutput,
            curActionState,
            lastActionState
        );

        // Verify proof
        proof.verify();
        proof.publicOutput.initialKeyCounterRoot.assertEquals(
            keyCounterRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                'update',
                ErrorEnum.KEY_COUNTER_ROOT
            )
        );
        proof.publicOutput.initialKeyStatusRoot.assertEquals(
            keyStatusRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                'update',
                ErrorEnum.KEY_STATUS_ROOT
            )
        );
        proof.publicOutput.initialKeyRoot.assertEquals(
            keyRoot,
            Utils.buildAssertMessage(
                DkgContract.name,
                'update',
                ErrorEnum.KEY_ROOT
            )
        );

        // Set new state values
        this.actionState.set(proof.publicOutput.nextActionState);
        this.keyCounterRoot.set(proof.publicOutput.nextKeyCounterRoot);
        this.keyStatusRoot.set(proof.publicOutput.nextKeyStatusRoot);
        this.keyRoot.set(proof.publicOutput.nextKeyRoot);

        // Emit rollup event
        this.emitEvent(EventEnum.PROCESSED, lastActionState);
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

        let keyIndex = calculateKeyIndex(input.committeeId, input.keyId);

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
