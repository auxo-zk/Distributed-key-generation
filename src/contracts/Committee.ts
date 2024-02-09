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
import { buildAssertMessage, updateOutOfSnark } from '../libs/utils.js';
import { COMMITTEE_MAX_SIZE } from '../constants.js';
import {
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
    Level1Witness,
    FullMTWitness,
} from './CommitteeStorage.js';
import { MemberArray } from '../libs/Committee.js';

export class CommitteeAction extends Struct({
    addresses: MemberArray,
    threshold: Field,
    ipfsHash: IPFSHash,
}) {
    static fromFields(fields: Field[]): CommitteeAction {
        return super.fromFields(fields) as CommitteeAction;
    }
}

export enum EventEnum {
    COMMITTEE_CREATED = 'committee-created',
}

export enum ErrorEnum {
    CURRENT_ACTION_STATE = 'Incorrect current action state',
    LAST_ACTION_STATE = 'Incorrect last action state',
    NEXT_COMMITTEE_ID = 'Incorrect next committee Id',
    MEMBER_TREE_ROOT = 'Incorrect member tree root',
    MEMBER_TREE_KEY = 'Incorrect member tree key',
    SETTING_TREE_ROOT = 'Incorrect setting tree root',
    SETTING_TREE_KEY = 'Incorrect setting tree key',
}

export class CheckMemberInput extends Struct({
    address: PublicKey,
    committeeId: Field,
    memberWitness: FullMTWitness,
}) {}

export class CheckConfigInput extends Struct({
    N: Field,
    T: Field,
    committeeId: Field,
    settingWitness: Level1Witness,
}) {}

export class CreateCommitteeOutput extends Struct({
    initialActionState: Field,
    initialMemberTreeRoot: Field,
    initialSettingTreeRoot: Field,
    initialCommitteeId: Field,
    finalActionState: Field,
    finalMemberTreeRoot: Field,
    finalSettingTreeRoot: Field,
    finalCommitteeId: Field,
}) {
    hash(): Field {
        return Poseidon.hash(CreateCommitteeOutput.toFields(this));
    }
}

export const CreateCommittee = ZkProgram({
    name: 'CreateCommittee',
    publicOutput: CreateCommitteeOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field],
            method(
                initialActionState: Field,
                initialMemberTreeRoot: Field,
                initialSettingTreeRoot: Field,
                initialCommitteeId: Field
            ): CreateCommitteeOutput {
                return new CreateCommitteeOutput({
                    initialActionState,
                    initialMemberTreeRoot,
                    initialSettingTreeRoot,
                    initialCommitteeId,
                    finalActionState: initialActionState,
                    finalMemberTreeRoot: initialMemberTreeRoot,
                    finalSettingTreeRoot: initialSettingTreeRoot,
                    finalCommitteeId: initialCommitteeId,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<Void, CreateCommitteeOutput>,
                CommitteeAction,
                Level1Witness,
                Level1Witness,
            ],
            method(
                preProof: SelfProof<Void, CreateCommitteeOutput>,
                input: CommitteeAction,
                memberWitness: Level1Witness,
                settingWitness: Level1Witness
            ): CreateCommitteeOutput {
                preProof.verify();

                // Calculate new memberTreeRoot
                let preMemberRoot = memberWitness.calculateRoot(Field(0));
                let nextCommitteeId = memberWitness.calculateIndex();

                nextCommitteeId.assertEquals(
                    preProof.publicOutput.finalCommitteeId,
                    buildAssertMessage(
                        CreateCommittee.name,
                        'nextStep',
                        ErrorEnum.NEXT_COMMITTEE_ID
                    )
                );
                preMemberRoot.assertEquals(
                    preProof.publicOutput.finalMemberTreeRoot,
                    buildAssertMessage(
                        CreateCommittee.name,
                        'nextStep',
                        ErrorEnum.MEMBER_TREE_ROOT
                    )
                );

                let tree = EMPTY_LEVEL_2_TREE();
                for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
                    let value = Provable.if(
                        Field(i).greaterThanOrEqual(input.addresses.length),
                        Field(0),
                        MemberArray.hash(input.addresses.get(Field(i)))
                    );
                    tree.setLeaf(BigInt(i), value);
                }

                // Update new tree of public key in to the member tree
                let newMemberRoot = memberWitness.calculateRoot(tree.getRoot());

                // Calculate new settingTreeRoot
                let preSettingRoot = settingWitness.calculateRoot(Field(0));
                let settingKey = settingWitness.calculateIndex();
                settingKey.assertEquals(
                    nextCommitteeId,
                    buildAssertMessage(
                        CreateCommittee.name,
                        'nextStep',
                        ErrorEnum.SETTING_TREE_KEY
                    )
                );
                preSettingRoot.assertEquals(
                    preProof.publicOutput.finalSettingTreeRoot,
                    buildAssertMessage(
                        CreateCommittee.name,
                        'nextStep',
                        ErrorEnum.SETTING_TREE_ROOT
                    )
                );
                // update setting tree with hash [t,n]
                let newSettingRoot = settingWitness.calculateRoot(
                    Poseidon.hash([input.threshold, input.addresses.length])
                );

                return new CreateCommitteeOutput({
                    initialActionState:
                        preProof.publicOutput.initialActionState,
                    initialMemberTreeRoot:
                        preProof.publicOutput.initialMemberTreeRoot,
                    initialSettingTreeRoot:
                        preProof.publicOutput.initialSettingTreeRoot,
                    initialCommitteeId:
                        preProof.publicOutput.initialCommitteeId,
                    finalActionState: updateOutOfSnark(
                        preProof.publicOutput.finalActionState,
                        [CommitteeAction.toFields(input)]
                    ),
                    finalMemberTreeRoot: newMemberRoot,
                    finalSettingTreeRoot: newSettingRoot,
                    finalCommitteeId: nextCommitteeId.add(Field(1)),
                });
            },
        },
    },
});

