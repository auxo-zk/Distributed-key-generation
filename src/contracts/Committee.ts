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
import { updateOutOfSnark } from '../libs/utils.js';
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

export class CheckMemberInput extends Struct({
    address: PublicKey,
    commiteeId: Field,
    memberWitness: FullMTWitness,
}) {}

export class CheckConfigInput extends Struct({
    N: Field,
    T: Field,
    commiteeId: Field,
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
    name: 'create-committee',
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
                settingWitess: Level1Witness
            ): CreateCommitteeOutput {
                preProof.verify();

                ////// caculate new memberTreeRoot
                let preMemberRoot = memberWitness.calculateRoot(Field(0));
                let nextCommitteeId = memberWitness.calculateIndex();

                nextCommitteeId.assertEquals(
                    preProof.publicOutput.finalCommitteeId
                );
                preMemberRoot.assertEquals(
                    preProof.publicOutput.finalMemberTreeRoot
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

                // update new tree of public key in to the member tree
                let newMemberRoot = memberWitness.calculateRoot(tree.getRoot());

                ////// caculate new settingTreeRoot
                let preSettingRoot = settingWitess.calculateRoot(Field(0));
                let settingKey = settingWitess.calculateIndex();
                settingKey.assertEquals(nextCommitteeId);
                preSettingRoot.assertEquals(
                    preProof.publicOutput.finalSettingTreeRoot
                );
                // update setting tree with hash [t,n]
                let newSettingRoot = settingWitess.calculateRoot(
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

export enum EventEnum {
    COMMITTEE_CREATED = 'committee-created',
}

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

        curActionState.assertEquals(proof.publicOutput.initialActionState);
        nextCommitteeId.assertEquals(proof.publicOutput.initialCommitteeId);
        memberTreeRoot.assertEquals(proof.publicOutput.initialMemberTreeRoot);
        settingTreeRoot.assertEquals(proof.publicOutput.initialSettingTreeRoot);

        let lastActionState = this.account.actionState.getAndRequireEquals();
        lastActionState.assertEquals(proof.publicOutput.finalActionState);

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
    @method checkMember(input: CheckMemberInput): Field {
        let leaf = input.memberWitness.level2.calculateRoot(
            MemberArray.hash(input.address)
        );
        let memberId = input.memberWitness.level2.calculateIndex();

        let root = input.memberWitness.level1.calculateRoot(leaf);
        let _commiteeId = input.memberWitness.level1.calculateIndex();

        const onChainRoot = this.memberTreeRoot.getAndRequireEquals();
        root.assertEquals(onChainRoot);
        input.commiteeId.assertEquals(_commiteeId);
        return memberId;
    }

    @method checkConfig(input: CheckConfigInput) {
        input.N.assertGreaterThanOrEqual(input.T);
        // hash[T,N]
        let hashSetting = Poseidon.hash([input.T, input.N]);
        let root = input.settingWitness.calculateRoot(hashSetting);
        let _commiteeId = input.settingWitness.calculateIndex();
        const onChainRoot = this.settingTreeRoot.getAndRequireEquals();
        root.assertEquals(onChainRoot);
        input.commiteeId.assertEquals(_commiteeId);
    }
}
