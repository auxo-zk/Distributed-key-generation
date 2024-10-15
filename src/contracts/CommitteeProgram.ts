import {
    Bool,
    Field,
    Provable,
    SelfProof,
    Struct,
    Void,
    ZkProgram,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { ErrorEnum, ZkProgramEnum } from './constants.js';
import { INST_LIMITS } from '../constants';
import {
    CommitteeAction as Action,
    CommitteeActionEnum as ActionEnum,
    CreateActions,
} from './Committee.js';
import {
    CommitteeWitness,
    EmptyMemberMT,
    MemberWitness,
} from '../storages/Merklized.js';
import { MemberStorage, SettingStorage } from '../storages/CommitteeStorage.js';

export { RollupCommittee, RollupCommitteeOutput, RollupCommitteeProof };

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
                CommitteeWitness,
                CommitteeWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupCommitteeOutput>,
                actions: CreateActions,
                memberWitness: CommitteeWitness,
                settingWitness: CommitteeWitness
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
                let level2MT = EmptyMemberMT();
                for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
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
                CommitteeWitness,
                MemberWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupCommitteeOutput>,
                action: Action,
                memberWitnessL1: CommitteeWitness,
                memberWitnessL2: MemberWitness
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
                // Invalid cause:
                // - Not a member
                // - Committee doesn't exist
                // - Member already joined
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
                    Utils.buildInvalidActionMessage(
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
                CommitteeWitness,
                MemberWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupCommitteeOutput>,
                action: Action,
                memberWitnessL1: CommitteeWitness,
                memberWitnessL2: MemberWitness
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
                // Invalid cause:
                // - Not a member
                // - Committee doesn't exist
                // - Member already left
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
                    Utils.buildInvalidActionMessage(
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
