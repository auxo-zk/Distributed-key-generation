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
    Bool,
} from 'o1js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import {
    COMMITTEE_LEVEL_1_TREE,
    COMMITTEE_LEVEL_2_TREE,
    CommitteeLevel1Witness,
    CommitteeWitness,
} from '../storages/CommitteeStorage.js';
import { MemberArray } from '../libs/Committee.js';
import { INSTANCE_LIMITS } from '../constants.js';
import {
    ErrorEnum,
    EventEnum,
    ZkAppAction,
    ZkProgramEnum,
} from './constants.js';
import { rollup } from './Rollup.js';

export {
    Action as CommitteeAction,
    CommitteeMemberInput,
    CommitteeConfigInput,
    UpdateCommitteeOutput,
    UpdateCommittee,
    UpdateCommitteeProof,
    CommitteeContract,
};

class Action
    extends Struct({
        addresses: MemberArray,
        threshold: Field,
        ipfsHash: IpfsHash,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            addresses: new MemberArray(),
            threshold: Field(0),
            ipfsHash: IpfsHash.empty(),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

class CommitteeMemberInput extends Struct({
    address: PublicKey,
    committeeId: Field,
    memberId: Field,
    memberWitness: CommitteeWitness,
}) {}

class CommitteeConfigInput extends Struct({
    N: Field,
    T: Field,
    committeeId: Field,
    settingWitness: CommitteeLevel1Witness,
}) {}

class UpdateCommitteeOutput extends Struct({
    initialActionState: Field,
    initialMemberRoot: Field,
    initialSettingRoot: Field,
    initialCommitteeId: Field,
    nextActionState: Field,
    nextMemberRoot: Field,
    nextSettingRoot: Field,
    nextCommitteeId: Field,
}) {}

const UpdateCommittee = ZkProgram({
    name: ZkProgramEnum.UpdateCommittee,
    publicOutput: UpdateCommitteeOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field],
            async method(
                initialActionState: Field,
                initialMemberRoot: Field,
                initialSettingRoot: Field,
                initialCommitteeId: Field
            ): Promise<UpdateCommitteeOutput> {
                return new UpdateCommitteeOutput({
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
        update: {
            privateInputs: [
                SelfProof<Void, UpdateCommitteeOutput>,
                Action,
                CommitteeLevel1Witness,
                CommitteeLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, UpdateCommitteeOutput>,
                input: Action,
                memberWitness: CommitteeLevel1Witness,
                settingWitness: CommitteeLevel1Witness
            ): Promise<UpdateCommitteeOutput> {
                // Verify earlier proof
                earlierProof.verify();

                // Verify empty member level 2 MT
                let prevMemberRoot = memberWitness.calculateRoot(Field(0));
                let memberKey = memberWitness.calculateIndex();
                prevMemberRoot.assertEquals(
                    earlierProof.publicOutput.nextMemberRoot,
                    Utils.buildAssertMessage(
                        UpdateCommittee.name,
                        'update',
                        ErrorEnum.MEMBER_ROOT
                    )
                );
                memberKey.assertEquals(
                    earlierProof.publicOutput.nextCommitteeId,
                    Utils.buildAssertMessage(
                        UpdateCommittee.name,
                        'update',
                        ErrorEnum.MEMBER_INDEX_L1
                    )
                );

                // Verify empty setting level 2 MT
                let prevSettingRoot = settingWitness.calculateRoot(Field(0));
                let settingKey = settingWitness.calculateIndex();
                prevSettingRoot.assertEquals(
                    earlierProof.publicOutput.nextSettingRoot,
                    Utils.buildAssertMessage(
                        UpdateCommittee.name,
                        'update',
                        ErrorEnum.SETTING_ROOT
                    )
                );
                settingKey.assertEquals(
                    earlierProof.publicOutput.nextCommitteeId,
                    Utils.buildAssertMessage(
                        UpdateCommittee.name,
                        'update',
                        ErrorEnum.SETTING_INDEX
                    )
                );

                // Create new level 2 MT for committee members' public keys
                let level2MT = COMMITTEE_LEVEL_2_TREE();
                for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
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
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );
                let nextSettingRoot = settingWitness.calculateRoot(
                    Poseidon.hash([input.threshold, input.addresses.length])
                );
                let nextCommitteeId =
                    earlierProof.publicOutput.nextCommitteeId.add(Field(1));

                return new UpdateCommitteeOutput({
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
    },
});

class UpdateCommitteeProof extends ZkProgram.Proof(UpdateCommittee) {}

/**
 * @todo Prevent fake committee by spoofing IPFS hash
 * @todo Replace struct with arguments array for method input
 */
class CommitteeContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     * @see AddressStorage for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description Incremental value to keep track of committees
     */
    @state(Field) nextCommitteeId = State<Field>();

    /**
     * @description MT storing committees' members
     * @see MemberStorage for off-chain storage implementation
     */
    @state(Field) memberRoot = State<Field>();

    /**
     * @description MT storing committees' threshold config (T/N)
     * @todo Change 'setting' to 'config'
     * @see SettingStorage  for off-chain storage implementation
     */
    @state(Field) settingRoot = State<Field>();

    /**
     * @description MT storing committees' key usage fee
     * @todo To be implemented
     */
    @state(Field) feeRoot = State<Field>();

    /**
     * @description MT storing committees' fee receiver address
     * @todo To be implemented
     */
    @state(Field) feeReceiverRoot = State<Field>();

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
        this.memberRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.settingRoot.set(COMMITTEE_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Create a new DKG committee
     * @param action Committee's information
     */
    @method
    async create(action: Action) {
        // Verify committee threshold
        action.threshold.assertGreaterThanOrEqual(
            1,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'create',
                ErrorEnum.COMMITTEE_THRESHOLD
            )
        );
        action.threshold.assertLessThanOrEqual(action.addresses.length);

        // Verify committee members
        for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
            for (let j = i + 1; j < INSTANCE_LIMITS.MEMBER; j++) {
                let iOutOfRange = Field(i).greaterThanOrEqual(
                    action.addresses.length
                );
                let jOutOfRange = Field(j).greaterThanOrEqual(
                    action.addresses.length
                );

                Provable.if(
                    iOutOfRange.and(jOutOfRange),
                    Bool(false),
                    Poseidon.hash(
                        action.addresses.get(Field(i)).toFields()
                    ).equals(
                        Poseidon.hash(action.addresses.get(Field(j)).toFields())
                    )
                ).assertFalse(
                    Utils.buildAssertMessage(
                        CommitteeContract.name,
                        'create',
                        ErrorEnum.DUPLICATED_MEMBER
                    )
                );
            }
        }
        this.reducer.dispatch(action);
    }

    /**
     * Update committees by rollup to the latest actions
     * @param proof Verification proof
     */
    @method
    async update(proof: UpdateCommitteeProof) {
        // Verify proof
        proof.verify();

        // Assert on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let nextCommitteeId = this.nextCommitteeId.getAndRequireEquals();
        let memberRoot = this.memberRoot.getAndRequireEquals();
        let settingRoot = this.settingRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify rollup
        rollup(
            CommitteeContract.name,
            proof.publicOutput,
            curActionState,
            lastActionState
        );

        // Verify committee Id
        nextCommitteeId.assertEquals(
            proof.publicOutput.initialCommitteeId,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'update',
                ErrorEnum.NEXT_COMMITTEE_ID
            )
        );

        // Verify member root
        memberRoot.assertEquals(
            proof.publicOutput.initialMemberRoot,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'update',
                ErrorEnum.MEMBER_ROOT
            )
        );

        // Verify setting root
        settingRoot.assertEquals(
            proof.publicOutput.initialSettingRoot,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'update',
                ErrorEnum.SETTING_ROOT
            )
        );

        // Update on-chain states
        this.actionState.set(proof.publicOutput.nextActionState);
        this.nextCommitteeId.set(proof.publicOutput.nextCommitteeId);
        this.memberRoot.set(proof.publicOutput.nextMemberRoot);
        this.settingRoot.set(proof.publicOutput.nextSettingRoot);

        // Emit rollup event
        this.emitEvent(EventEnum.PROCESSED, lastActionState);
    }

    /**
     * Verify if an address is a member of a committee
     * @param input Verification input
     */
    verifyMember(input: CommitteeMemberInput) {
        this.memberRoot
            .getAndRequireEquals()
            .assertEquals(
                input.memberWitness.level1.calculateRoot(
                    input.memberWitness.level2.calculateRoot(
                        MemberArray.hash(input.address)
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
    verifyConfig(input: CommitteeConfigInput) {
        input.N.assertGreaterThanOrEqual(input.T);
        let hashSetting = Poseidon.hash([input.T, input.N]);
        let root = input.settingWitness.calculateRoot(hashSetting);
        let _committeeId = input.settingWitness.calculateIndex();
        const onChainRoot = this.settingRoot.getAndRequireEquals();
        root.assertEquals(
            onChainRoot,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'verifyConfig',
                ErrorEnum.SETTING_ROOT
            )
        );
        input.committeeId.assertEquals(
            _committeeId,
            Utils.buildAssertMessage(
                CommitteeContract.name,
                'verifyConfig',
                ErrorEnum.SETTING_INDEX
            )
        );
    }
}
