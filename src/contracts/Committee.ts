import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Reducer,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    ZkProgram,
    PublicKey,
    Void,
} from 'o1js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
import { COMMITTEE_MAX_SIZE } from '../constants.js';
import {
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
    Level1Witness,
    FullMTWitness,
} from './CommitteeStorage.js';
import { MemberArray } from '../libs/Committee.js';
import { ErrorEnum, EventEnum } from './shared.js';

export class CommitteeAction extends Struct({
    addresses: MemberArray,
    threshold: Field,
    ipfsHash: IPFSHash,
}) {
    static fromFields(fields: Field[]): CommitteeAction {
        return super.fromFields(fields) as CommitteeAction;
    }
}

export class CommitteeMemberInput extends Struct({
    address: PublicKey,
    committeeId: Field,
    memberId: Field,
    memberWitness: FullMTWitness,
}) {}

export class CommitteeConfigInput extends Struct({
    N: Field,
    T: Field,
    committeeId: Field,
    settingWitness: Level1Witness,
}) {}

export class RollupCommitteeOutput extends Struct({
    initialActionState: Field,
    initialMemberRoot: Field,
    initialSettingRoot: Field,
    initialCommitteeId: Field,
    nextActionState: Field,
    nextMemberRoot: Field,
    nextSettingRoot: Field,
    nextCommitteeId: Field,
}) {
    hash(): Field {
        return Poseidon.hash(RollupCommitteeOutput.toFields(this));
    }
}

export const RollupCommittee = ZkProgram({
    name: 'RollupCommittee',
    publicOutput: RollupCommitteeOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field],
            method(
                initialActionState: Field,
                initialMemberRoot: Field,
                initialSettingRoot: Field,
                initialCommitteeId: Field
            ): RollupCommitteeOutput {
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
        nextStep: {
            privateInputs: [
                SelfProof<Void, RollupCommitteeOutput>,
                CommitteeAction,
                Level1Witness,
                Level1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupCommitteeOutput>,
                input: CommitteeAction,
                memberWitness: Level1Witness,
                settingWitness: Level1Witness
            ): RollupCommitteeOutput {
                // Verify earlier proof
                earlierProof.verify();

                // Verify empty member level 2 MT
                let prevMemberRoot = memberWitness.calculateRoot(Field(0));
                let memberKey = memberWitness.calculateIndex();
                prevMemberRoot.assertEquals(
                    earlierProof.publicOutput.nextMemberRoot,
                    buildAssertMessage(
                        RollupCommittee.name,
                        'nextStep',
                        ErrorEnum.MEMBER_ROOT
                    )
                );
                memberKey.assertEquals(
                    earlierProof.publicOutput.nextCommitteeId,
                    buildAssertMessage(
                        RollupCommittee.name,
                        'nextStep',
                        ErrorEnum.MEMBER_KEY_L1
                    )
                );

                // Verify empty setting level 2 MT
                let prevSettingRoot = settingWitness.calculateRoot(Field(0));
                let settingKey = settingWitness.calculateIndex();
                prevSettingRoot.assertEquals(
                    earlierProof.publicOutput.nextSettingRoot,
                    buildAssertMessage(
                        RollupCommittee.name,
                        'nextStep',
                        ErrorEnum.SETTING_ROOT
                    )
                );
                settingKey.assertEquals(
                    earlierProof.publicOutput.nextCommitteeId,
                    buildAssertMessage(
                        RollupCommittee.name,
                        'nextStep',
                        ErrorEnum.SETTING_KEY
                    )
                );

                // Create new level 2 MT for committee members' public keys
                let level2MT = EMPTY_LEVEL_2_TREE();
                for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
                    let value = Provable.if(
                        Field(i).greaterThanOrEqual(input.addresses.length),
                        Field(0),
                        MemberArray.hash(input.addresses.get(Field(i)))
                    );
                    level2MT.setLeaf(BigInt(i), value);
                }

                // Update memberRoot
                let nextMemberRoot = memberWitness.calculateRoot(
                    level2MT.getRoot()
                );

                // update setting tree with hash [t,n]
                let nextSettingRoot = settingWitness.calculateRoot(
                    Poseidon.hash([input.threshold, input.addresses.length])
                );

                return new RollupCommitteeOutput({
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    initialMemberRoot:
                        earlierProof.publicOutput.initialMemberRoot,
                    initialSettingRoot:
                        earlierProof.publicOutput.initialSettingRoot,
                    initialCommitteeId:
                        earlierProof.publicOutput.initialCommitteeId,
                    nextActionState: updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [CommitteeAction.toFields(input)]
                    ),
                    nextMemberRoot: nextMemberRoot,
                    nextSettingRoot: nextSettingRoot,
                    nextCommitteeId:
                        earlierProof.publicOutput.nextCommitteeId.add(Field(1)),
                });
            },
        },
    },
});

