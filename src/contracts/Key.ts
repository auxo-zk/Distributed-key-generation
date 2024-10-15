import {
    Bool,
    Field,
    Group,
    Poseidon,
    Reducer,
    SmartContract,
    State,
    Struct,
    method,
    state,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { CommitteeMemberInput, CommitteeContract } from './Committee.js';
import { AddressMap, ZkAppRef } from '../storages/AddressStorage.js';
import {
    KeeFeeStorage,
    KeyStatusStorage,
    KeyStorage,
    calculateKeyIndex,
} from '../storages/KeyStorage.js';
import { INST_BIT_LIMITS, INST_LIMITS, NETWORK_LIMITS } from '../constants.js';
import { ErrorEnum, EventEnum, ZkAppAction, ZkAppIndex } from './constants.js';
import {
    CommitteeMemberWitness,
    EmptyCommitteeMT,
    EmptyKeyMT,
    KeyWitness,
} from '../storages/Merklized.js';
import { RollupKeyProof } from './KeyProgram.js';

export {
    KeyStatus,
    ActionEnum as KeyActionEnum,
    Action as KeyAction,
    KeyStatusInput,
    KeyInput,
    KeyFeeInput,
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

const { COMMITTEE, KEY } = INST_BIT_LIMITS;

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
        packedData: Field, // Pack = [committeeId, keyId, actionType]
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
            ...committeeId.toBits(COMMITTEE),
            ...keyId.toBits(KEY),
            ...actionType.toBits(Utils.getBitLength(ActionEnum.__LENGTH)),
        ]);
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
    get committeeId(): Field {
        return Field.fromBits(this.packedData.toBits().slice(0, COMMITTEE));
    }
    get keyId(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(COMMITTEE, COMMITTEE + KEY)
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY,
                    COMMITTEE + KEY + Utils.getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}

class KeyStatusInput extends Struct({
    committeeId: Field,
    keyId: Field,
    status: Field,
    witness: KeyWitness,
}) {}

class KeyInput extends Struct({
    committeeId: Field,
    keyId: Field,
    key: Group,
    witness: KeyWitness,
}) {}

class KeyFeeInput extends Struct({
    committeeId: Field,
    keyId: Field,
    fee: Field,
    witness: KeyWitness,
}) {}

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
    @state(Field) actionState = State<Field>(Reducer.initialActionState);

    /**
     * Slot 2
     * @description MT storing incremental counter of committees' keys
     * @see KeyCounterStorage for off-chain storage implementation
     */
    @state(Field) keyCounterRoot = State<Field>(EmptyCommitteeMT().getRoot());

    /**
     * Slot 3
     * @description MT storing keys' status
     * @see KeyStatusStorage for off-chain storage implementation
     */
    @state(Field) keyStatusRoot = State<Field>(EmptyKeyMT().getRoot());

    /**
     * Slot 4
     * @description MT storing keys
     * @see KeyStorage for off-chain storage implementation
     */
    @state(Field) keyRoot = State<Field>(EmptyKeyMT().getRoot());

    /**
     * Slot 5
     * @description MT storing key usage fee
     * @see KeeFeeStorage for off-chain storage implementation
     */
    @state(Field) keyUsageFeeRoot = State<Field>(EmptyKeyMT().getRoot());

    reducer = Reducer({ actionType: Action });
    events = {
        [EventEnum.ROLLUPED]: Field,
    };

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
        memberWitness: CommitteeMemberWitness,
        committee: ZkAppRef
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
                Field(INST_LIMITS.KEY),
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
        memberWitness: CommitteeMemberWitness,
        committee: ZkAppRef
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
        contribution: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INST_LIMITS.KEY,
            Utils.buildAssertMessage(
                KeyContract.name,
                'finalize',
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
     * Update keys by rollup actions
     * @param proof RollupKeyProof
     */
    @method
    async update(proof: RollupKeyProof) {
        // Verify proof
        proof.verify();

        // Get on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let latestActionState = this.account.actionState.getAndRequireEquals();
        let keyCounterRoot = this.keyCounterRoot.getAndRequireEquals();
        let keyStatusRoot = this.keyStatusRoot.getAndRequireEquals();
        let keyRoot = this.keyRoot.getAndRequireEquals();
        let keyUsageFeeRoot = this.keyUsageFeeRoot.getAndRequireEquals();

        // Update action state
        Utils.assertRollupActions(
            proof.publicOutput,
            curActionState,
            latestActionState,
            this.reducer.getActions({
                fromActionState: curActionState,
            }),
            NETWORK_LIMITS.ROLLUP_ACTIONS
        );
        this.actionState.set(proof.publicOutput.nextActionState);

        // Update on-chain states
        Utils.assertRollupFields(
            [
                proof.publicOutput.initialKeyCounterRoot,
                proof.publicOutput.initialKeyStatusRoot,
                proof.publicOutput.initialKeyRoot,
                proof.publicOutput.initialKeyFeeRoot,
            ],
            [keyCounterRoot, keyStatusRoot, keyRoot, keyUsageFeeRoot],
            4
        );
        this.keyCounterRoot.set(proof.publicOutput.nextKeyCounterRoot);
        this.keyStatusRoot.set(proof.publicOutput.nextKeyStatusRoot);
        this.keyRoot.set(proof.publicOutput.nextKeyRoot);
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
            INST_LIMITS.KEY,
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
            INST_LIMITS.KEY,
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
            INST_LIMITS.KEY,
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
