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
import { DynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { MemberFieldArray, MemberGroupArray } from '../libs/types.js';
import { calculateKeyIndex } from '../storages/KeyStorage.js';
import {
    CommitteeConfigInput,
    CommitteeMemberInput,
    CommitteeContract,
} from './Committee.js';
import { KeyContract } from './Key.js';
import { INST_BIT_LIMITS, INST_LIMITS, NETWORK_LIMITS } from '../constants.js';
import { AddressMap, ZkAppRef } from '../storages/AddressStorage.js';
import { ErrorEnum, EventEnum, ZkAppAction, ZkAppIndex } from './constants.js';
import {
    CommitteeWitness,
    CommitteeMemberWitness,
    EmptyKeyMT,
    KeyWitness,
    KeyMemberWitness,
    EmptyMemberMT,
} from '../storages/Merklized.js';
import {
    BatchDecryptionProof,
    BatchEncryptionProof,
    BatchPolyCommitmentProof,
    RollupContributionProof,
} from './ContributionProgram.js';

// class CommitteeWitness extends _CommitteeWitness {}

export {
    ActionEnum as ContributionActionEnum,
    Action as ContributionAction,
    CommitPolynomialActions,
    ContributeActions,
    CommitShareActions,
    ContributionContract,
};

const enum ActionEnum {
    COMMIT_POLY,
    CONTRIBUTE,
    COMMIT_SHARE,
    __LENGTH,
}

const { COMMITTEE, KEY, MEMBER, THRESHOLD } = INST_BIT_LIMITS;

class Action
    extends Struct({
        packedData: Field, // Pack = [committeeId, keyId, memberId, targetId, N, T, actionType]
        G: Group, // Used for both polynomial commitments and contribution encryptions
        c: Field,
        f: Field, // Used for both polynomial commitments and share commitments
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            G: Group.zero,
            c: Field(0),
            f: Field(0),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static pack(
        committeeId: Field,
        keyId: Field,
        memberId: Field,
        targetId: Field,
        N: Field,
        T: Field,
        actionType: Field
    ): Field {
        return Field.fromBits([
            ...committeeId.toBits(COMMITTEE),
            ...keyId.toBits(KEY),
            ...memberId.toBits(MEMBER),
            ...targetId.toBits(MEMBER),
            ...N.toBits(MEMBER),
            ...T.toBits(THRESHOLD),
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
    get memberId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(COMMITTEE + KEY, COMMITTEE + KEY + MEMBER)
        );
    }
    get targetId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(COMMITTEE + KEY + MEMBER, COMMITTEE + KEY + 2 * MEMBER)
        );
    }
    get N(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY + 2 * MEMBER,
                    COMMITTEE + KEY + 3 * MEMBER
                )
        );
    }
    get T(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY + 3 * MEMBER,
                    COMMITTEE + KEY + 3 * MEMBER + THRESHOLD
                )
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY + 3 * MEMBER + THRESHOLD,
                    COMMITTEE +
                        KEY +
                        3 * MEMBER +
                        THRESHOLD +
                        Utils.getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}

class CommitPolynomialActions extends DynamicArray(
    Action,
    INST_LIMITS.THRESHOLD
) {}
class ContributeActions extends DynamicArray(Action, INST_LIMITS.MEMBER) {}
class CommitShareActions extends DynamicArray(Action, INST_LIMITS.MEMBER) {}

class ContributionShareInput extends Struct({
    commitment: Field,
    committeeId: Field,
    keyId: Field,
    memberId: Field,
    shareWitness: KeyMemberWitness,
}) {}

class ContributionContract extends SmartContract {
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
     * @description MT storing members' secret polynomial commitments
     * @see PolynomialCommitmentStorage for off-chain storage implementation
     */
    @state(Field) polyComRoot = State<Field>(EmptyKeyMT().getRoot());

    /**
     * Slot 3
     * @description MT storing keys
     * @see KeyStorage for off-chain storage implementation
     */
    @state(Field) keyRoot = State<Field>(EmptyKeyMT().getRoot());

    /**
     * Slot 4
     * @description MT storing members' encryption contributions
     * @see EncryptionStorage for off-chain storage implementation
     */
    @state(Field) encryptionRoot = State<Field>(EmptyKeyMT().getRoot());

    /**
     * Slot 5
     * @description MT storing members' secret share commitments
     * @see ShareCommitmentStorage for off-chain storage implementation
     */
    @state(Field) shareComRoot = State<Field>(EmptyKeyMT().getRoot());

    reducer = Reducer({ actionType: Action });

    events = { [EventEnum.ROLLUPED]: Field };