export class CommitteeProof extends ZkProgram.Proof(CreateCommittee) {}

export class CommitteeContract extends SmartContract {
    @state(Field) nextCommitteeId = State<Field>();
    @state(Field) memberTreeRoot = State<Field>();
    @state(Field) settingTreeRoot = State<Field>();

    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: CommitteeAction });

    events = {
        [EventEnum.COMMITTEE_CREATED]: Field,
    };

    init() {
        super.init();
        this.memberTreeRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.settingTreeRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    @method createCommittee(action: CommitteeAction) {
        action.threshold.assertLessThanOrEqual(action.addresses.length);
        this.reducer.dispatch(action);
    }

    @method rollupIncrements(proof: CommitteeProof) {
        proof.verify();
        let curActionState = this.actionState.getAndRequireEquals();
        let nextCommitteeId = this.nextCommitteeId.getAndRequireEquals();
        let memberTreeRoot = this.memberTreeRoot.getAndRequireEquals();
        let settingTreeRoot = this.settingTreeRoot.getAndRequireEquals();

        curActionState.assertEquals(
            proof.publicOutput.initialActionState,
            buildAssertMessage(
                CommitteeContract.name,
                'rollupIncrements',
                ErrorEnum.CURRENT_ACTION_STATE
            )
        );
        nextCommitteeId.assertEquals(
            proof.publicOutput.initialCommitteeId,
            buildAssertMessage(
                CommitteeContract.name,
                'rollupIncrements',
                ErrorEnum.NEXT_COMMITTEE_ID
            )
        );
        memberTreeRoot.assertEquals(
            proof.publicOutput.initialMemberTreeRoot,
            buildAssertMessage(
                CommitteeContract.name,
                'rollupIncrements',
                ErrorEnum.MEMBER_TREE_ROOT
            )
        );
        settingTreeRoot.assertEquals(
            proof.publicOutput.initialSettingTreeRoot,
            buildAssertMessage(
                CommitteeContract.name,
                'rollupIncrements',
                ErrorEnum.SETTING_TREE_ROOT
            )
        );

        let lastActionState = this.account.actionState.getAndRequireEquals();
        lastActionState.assertEquals(
            proof.publicOutput.finalActionState,
            buildAssertMessage(
                CommitteeContract.name,
                'rollupIncrements',
                ErrorEnum.LAST_ACTION_STATE
            )
        );

        // update on-chain state
        this.actionState.set(proof.publicOutput.finalActionState);
        this.nextCommitteeId.set(proof.publicOutput.finalCommitteeId);
        this.memberTreeRoot.set(proof.publicOutput.finalMemberTreeRoot);
        this.settingTreeRoot.set(proof.publicOutput.finalSettingTreeRoot);

        this.emitEvent(
            EventEnum.COMMITTEE_CREATED,
            proof.publicOutput.finalCommitteeId.sub(Field(1))
        );
    }

    // Add memberIndex to input for checking
    // TODO - Consider removing this method
    @method checkMember(input: CheckMemberInput): Field {
        let leaf = input.memberWitness.level2.calculateRoot(
            MemberArray.hash(input.address)
        );
        let memberId = input.memberWitness.level2.calculateIndex();

        let root = input.memberWitness.level1.calculateRoot(leaf);
        let _committeeId = input.memberWitness.level1.calculateIndex();

        const onChainRoot = this.memberTreeRoot.getAndRequireEquals();
        root.assertEquals(
            onChainRoot,
            buildAssertMessage(
                CommitteeContract.name,
                'checkMember',
                ErrorEnum.MEMBER_TREE_ROOT
            )
        );
        input.committeeId.assertEquals(
            _committeeId,
            buildAssertMessage(
                CommitteeContract.name,
                'checkMember',
                ErrorEnum.MEMBER_TREE_KEY
            )
        );
        return memberId;
    }

    // TODO - Consider removing this method
    @method checkConfig(input: CheckConfigInput) {
        input.N.assertGreaterThanOrEqual(input.T);
        // hash[T,N]
        let hashSetting = Poseidon.hash([input.T, input.N]);
        let root = input.settingWitness.calculateRoot(hashSetting);
        let _committeeId = input.settingWitness.calculateIndex();
        const onChainRoot = this.settingTreeRoot.getAndRequireEquals();
        root.assertEquals(
            onChainRoot,
            buildAssertMessage(
                CommitteeContract.name,
                'checkConfig',
                ErrorEnum.SETTING_TREE_ROOT
            )
        );
        input.committeeId.assertEquals(
            _committeeId,
            buildAssertMessage(
                CommitteeContract.name,
                'checkConfig',
                ErrorEnum.SETTING_TREE_KEY
            )
        );
    }
}
