import {
  Field,
  SmartContract,
  state,
  State,
  method,
  MerkleWitness,
  Reducer,
  MerkleTree,
  MerkleMap,
  MerkleMapWitness,
  Struct,
  SelfProof,
  Poseidon,
  Provable,
  ZkProgram,
  PublicKey,
  Void,
} from 'o1js';
import { PublicKeyDynamicArray, IPFSHash } from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import { COMMITTEE_MAX_SIZE } from '../constants.js';
import { EMPTY_LEVEL_1_TREE, LEVEL2_TREE_HEIGHT } from './CommitteeStorage.js';

const DefaultRoot = EMPTY_LEVEL_1_TREE().getRoot();
export class CommitteeMerkleWitness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
export class MemberArray extends PublicKeyDynamicArray(COMMITTEE_MAX_SIZE) {}

export class RollupOutPut extends Struct({
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
    return Poseidon.hash(RollupOutPut.toFields(this));
  }
}

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
  memberMerkleTreeWitness: CommitteeMerkleWitness,
  memberMerkleMapWitness: MerkleMapWitness,
}) {}

export class CheckConfigInput extends Struct({
  N: Field,
  T: Field,
  commiteeId: Field,
  settingMerkleMapWitness: MerkleMapWitness,
}) {}

export const CreateCommittee = ZkProgram({
  name: 'create-committee',
  publicOutput: RollupOutPut,

  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<Void, RollupOutPut>,
        CommitteeAction,
        MerkleMapWitness,
        MerkleMapWitness,
      ],

      method(
        preProof: SelfProof<Void, RollupOutPut>,
        input: CommitteeAction,
        memberWitness: MerkleMapWitness,
        settingWitess: MerkleMapWitness
      ): RollupOutPut {
        preProof.verify();

        ////// caculate new memberTreeRoot
        let [preMemberRoot, nextCommitteeId] = memberWitness.computeRootAndKey(
          Field(0)
        );

        nextCommitteeId.assertEquals(preProof.publicOutput.finalCommitteeId);
        preMemberRoot.assertEquals(preProof.publicOutput.finalMemberTreeRoot);
        let tree = new MerkleTree(LEVEL2_TREE_HEIGHT);
        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          let value = Provable.if(
            Field(i).greaterThanOrEqual(input.addresses.length),
            Field(0),
            MemberArray.hash(input.addresses.get(Field(i)))
          );
          tree.setLeaf(BigInt(i), value);
        }

        // update new tree of public key in to the member tree
        let [newMemberRoot] = memberWitness.computeRootAndKey(tree.getRoot());

        ////// caculate new settingTreeRoot
        let [preSettingRoot, settingKey] = settingWitess.computeRootAndKey(
          Field(0)
        );
        settingKey.assertEquals(nextCommitteeId);
        preSettingRoot.assertEquals(preProof.publicOutput.finalSettingTreeRoot);
        // update new tree of public key in to the member tree
        let [newSettingRoot] = settingWitess.computeRootAndKey(
          // hash [t,n]
          Poseidon.hash([input.threshold, input.addresses.length])
        );

        return new RollupOutPut({
          initialActionState: preProof.publicOutput.initialActionState,
          initialMemberTreeRoot: preProof.publicOutput.initialMemberTreeRoot,
          initialSettingTreeRoot: preProof.publicOutput.initialSettingTreeRoot,
          initialCommitteeId: preProof.publicOutput.initialCommitteeId,
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

    firstStep: {
      privateInputs: [Field, Field, Field, Field],

      method(
        initialActionState: Field,
        initialMemberTreeRoot: Field,
        initialSettingTreeRoot: Field,
        initialCommitteeId: Field
      ): RollupOutPut {
        return new RollupOutPut({
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
  },
});

class CommitteeProof extends ZkProgram.Proof(CreateCommittee) {}

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
    this.memberTreeRoot.set(DefaultRoot);
    this.settingTreeRoot.set(DefaultRoot);
    this.actionState.set(Reducer.initialActionState);
  }

  @method createCommittee(action: CommitteeAction) {
    action.threshold.assertLessThanOrEqual(action.addresses.length);
    this.reducer.dispatch(action);
  }

  @method rollupIncrements(proof: CommitteeProof) {
    proof.verify();
    let curActionState = this.actionState.getAndAssertEquals();
    let nextCommitteeId = this.nextCommitteeId.getAndAssertEquals();
    let memberTreeRoot = this.memberTreeRoot.getAndAssertEquals();
    let settingTreeRoot = this.settingTreeRoot.getAndAssertEquals();

    curActionState.assertEquals(proof.publicOutput.initialActionState);
    nextCommitteeId.assertEquals(proof.publicOutput.initialCommitteeId);
    memberTreeRoot.assertEquals(proof.publicOutput.initialMemberTreeRoot);
    settingTreeRoot.assertEquals(proof.publicOutput.initialSettingTreeRoot);

    let lastActionState = this.account.actionState.getAndAssertEquals();
    lastActionState.assertEquals(proof.publicOutput.finalActionState);

    // update on-chain state
    this.actionState.set(proof.publicOutput.finalActionState);
    this.nextCommitteeId.set(proof.publicOutput.finalCommitteeId);
    this.memberTreeRoot.set(proof.publicOutput.finalMemberTreeRoot);
    this.settingTreeRoot.set(proof.publicOutput.finalSettingTreeRoot);

    this.emitEvent(
      EventEnum.COMMITTEE_CREATED,
      proof.publicOutput.finalCommitteeId
    );
  }

  // Add memberIndex to input for checking
  @method checkMember(input: CheckMemberInput): Field {
    let leaf = input.memberMerkleTreeWitness.calculateRoot(
      MemberArray.hash(input.address)
    );
    let memberId = input.memberMerkleTreeWitness.calculateIndex();
    let [root, _commiteeId] =
      input.memberMerkleMapWitness.computeRootAndKey(leaf);
    const onChainRoot = this.memberTreeRoot.getAndAssertEquals();
    root.assertEquals(onChainRoot);
    input.commiteeId.assertEquals(_commiteeId);
    return memberId;
  }

  @method checkConfig(input: CheckConfigInput) {
    input.N.assertGreaterThanOrEqual(input.T);
    // hash[T,N]
    let hashSetting = Poseidon.hash([input.T, input.N]);
    let [root, _commiteeId] =
      input.settingMerkleMapWitness.computeRootAndKey(hashSetting);
    const onChainRoot = this.settingTreeRoot.getAndAssertEquals();
    root.assertEquals(onChainRoot);
    input.commiteeId.assertEquals(_commiteeId);
  }
}