export class RollupCommitteeProof extends ZkProgram.Proof(RollupCommittee) {}

export class CommitteeContract extends SmartContract {
    /**
     * @description Incremental value to keep track of committees
     */
    @state(Field) nextCommitteeId = State<Field>();

    /**
     * @description MT root storing committees' members
     */
    @state(Field) memberRoot = State<Field>();

    /**
     * @description MT root storing committees' threshold setting (T/N)
     */
    @state(Field) settingRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: CommitteeAction });

    events = {
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.memberRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.settingRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Create new committee
     * @param action Committee's information
     */
    @method createCommittee(action: CommitteeAction) {
        action.threshold.assertLessThanOrEqual(action.addresses.length);
        this.reducer.dispatch(action);
    }

    /**
     * Rollup committee actions
     * @param proof Recursive rollup proof
     */
    @method rollup(proof: RollupCommitteeProof) {
        // Verify proof
        proof.verify();

        // Assert on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let nextCommitteeId = this.nextCommitteeId.getAndRequireEquals();
        let memberRoot = this.memberRoot.getAndRequireEquals();
        let settingRoot = this.settingRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify current action state
        curActionState.assertEquals(
            proof.publicOutput.initialActionState,
            buildAssertMessage(
                CommitteeContract.name,
                'rollup',
                ErrorEnum.CURRENT_ACTION_STATE
            )
        );

        // Verify current committee Id
        nextCommitteeId.assertEquals(
            proof.publicOutput.initialCommitteeId,
            buildAssertMessage(
                CommitteeContract.name,
                'rollup',
                ErrorEnum.NEXT_COMMITTEE_ID
            )
        );

        // Verify current member root
        memberRoot.assertEquals(
            proof.publicOutput.initialMemberRoot,
            buildAssertMessage(
                CommitteeContract.name,
                'rollup',
                ErrorEnum.MEMBER_ROOT
            )
        );

        // Verify current setting root
        settingRoot.assertEquals(
            proof.publicOutput.initialSettingRoot,
            buildAssertMessage(
                CommitteeContract.name,
                'rollup',
                ErrorEnum.SETTING_ROOT
            )
        );

        // Verify last action state
        lastActionState.assertEquals(
            proof.publicOutput.nextActionState,
            buildAssertMessage(
                CommitteeContract.name,
                'rollup',
                ErrorEnum.LAST_ACTION_STATE
            )
        );

        // Update on-chain states
        this.actionState.set(proof.publicOutput.nextActionState);
        this.nextCommitteeId.set(proof.publicOutput.nextCommitteeId);
        this.memberRoot.set(proof.publicOutput.nextMemberRoot);
        this.settingRoot.set(proof.publicOutput.nextSettingRoot);

        // Emit rollup event
        this.emitEvent(
            EventEnum.ROLLUPED,
            proof.publicOutput.nextCommitteeId.sub(Field(1))
        );
    }

    /**
     * Verify if an address is a member of a committee
     * @param input Verification input
     */
    checkMember(input: CommitteeMemberInput): Field {
        this.memberRoot
            .getAndRequireEquals()
            .assertEquals(
                input.memberWitness.level1.calculateRoot(
                    input.memberWitness.level2.calculateRoot(
                        MemberArray.hash(input.address)
                    )
                ),
                buildAssertMessage(
                    CommitteeContract.name,
                    'checkMember',
                    ErrorEnum.MEMBER_ROOT
                )
            );
        input.committeeId.assertEquals(
            input.memberWitness.level1.calculateIndex(),
            buildAssertMessage(
                CommitteeContract.name,
                'checkMember',
                ErrorEnum.MEMBER_KEY_L1
            )
        );
        input.memberId.assertEquals(
            input.memberWitness.level2.calculateIndex(),
            buildAssertMessage(
                CommitteeContract.name,
                'checkMember',
                ErrorEnum.MEMBER_KEY_L2
            )
        );
    }

    /**
     * Verify the setting of a committee
     * @param input Verification input
     */
    checkConfig(input: CommitteeConfigInput) {
        input.N.assertGreaterThanOrEqual(input.T);
        let hashSetting = Poseidon.hash([input.T, input.N]);
        let root = input.settingWitness.calculateRoot(hashSetting);
        let _committeeId = input.settingWitness.calculateIndex();
        const onChainRoot = this.settingRoot.getAndRequireEquals();
        root.assertEquals(
            onChainRoot,
            buildAssertMessage(
                CommitteeContract.name,
                'checkConfig',
                ErrorEnum.SETTING_ROOT
            )
        );
        input.committeeId.assertEquals(
            _committeeId,
            buildAssertMessage(
                CommitteeContract.name,
                'checkConfig',
                ErrorEnum.SETTING_KEY
            )
        );
    }
}
