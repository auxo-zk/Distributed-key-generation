import {
    Bool,
    Field,
    method,
    Poseidon,
    Provable,
    PublicKey,
    Reducer,
    SelfProof,
    SmartContract,
    state,
    State,
    Struct,
    Void,
    ZkProgram,
} from 'o1js';
import { DynamicArray, IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import {
    COMMITTEE_LEVEL_1_TREE,
    COMMITTEE_LEVEL_2_TREE,
    CommitteeLevel1Witness,
    CommitteeLevel2Witness,
    CommitteeWitness,
    MemberStorage,
    SettingStorage,
} from '../storages/CommitteeStorage.js';
import { MemberArray } from '../libs/Committee.js';
import { INSTANCE_LIMITS } from '../constants.js';
import {
    ErrorEnum,
    EventEnum,
    ZkAppAction,
    ZkProgramEnum,
} from './constants.js';
import { rollup, rollupField } from './Rollup.js';
import { getBitLength } from '../libs/index.js';

export {
    ActionEnum as CommitteeActionEnum,
    Action as CommitteeAction,
    CreateActions,
    CommitteeMemberInput,
    CommitteeConfigInput,
    RollupCommitteeOutput,
    RollupCommittee,
    RollupCommitteeProof,
    CommitteeContract,
};

const enum ActionEnum {
    CREATE,
    JOIN,
    LEAVE,
    __LENGTH,
}

class Action
    extends Struct({
        packedData: Field,
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
            ...committeeId.toBits(getBitLength(INSTANCE_LIMITS.COMMITTEE)),
            ...N.toBits(getBitLength(INSTANCE_LIMITS.MEMBER)),
            ...T.toBits(getBitLength(INSTANCE_LIMITS.MEMBER)),
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
    get N(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    getBitLength(INSTANCE_LIMITS.COMMITTEE),
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        getBitLength(INSTANCE_LIMITS.MEMBER)
                )
        );
    }
    get T(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        getBitLength(INSTANCE_LIMITS.MEMBER),
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        2 * getBitLength(INSTANCE_LIMITS.MEMBER)
                )
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        2 * getBitLength(INSTANCE_LIMITS.MEMBER),
                    getBitLength(INSTANCE_LIMITS.COMMITTEE) +
                        2 * getBitLength(INSTANCE_LIMITS.MEMBER) +
                        getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}

class CreateActions extends DynamicArray(Action, INSTANCE_LIMITS.MEMBER) {}

class CommitteeMemberInput extends Struct({
    address: PublicKey,
    committeeId: Field,
    memberId: Field,
    isActive: Bool,
    memberWitness: CommitteeWitness,
}) {}

class CommitteeConfigInput extends Struct({
    N: Field,
    T: Field,
    committeeId: Field,
    settingWitness: CommitteeLevel1Witness,
}) {}

class RollupCommitteeOutput extends Struct({
    initialActionState: Field,
    initialMemberRoot: Field,
    initialSettingRoot: Field,
    initialCommitteeId: Field,
    nextActionState: Field,
    nextMemberRoot: Field,
    nextSettingRoot: Field,
    nextCommitteeId: Field,
}) {}

