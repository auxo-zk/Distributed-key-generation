import {
    Bool,
    Field,
    method,
    Poseidon,
    Provable,
    PublicKey,
    Reducer,
    SmartContract,
    state,
    State,
    Struct,
} from 'o1js';
import { DynamicArray, IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { MemberStorage, SettingStorage } from '../storages/CommitteeStorage.js';
import { INST_BIT_LIMITS, INST_LIMITS, NETWORK_LIMITS } from '../constants.js';
import { ErrorEnum, EventEnum, ZkAppAction } from './constants.js';
import {
    CommitteeMemberWitness,
    CommitteeWitness,
    EmptyCommitteeMT,
} from '../storages/Merklized.js';
import { MemberPublicKeyArray } from '../libs/types.js';
import { RollupCommitteeProof } from './CommitteeProgram.js';

export {
    ActionEnum as CommitteeActionEnum,
    Action as CommitteeAction,
    CreateActions,
    CommitteeMemberInput,
    CommitteeConfigInput,
    CommitteeContract,
};

const enum ActionEnum {
    CREATE,
    JOIN,
    LEAVE,
    __LENGTH,
}

const { COMMITTEE, MEMBER, THRESHOLD } = INST_BIT_LIMITS;

class Action
    extends Struct({
        packedData: Field, // Pack = [committeeId, N, T, actionType]
        address: PublicKey,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            address: PublicKey.empty(),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static pack(
        committeeId: Field,
        N: Field,
        T: Field,
        actionType: Field
    ): Field {
        return Field.fromBits([
            ...committeeId.toBits(COMMITTEE),
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
    get N(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(COMMITTEE, COMMITTEE + MEMBER)
        );
    }
    get T(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(COMMITTEE + MEMBER, COMMITTEE + MEMBER + THRESHOLD)
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + MEMBER + THRESHOLD,
                    COMMITTEE +
                        MEMBER +
                        THRESHOLD +
                        Utils.getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}

class CreateActions extends DynamicArray(Action, INST_LIMITS.MEMBER) {}

class CommitteeMemberInput extends Struct({
    address: PublicKey,
    committeeId: Field,
    memberId: Field,
    isActive: Bool,
    memberWitness: CommitteeMemberWitness,
}) {}

class CommitteeConfigInput extends Struct({
    N: Field,
    T: Field,
    committeeId: Field,
    settingWitness: CommitteeWitness,
}) {}

class CommitteeContract extends SmartContract {
    /**
     * Slot 0
     * @description MT storing addresses of other zkApps
     * @see AddressMap for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * Slot 1
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>(Reducer.initialActionState);

    /**
     * Slot 2
     * @description Incremental value to keep track of committees
     */
    @state(Field) nextCommitteeId = State<Field>(Field(0));

    /**
     * Slot 3
     * @description MT storing committees' members
     * @see MemberStorage for off-chain storage implementation
     */
    @state(Field) memberRoot = State<Field>(EmptyCommitteeMT().getRoot());

    /**
     * Slot 4
     * @description MT storing committees' threshold config (T/N)
     * @todo Change 'setting' to 'config'
     * @see SettingStorage  for off-chain storage implementation
     */
    @state(Field) settingRoot = State<Field>(EmptyCommitteeMT().getRoot());

    /**
     * Slot 5
     * @description MT storing committees' fee receiver address
     * @todo To be implemented - Currently allows any member in the committee to receive fees
     */
    @state(Field) feeReceiverRoot = State<Field>(Field(0));

    reducer = Reducer({ actionType: Action });
    events = {
        [EventEnum.COMMITTEE_DATA]: IpfsHash,
        [EventEnum.COMMITTEE_MEMBER_DATA]: IpfsHash,
        [EventEnum.ROLLUPED]: Field,
    };

    /**
     * Create a new DKG committee
     * Actions: Dispatch {LIMITS_MEMBER} actions of type CREATE for each member
     * Events: Emit 1 event of type COMMITTEE_DATA
     * @param addresses Committee members' addresses
     * @param threshold Committee's threshold
     * @param committeeData Committee's data
     * @param requireMember Require caller to be a member of the committee
     */
    @method
    async create(
        addresses: MemberPublicKeyArray,
        threshold: Field,
        committeeData: IpfsHash,
        requireMember: Bool
    ) {
        // Verify committee threshold
        threshold.assertGreaterThanOrEqual(
            1,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'create',
                ErrorEnum.COMMITTEE_THRESHOLD
            )
        );
        threshold.assertLessThanOrEqual(
            addresses.length,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'create',
                ErrorEnum.COMMITTEE_THRESHOLD
            )
        );
        threshold.assertLessThanOrEqual(
            INST_LIMITS.THRESHOLD,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'create',
                ErrorEnum.COMMITTEE_THRESHOLD
            )
        );

        // Verify committee members & caller (if requireMember is true)
        let caller = this.sender.getAndRequireSignatureV2();
        let checkCaller = requireMember.not();
        for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
            for (let j = i + 1; j < INST_LIMITS.MEMBER; j++) {
                let iOutOfRange = Field(i).greaterThanOrEqual(addresses.length);
                let jOutOfRange = Field(j).greaterThanOrEqual(addresses.length);

                Provable.if(
                    iOutOfRange.and(jOutOfRange),
                    Bool(false),
                    MemberPublicKeyArray.hash(addresses.get(Field(i))).equals(
                        MemberPublicKeyArray.hash(addresses.get(Field(j)))
                    )
                ).assertFalse(
                    Utils.buildAssertMessage(
                        CommitteeContract.name,
                        'create',
                        ErrorEnum.DUPLICATED_MEMBER
                    )
                );
            }
            checkCaller = checkCaller.or(
                addresses.get(Field(i)).equals(caller)
            );
        }
        checkCaller.assertTrue(
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'create',
                ErrorEnum.REQUIRE_MEMBER
            )
        );

        // Create & dispatch action
        for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
            let action = Provable.if(
                Field(i).lessThan(addresses.length),
                Action,
                new Action({
                    packedData: Action.pack(
                        Field(INST_LIMITS.COMMITTEE),
                        addresses.length,
                        threshold,
                        Field(ActionEnum.CREATE)
                    ),
                    address: addresses.get(Field(i)),
                }),
                Action.empty()
            ) as Action;
            this.reducer.dispatch(action);
        }
        this.emitEvent(EventEnum.COMMITTEE_DATA, committeeData);
    }

    /**
     * Join a committee
     * Actions: Dispatch 1 action of type JOIN
     * Events: Emit 1 event of type COMMITTEE_MEMBER_DATA
     * @param T Committee's threshold
     * @param N Committee's number of members
     * @param memberData Member's information
     */
    @method
    async join(committeeId: Field, memberData: IpfsHash) {
        let caller = this.sender.getAndRequireSignatureV2();
        // Create & dispatch action
        let action = new Action({
            packedData: Action.pack(
                committeeId,
                Field(0),
                Field(0),
                Field(ActionEnum.JOIN)
            ),
            address: caller,
        });
        this.reducer.dispatch(action);
        this.emitEvent(EventEnum.COMMITTEE_MEMBER_DATA, memberData);
    }

    /**
     * Leave a committee
     * Actions: Dispatch 1 action of type LEAVE
     * @param committeeId Committee's ID
     */
    async leave(committeeId: Field) {
        let caller = this.sender.getAndRequireSignatureV2();
        // Create & dispatch action
        let action = new Action({
            packedData: Action.pack(
                committeeId,
                Field(0),
                Field(0),
                Field(ActionEnum.LEAVE)
            ),
            address: caller,
        });
        this.reducer.dispatch(action);
    }

    /**
     * Update committees by rollup actions
     * Events: Emit 1 event of type PROCESSED
     * @param proof RollupCommitteeProof
     */
    @method
    async update(proof: RollupCommitteeProof) {
        // Verify proof
        proof.verify();

        // Get on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let latestActionState = this.account.actionState.getAndRequireEquals();
        let nextCommitteeId = this.nextCommitteeId.getAndRequireEquals();
        let memberRoot = this.memberRoot.getAndRequireEquals();
        let settingRoot = this.settingRoot.getAndRequireEquals();

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
                proof.publicOutput.initialCommitteeId,
                proof.publicOutput.initialMemberRoot,
                proof.publicOutput.initialSettingRoot,
            ],
            [nextCommitteeId, memberRoot, settingRoot],
            3
        );
        this.nextCommitteeId.set(proof.publicOutput.nextCommitteeId);
        this.memberRoot.set(proof.publicOutput.nextMemberRoot);
        this.settingRoot.set(proof.publicOutput.nextSettingRoot);
        this.emitEvent(EventEnum.ROLLUPED, proof.publicOutput.nextActionState);
    }

    /**
     * Verify if an address is a member of a committee
     * @param input Verification input
     */
    verifyMember(input: CommitteeMemberInput) {
        this.memberRoot.getAndRequireEquals().assertEquals(
            input.memberWitness.level1.calculateRoot(
                input.memberWitness.level2.calculateRoot(
                    MemberStorage.calculateLeaf({
                        pubKey: input.address,
                        active: input.isActive,
                    })
                )
            ),
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'verifyMember',
                ErrorEnum.MEMBER_ROOT
            )
        );
        input.committeeId.assertEquals(
            input.memberWitness.level1.calculateIndex(),
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'verifyMember',
                ErrorEnum.MEMBER_INDEX_L1
            )
        );
        input.memberId.assertEquals(
            input.memberWitness.level2.calculateIndex(),
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'verifyMember',
                ErrorEnum.MEMBER_INDEX_L2
            )
        );
    }

    /**
     * Verify the setting of a committee
     * @param input Verification input
     */
    verifySetting(input: CommitteeConfigInput) {
        input.N.assertGreaterThanOrEqual(input.T);
        let hashSetting = SettingStorage.calculateLeaf({
            T: input.T,
            N: input.N,
        });
        let root = input.settingWitness.calculateRoot(hashSetting);
        let _committeeId = input.settingWitness.calculateIndex();
        const onChainRoot = this.settingRoot.getAndRequireEquals();
        root.assertEquals(
            onChainRoot,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'verifySetting',
                ErrorEnum.SETTING_ROOT
            )
        );
        input.committeeId.assertEquals(
            _committeeId,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'verifySetting',
                ErrorEnum.SETTING_INDEX
            )
        );
    }
}