    /**
     * Commit polynomial for key generation
     * Actions: dispatch {THRESHOLD} actions of type COMMIT_POLY
     * @param CArr Polynomial coefficients commitments
     * @param N Committee size
     * @param keyId Committee's key Id
     * @param memberWitness Witness for proof of committee's member
     * @param settingWitness Witness for proof of committee's setting
     * @param committee Reference to Committee Contract
     */
    async commitPolynomial(
        CArr: MemberGroupArray,
        N: Field,
        keyId: Field,
        memberWitness: CommitteeMemberWitness,
        settingWitness: CommitteeWitness,
        committee: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();
        let T = CArr.length;

        // Verify Committee Contract address
        AddressMap.verifyZkApp(
            ContributionContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );
        const committeeContract = new CommitteeContract(committee.address);

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INST_LIMITS.KEY,
            Utils.buildAssertMessage(
                ContributionContract.name,
                'commitPolynomial',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Verify committee member
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address: this.sender.getAndRequireSignatureV2(),
                committeeId,
                memberId,
                isActive: Bool(true),
                memberWitness,
            })
        );

        // Verify committee setting
        committeeContract.verifySetting(
            new CommitteeConfigInput({ N, T, committeeId, settingWitness })
        );

        // Create & dispatch actions
        for (let i = 0; i < INST_LIMITS.THRESHOLD; i++) {
            let action = new Action({
                packedData: Action.pack(
                    committeeId,
                    keyId,
                    memberId,
                    Field(i),
                    N,
                    T,
                    Field(ActionEnum.COMMIT_POLY)
                ),
                G: CArr.get(Field(i)),
                c: Field(0),
                f: Field(0),
            });
            this.reducer.dispatch(action);
        }
    }

    /**
     * Submit contribution for key generation
     * @param polyComProof Proof of polynomial commitment
     * @param encProof Proof of encryption
     * @param keyId Committee's key Id
     * @param memberWitness Witness for proof of committee's member
     * @param settingWitness Witness for proof of committee's setting
     * @param committee Reference to Committee Contract
     */
    @method
    async contribute(
        polyComProof: BatchPolyCommitmentProof,
        encProof: BatchEncryptionProof,
        keyId: Field,
        memberWitness: CommitteeMemberWitness,
        settingWitness: CommitteeWitness,
        committee: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        let T = polyComProof.publicInput.C.length;
        let N = polyComProof.publicInput.P.length;

        // Verify Committee Contract address
        AddressMap.verifyZkApp(
            ContributionContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );
        const committeeContract = new CommitteeContract(committee.address);

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INST_LIMITS.KEY,
            Utils.buildAssertMessage(
                ContributionContract.name,
                'contribute',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Verify committee member
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address: this.sender.getAndRequireSignatureV2(),
                committeeId,
                memberId,
                isActive: Bool(true),
                memberWitness,
            })
        );

        // Verify committee setting
        committeeContract.verifySetting(
            new CommitteeConfigInput({ N, T, committeeId, settingWitness })
        );

        // Verify proofs
        polyComProof.verify();
        encProof.verify();
        polyComProof.publicInput.P.hash().assertEquals(
            encProof.publicInput.P.hash()
            // Utils.buildAssertMessage(
            //     ContributionContract.name,
            //     'contribute',
            //     ErrorEnum.INITIAL_ENCRYPTION_HASHES
            // )
        );

        let polyCom = polyComProof.publicInput.C.hash();

        // Create & dispatch actions
        for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
            let action = new Action({
                packedData: Action.pack(
                    committeeId,
                    keyId,
                    memberId,
                    Field(i),
                    N,
                    T,
                    Field(ActionEnum.CONTRIBUTE)
                ),
                G: encProof.publicInput.U.get(Field(i)),
                c: encProof.publicInput.c.get(Field(i)),
                f: polyCom,
            });
            this.reducer.dispatch(action);
        }
    }

    @method
    async commitShare(
        decProof: BatchDecryptionProof,
        keyId: Field,
        memberWitness: CommitteeMemberWitness,
        committee: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();
        let N = decProof.publicInput.c.length;

        // Verify Committee Contract address
        AddressMap.verifyZkApp(
            ContributionContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );
        const committeeContract = new CommitteeContract(committee.address);

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INST_LIMITS.KEY,
            Utils.buildAssertMessage(
                ContributionContract.name,
                'commitShare',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Verify committee member
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address: this.sender.getAndRequireSignatureV2(),
                committeeId,
                memberId,
                isActive: Bool(true),
                memberWitness,
            })
        );

        // Verify proofs
        decProof.verify();
        memberId.assertEquals(
            decProof.publicInput.memberId
            // Utils.buildAssertMessage(
            //     ContributionContract.name,
            //     'commitShare',
            //     ErrorEnum.DECRYPTION_MEMBER_ID
            // )
        );

        // Create & dispatch actions
        for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
            let action = new Action({
                packedData: Action.pack(
                    committeeId,
                    keyId,
                    Field(i),
                    memberId,
                    N,
                    Field(0),
                    Field(ActionEnum.COMMIT_SHARE)
                ),
                G: decProof.publicInput.U.get(Field(i)),
                c: decProof.publicInput.c.get(Field(i)),
                f: decProof.publicInput.commitment,
            });
            this.reducer.dispatch(action);
        }
    }

    /**
     * Finalize round 1 with N members' contribution
     */
    @method
    async finalize(
        committeeId: Field,
        key: Group,
        polyComRoots: MemberFieldArray,
        encryptionRoots: MemberFieldArray,
        keyWitness: KeyWitness,
        polyComWitness: KeyWitness,
        encryptionWitness: KeyWitness,
        dkg: ZkAppRef,
        selfRef: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let polyComRoot = this.polyComRoot.getAndRequireEquals();
        let keyRoot = this.keyRoot.getAndRequireEquals();
        let encryptionRoot = this.encryptionRoot.getAndRequireEquals();

        // Verify key
        let keyId = polyComWitness.calculateIndex();
        keyRoot.assertEquals(
            keyWitness.calculateRoot(Poseidon.hash(key.toFields()))
            // Utils.buildAssertMessage(
            //     ContributionContract.name,
            //     'finalize',
            //     ErrorEnum.PUBLIC_KEY_ROOT
            // )
        );
        keyId.assertEquals(
            encryptionWitness.calculateIndex(),
            Utils.buildAssertMessage(
                ContributionContract.name,
                'finalize',
                ErrorEnum.KEY_INDEX
            )
        );

        // Verify Dkg Contract address
        AddressMap.verifyZkApp(
            ContributionContract.name,
            dkg,
            zkAppRoot,
            Field(ZkAppIndex.DKG)
        );

        const keyContract = new KeyContract(dkg.address);

        // Verify polynomial commitments
        let polyComMT = EmptyMemberMT();
        for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
            let inRange = Field(i).lessThan(polyComRoots.length).toField();
            let value = polyComRoots.get(Field(i)).mul(inRange);
            value.assertNotEquals(inRange.sub(1));
            polyComMT.setLeaf(BigInt(i), value);
        }
        polyComRoot.assertEquals(
            polyComMT.getRoot()
            // Utils.buildAssertMessage(
            //     ContributionContract.name,
            //     'finalize',
            //     ErrorEnum.POLYCOM_ROOT
            // )
        );

        // Verify encryption contributions
        let encryptionMT = EmptyMemberMT();
        for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
            let inRange = Field(i).lessThan(encryptionRoots.length).toField();
            let value = encryptionRoots.get(Field(i)).mul(inRange);
            value.assertNotEquals(inRange.sub(1));
            encryptionMT.setLeaf(BigInt(i), value);
        }
        encryptionRoot.assertEquals(
            encryptionMT.getRoot()
            // Utils.buildAssertMessage(
            //     ContributionContract.name,
            //     'finalize',
            //     ErrorEnum.ENCRYPTION_ROOT
            // )
        );

        // Create & dispatch action to KeyContract
        await keyContract.finalize(committeeId, keyId, key, selfRef);
    }

    async rollup(proof: RollupContributionProof) {
        // Verify proof
        proof.verify();

        // Get on-chain state values
        let curActionState = this.actionState.getAndRequireEquals();
        let latestActionState = this.account.actionState.getAndRequireEquals();
        let polyComRoot = this.polyComRoot.getAndRequireEquals();
        let keyRoot = this.keyRoot.getAndRequireEquals();
        let encryptionRoot = this.encryptionRoot.getAndRequireEquals();
        let shareComRoot = this.shareComRoot.getAndRequireEquals();

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

        // Update on-chain state
        Utils.assertRollupFields(
            [
                proof.publicOutput.initialPolyComRoot,
                proof.publicOutput.initialKeyRoot,
                proof.publicOutput.initialEncryptionRoot,
                proof.publicOutput.initialShareComRoot,
            ],
            [polyComRoot, keyRoot, encryptionRoot, shareComRoot],
            4
        );
        this.polyComRoot.set(proof.publicOutput.nextPolyComRoot);
        this.keyRoot.set(proof.publicOutput.nextKeyRoot);
        this.encryptionRoot.set(proof.publicOutput.nextEncryptionRoot);
        this.shareComRoot.set(proof.publicOutput.nextShareComRoot);
        this.emitEvent(EventEnum.ROLLUPED, proof.publicOutput.nextActionState);
    }

    verifyShareCommitment(input: ContributionShareInput) {
        this.shareComRoot
            .getAndRequireEquals()
            .assertEquals(
                input.shareWitness.level1.calculateRoot(
                    input.shareWitness.level2.calculateRoot(input.commitment)
                )
            );
        let keyIndex = calculateKeyIndex(input.committeeId, input.keyId);
        keyIndex.assertEquals(
            input.shareWitness.level1.calculateIndex()
            // Utils.buildAssertMessage(
            //     ContributionContract.name,
            //     'verifyShareCommitment',
            //     ErrorEnum.SHARECOMMITMENT_INDEX_L1
            // )
        );
        input.memberId.assertEquals(
            input.shareWitness.level2.calculateIndex()
            // Utils.buildAssertMessage(
            //     ContributionContract.name,
            //     'verifyShareCommitment',
            //     ErrorEnum.SHARECOMMITMENT_INDEX_L2
            // )
        );
    }
}