const RollupCommittee = ZkProgram({
    name: ZkProgramEnum.RollupCommittee,
    publicOutput: RollupCommitteeOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field],
            async method(
                initialActionState: Field,
                initialMemberRoot: Field,
                initialSettingRoot: Field,
                initialCommitteeId: Field
            ): Promise<RollupCommitteeOutput> {
                return new RollupCommitteeOutput({
                    initialActionState,
                    initialMemberRoot,
                    initialSettingRoot,
                    initialCommitteeId,
                    nextActionState: initialActionState,
                    nextMemberRoot: initialMemberRoot,
                    nextSettingRoot: initialSettingRoot,
                    nextCommitteeId: initialCommitteeId,
                });
            },
        },

        /**
         * Process CREATE actions
         * @param earlierProof Previous recursive proof
         * @param actions Create actions dynamic array with length of numbers of non-empty actions
         * @param memberWitness Committee member storage's level 1 witness
         * @param settingWitness Committee setting storage's witness
         */
        create: {
            privateInputs: [
                SelfProof<Void, RollupCommitteeOutput>,
                CreateActions,
                CommitteeLevel1Witness,
                CommitteeLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupCommitteeOutput>,
                actions: CreateActions,
                memberWitness: typeof CommitteeLevel1Witness,
                settingWitness: typeof CommitteeLevel1Witness
            ): Promise<RollupCommitteeOutput> {
                // Verify earlier proof
                earlierProof.verify();

                let firstAction = actions.get(Field(0)) as Action;

                // Verify action type
                firstAction.actionType.assertEquals(
                    Field(ActionEnum.CREATE),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'create',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Verify empty member level 2 MT
                earlierProof.publicOutput.nextMemberRoot.assertEquals(
                    memberWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'create',
                        ErrorEnum.MEMBER_ROOT
                    )
                );
                earlierProof.publicOutput.nextCommitteeId.assertEquals(
                    memberWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'create',
                        ErrorEnum.MEMBER_INDEX_L1
                    )
                );

                // Verify empty setting level 2 MT
                earlierProof.publicOutput.nextSettingRoot.assertEquals(
                    settingWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'create',
                        ErrorEnum.SETTING_ROOT
                    )
                );
                earlierProof.publicOutput.nextCommitteeId.assertEquals(
                    settingWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'create',
                        ErrorEnum.SETTING_INDEX
                    )
                );

                // Create new level 2 MT for committee members' public keys
                let level2MT = COMMITTEE_LEVEL_2_TREE();
                for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
                    let value = Provable.if(
                        Field(i).greaterThanOrEqual(actions.length),
                        Field(0),
                        MemberStorage.calculateLeaf({
                            pubKey: actions.get(Field(i)).address,
                            active: Bool(false),
                        })
                    );
                    level2MT.setLeaf(BigInt(i), value);
                }

                // Update memberRoot
                let nextMemberRoot = memberWitness.calculateRoot(
                    level2MT.getRoot()
                );

                // Update settingRoot
                let nextSettingRoot = settingWitness.calculateRoot(
                    SettingStorage.calculateLeaf({
                        T: firstAction.T,
                        N: firstAction.N,
                    })
                );

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    actions.values.map((action) => Action.toFields(action))
                );

                // Update committee Id
                let nextCommitteeId =
                    earlierProof.publicOutput.nextCommitteeId.add(Field(1));

                return new RollupCommitteeOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextActionState,
                        nextMemberRoot,
                        nextSettingRoot,
                        nextCommitteeId,
                    },
                });
            },
        },

        /**
         * Process JOIN actions
         * @param earlierProof Previous recursive proof
         * @param actions Join actions dynamic array with length of numbers of non-empty actions
         * @param memberWitnessL1 Committee member storage's level 1 witness
         * @param memberWitnessL2 Committee member storage's level 2 witness
         */
        join: {
            privateInputs: [
                SelfProof<Void, RollupCommitteeOutput>,
                Action,
                CommitteeLevel1Witness,
                CommitteeLevel2Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupCommitteeOutput>,
                action: Action,
                memberWitnessL1: typeof CommitteeLevel1Witness,
                memberWitnessL2: typeof CommitteeLevel2Witness
            ): Promise<RollupCommitteeOutput> {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                action.actionType.assertEquals(
                    Field(ActionEnum.JOIN),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'join',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Skip invalid action
                let invalidAction = Bool(false);

                // Verify inactive member leaf
                // Invalid cause: not a member / member already joined
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextMemberRoot.equals(
                        memberWitnessL1.calculateRoot(
                            memberWitnessL2.calculateRoot(
                                MemberStorage.calculateLeaf({
                                    pubKey: action.address,
                                    active: Bool(false),
                                })
                            )
                        )
                    ),
                    'Skipping an invalid action: ' +
                        Utils.buildAssertMessage(
                            RollupCommittee.name,
                            'join',
                            ErrorEnum.MEMBER_ROOT
                        )
                );
                action.committeeId.assertEquals(
                    memberWitnessL1.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'join',
                        ErrorEnum.MEMBER_INDEX_L1
                    )
                );

                // Update memberRoot if action is valid
                let nextMemberRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextMemberRoot,
                    memberWitnessL1.calculateRoot(
                        memberWitnessL2.calculateRoot(
                            MemberStorage.calculateLeaf({
                                pubKey: action.address,
                                active: Bool(true),
                            })
                        )
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

                return new RollupCommitteeOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextActionState,
                        nextMemberRoot,
                    },
                });
            },
        },

        /**
         * Process LEAVE actions
         * @param earlierProof Previous recursive proof
         * @param actions Leave actions dynamic array with length of numbers of non-empty actions
         * @param memberWitnessL1 Committee member storage's level 1 witness
         * @param memberWitnessL2 Committee member storage's level 2 witness
         */
        leave: {
            privateInputs: [
                SelfProof<Void, RollupCommitteeOutput>,
                Action,
                CommitteeLevel1Witness,
                CommitteeLevel2Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupCommitteeOutput>,
                action: Action,
                memberWitnessL1: typeof CommitteeLevel1Witness,
                memberWitnessL2: typeof CommitteeLevel2Witness
            ): Promise<RollupCommitteeOutput> {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                action.actionType.assertEquals(
                    Field(ActionEnum.LEAVE),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'leave',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Skip invalid action
                let invalidAction = Bool(false);

                // Verify active member leaf
                // Invalid cause: not a member / member already left
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextMemberRoot.equals(
                        memberWitnessL1.calculateRoot(
                            memberWitnessL2.calculateRoot(
                                MemberStorage.calculateLeaf({
                                    pubKey: action.address,
                                    active: Bool(true),
                                })
                            )
                        )
                    ),
                    'Skipping an invalid action: ' +
                        Utils.buildAssertMessage(
                            RollupCommittee.name,
                            'leave',
                            ErrorEnum.MEMBER_ROOT
                        )
                );
                action.committeeId.assertEquals(
                    memberWitnessL1.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupCommittee.name,
                        'leave',
                        ErrorEnum.MEMBER_INDEX_L1
                    )
                );

                // Update memberRoot if action is valid
                let nextMemberRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextMemberRoot,
                    memberWitnessL1.calculateRoot(
                        memberWitnessL2.calculateRoot(
                            MemberStorage.calculateLeaf({
                                pubKey: action.address,
                                active: Bool(false),
                            })
                        )
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

                return new RollupCommitteeOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextActionState,
                        nextMemberRoot,
                    },
                });
            },
        },
    },
});

