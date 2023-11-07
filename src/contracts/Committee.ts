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
} from 'o1js';
import { PublicKeyDynamicArray } from '@auxo-dev/auxo-libs';
import { COMMITTEE_MAX_SIZE } from '../libs/Committee.js';
import { updateOutOfSnark } from '../libs/utils.js';

export const LEVEL2_TREE_HEIGHT = Math.log2(COMMITTEE_MAX_SIZE) + 1;
const EmptyMerkleMap = new MerkleMap();
export class CommitteeMerkleWitness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
export class MemberArray extends PublicKeyDynamicArray(COMMITTEE_MAX_SIZE) {}

export class CommitteeRollupState extends Struct({
  actionHash: Field,
  memberTreeRoot: Field,
  settingTreeRoot: Field,
  currentCommitteeId: Field,
}) {
  hash(): Field {
    return Poseidon.hash([
      this.actionHash,
      this.memberTreeRoot,
      this.settingTreeRoot,
      this.currentCommitteeId,
    ]);
  }
}

export class CheckMemberInput extends Struct({
  address: PublicKey,
  commiteeId: Field,
  memberMerkleTreeWitness: CommitteeMerkleWitness,
  memberMerkleMapWitness: MerkleMapWitness,
}) {}

export class CheckConfigInput extends Struct({
  n: Field,
  t: Field,
  commiteeId: Field,
  settingMerkleMapWitness: MerkleMapWitness,
}) {}

export const CreateCommittee = ZkProgram({
  name: 'create-committee',
  publicInput: CommitteeRollupState,
  publicOutput: CommitteeRollupState,

  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<CommitteeRollupState, CommitteeRollupState>,
        MemberArray,
        MerkleMapWitness,
        MerkleMapWitness,
        Field,
      ],

      method(
        input: CommitteeRollupState,
        preProof: SelfProof<CommitteeRollupState, CommitteeRollupState>,
        publickeys: MemberArray,
        memberWitness: MerkleMapWitness,
        settingWitess: MerkleMapWitness,
        threshold: Field
      ): CommitteeRollupState {
        preProof.verify();

        input.hash().assertEquals(preProof.publicInput.hash());

        ////// caculate new memberTreeRoot
        let [preMemberRoot, nextCommitteeId] = memberWitness.computeRootAndKey(
          Field(0)
        );
        nextCommitteeId.assertEquals(preProof.publicOutput.currentCommitteeId);
        preMemberRoot.assertEquals(preProof.publicOutput.memberTreeRoot);
        let tree = new MerkleTree(LEVEL2_TREE_HEIGHT);
        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          let value = Provable.if(
            Field(i).greaterThanOrEqual(publickeys.length),
            Field(0),
            MemberArray.hash(publickeys.get(Field(i)))
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
        preSettingRoot.assertEquals(preProof.publicOutput.settingTreeRoot);
        // update new tree of public key in to the member tree
        let [newSettingRoot] = settingWitess.computeRootAndKey(
          // hash [t,n]
          Poseidon.hash([threshold, publickeys.length])
        );

        return new CommitteeRollupState({
          actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [
            [publickeys.length, publickeys.toFields(), threshold].flat(),
          ]),
          memberTreeRoot: newMemberRoot,
          settingTreeRoot: newSettingRoot,
          currentCommitteeId: nextCommitteeId.add(Field(1)),
        });
      },
    },

    firstStep: {
      privateInputs: [],

      method(input: CommitteeRollupState): CommitteeRollupState {
        return input;
      },
    },
  },
});

class CommitteeProof extends ZkProgram.Proof(CreateCommittee) {}

export class CommitteeInput extends Struct({
  addresses: MemberArray,
  threshold: Field,
}) {}

export class Committee extends SmartContract {
  @state(Field) nextCommitteeId = State<Field>();
  @state(Field) memberTreeRoot = State<Field>();
  @state(Field) settingTreeRoot = State<Field>();

  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: CommitteeInput });

  events = {
    'committee-input': CommitteeInput,
    'last-committee-id': Field,
  };

  init() {
    super.init();
    this.memberTreeRoot.set(EmptyMerkleMap.getRoot());
    this.settingTreeRoot.set(EmptyMerkleMap.getRoot());
    this.actionState.set(Reducer.initialActionState);
  }

  @method createCommittee(input: CommitteeInput) {
    input.threshold.assertLessThanOrEqual(input.addresses.length);
    this.reducer.dispatch(input);

    this.emitEvent('committee-input', input);
  }

  @method rollupIncrements(proof: CommitteeProof) {
    proof.verify();
    let curActionState = this.actionState.getAndAssertEquals();
    let nextCommitteeId = this.nextCommitteeId.getAndAssertEquals();
    let memberTreeRoot = this.memberTreeRoot.getAndAssertEquals();
    let settingTreeRoot = this.settingTreeRoot.getAndAssertEquals();

    curActionState.assertEquals(proof.publicInput.actionHash);
    nextCommitteeId.assertEquals(proof.publicInput.currentCommitteeId);
    memberTreeRoot.assertEquals(proof.publicInput.memberTreeRoot);
    settingTreeRoot.assertEquals(proof.publicInput.settingTreeRoot);

    let lastActionState = this.account.actionState.getAndAssertEquals();
    lastActionState.assertEquals(proof.publicOutput.actionHash);

    // update on-chain state
    this.actionState.set(proof.publicOutput.actionHash);
    this.nextCommitteeId.set(proof.publicOutput.currentCommitteeId);
    this.memberTreeRoot.set(proof.publicOutput.memberTreeRoot);
    this.settingTreeRoot.set(proof.publicOutput.settingTreeRoot);

    this.emitEvent('last-committee-id', proof.publicOutput.currentCommitteeId);
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
    input.n.assertGreaterThanOrEqual(input.t);
    // hash[t,n]
    let hashSetting = Poseidon.hash([input.t, input.n]);
    let [root, _commiteeId] =
      input.settingMerkleMapWitness.computeRootAndKey(hashSetting);
    const onChainRoot = this.settingTreeRoot.getAndAssertEquals();
    root.assertEquals(onChainRoot);
    input.commiteeId.assertEquals(_commiteeId);
  }
}