class RollupCommitteeProof extends ZkProgram.Proof(RollupCommittee) {}

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
    @state(Field) actionState = State<Field>();

    /**
     * Slot 2
     * @description Incremental value to keep track of committees
     */
    @state(Field) nextCommitteeId = State<Field>();

    /**
     * Slot 3
     * @description MT storing committees' members
     * @see MemberStorage for off-chain storage implementation
     */
    @state(Field) memberRoot = State<Field>();

    /**
     * Slot 4
     * @description MT storing committees' threshold config (T/N)
     * @todo Change 'setting' to 'config'
     * @see SettingStorage  for off-chain storage implementation
     */
    @state(Field) settingRoot = State<Field>();

    /**
     * Slot 5
     * @description MT storing committees' key usage fee
     * @todo To be implemented
     */
    @state(Field) feeRoot = State<Field>();

    /**
     * Slot 6
     * @description MT storing committees' fee receiver address
     * @todo To be implemented
     */
    @state(Field) feeReceiverRoot = State<Field>();

    reducer = Reducer({ actionType: Action });
    events = {
        [EventEnum.COMMITTEE_DATA]: IpfsHash,
        [EventEnum.COMMITTEE_MEMBER_DATA]: IpfsHash,
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.nextCommitteeId.set(Field(0));
        this.actionState.set(Reducer.initialActionState);
        this.memberRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.settingRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
    }

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
        addresses: MemberArray,
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

        // Verify committee members
        let caller = this.sender.getAndRequireSignatureV2();
        let checkCaller = requireMember.not();
        for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
            for (let j = i + 1; j < INSTANCE_LIMITS.MEMBER; j++) {
                let iOutOfRange = Field(i).greaterThanOrEqual(addresses.length);
                let jOutOfRange = Field(j).greaterThanOrEqual(addresses.length);

                Provable.if(
                    iOutOfRange.and(jOutOfRange),
                    Bool(false),
                    MemberArray.hash(addresses.get(Field(i))).equals(
                        MemberArray.hash(addresses.get(Field(j)))
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

        // Verify caller is a member if requireMember is true
        for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
            checkCaller.or;
            // Create & dispatch action
            let action = Provable.if(
                Field(i).lessThan(addresses.length),
                Action,
                new Action({
                    packedData: Action.pack(
                        Field(INSTANCE_LIMITS.COMMITTEE),
                        addresses.length,
                        threshold,
                        Field(ActionEnum.CREATE)
                    ),
                    address: addresses.get(Field(i)),
                }),
                Action.empty()
            ) as Action;
            this.reducer.dispatch(action);
            this.emitEventIf(
                Field(i).lessThan(addresses.length),
                EventEnum.COMMITTEE_DATA,
                committeeData
            );
        }
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
     * Update committees by rollup to the latest actions
     * Events: Emit 1 event of type PROCESSED
     * @param proof RollupCommitteeProof
     */
    @method
    async update(proof: RollupCommitteeProof) {
        // Verify proof
        proof.verify();

        // Get on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();
        let nextCommitteeId = this.nextCommitteeId.getAndRequireEquals();
        let memberRoot = this.memberRoot.getAndRequireEquals();
        let settingRoot = this.settingRoot.getAndRequireEquals();

        // Update action state
        rollup(
            CommitteeContract.name,
            proof.publicOutput,
            curActionState,
            lastActionState
        );
        this.actionState.set(lastActionState);

        // Update committee Id
        rollupField(
            CommitteeContract.name,
            proof.publicOutput.initialCommitteeId,
            nextCommitteeId
        );
        this.nextCommitteeId.set(proof.publicOutput.nextCommitteeId);

        // Update member root
        rollupField(
            CommitteeContract.name,
            proof.publicOutput.initialMemberRoot,
            memberRoot
        );
        this.memberRoot.set(proof.publicOutput.nextMemberRoot);

        // Update setting root
        rollupField(
            CommitteeContract.name,
            proof.publicOutput.initialSettingRoot,
            settingRoot
        );
        this.settingRoot.set(proof.publicOutput.nextSettingRoot);

        // Emit rollup event
        this.emitEvent(EventEnum.ROLLUPED, lastActionState);
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
