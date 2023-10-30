import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  MerkleWitness,
  Group,
  Bool,
  Reducer,
  DeployArgs,
  Permissions,
  provablePure,
  VerificationKey,
  AccountUpdate,
  Mina,
  MerkleTree,
  MerkleMap,
  MerkleMapWitness,
  Struct,
  Experimental,
  SelfProof,
  Empty,
  Poseidon,
} from 'o1js';
import DynamicArray from '../libs/DynamicArray.js';
import { updateOutOfSnark } from '../libs/utils.js';

const accountFee = Mina.accountCreationFee();

const treeHeight = 6; // setting max 32 member
const EmptyMerkleMap = new MerkleMap();
const Tree = new MerkleTree(treeHeight);
export class CommitteeMerkleWitness extends MerkleWitness(treeHeight) {}

export class GroupArray extends DynamicArray(Group, 2 ** (treeHeight - 1)) {}

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
  address: Group,
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

export const createCommitteeProof = Experimental.ZkProgram({
  publicInput: CommitteeRollupState,
  publicOutput: CommitteeRollupState,

  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<CommitteeRollupState, CommitteeRollupState>,
        GroupArray,
        MerkleMapWitness,
        MerkleMapWitness,
        Field,
      ],

      method(
        input: CommitteeRollupState,
        preProof: SelfProof<CommitteeRollupState, CommitteeRollupState>,
        publickeys: GroupArray,
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
        let tree = new MerkleTree(treeHeight);
        for (let i = 0; i < 32; i++) {
          tree.setLeaf(BigInt(i), GroupArray.hash(publickeys.get(Field(i))));
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

class CommitteeProof extends Experimental.ZkProgram.Proof(
  createCommitteeProof
) {}

export class CommitteeInput extends Struct({
  addresses: GroupArray,
  threshold: Field,
}) {}

export class Committee extends SmartContract {
  @state(Field) nextCommitteeId = State<Field>();
  @state(Field) memberTreeRoot = State<Field>();
  @state(Field) settingTreeRoot = State<Field>();

  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: CommitteeInput });

  events = {
    addresses: GroupArray,
    threshold: Field,
  };

  init() {
    super.init();
    this.memberTreeRoot.set(EmptyMerkleMap.getRoot());
    this.settingTreeRoot.set(EmptyMerkleMap.getRoot());
    this.actionState.set(Reducer.initialActionState);
  }

  @method createCommittee(addresses: GroupArray, threshold: Field) {
    threshold.assertLessThanOrEqual(addresses.length);
    this.reducer.dispatch(
      new CommitteeInput({
        addresses,
        threshold,
      })
    );

    this.emitEvent('addresses', addresses);
    this.emitEvent('threshold', threshold);
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
  }

  @method checkMember(input: CheckMemberInput) {
    let leaf = input.memberMerkleTreeWitness.calculateRoot(
      GroupArray.hash(input.address)
    );
    let [root, _commiteeId] =
      input.memberMerkleMapWitness.computeRootAndKey(leaf);
    const onChainRoot = this.memberTreeRoot.getAndAssertEquals();
    root.assertEquals(onChainRoot);
    input.commiteeId.assertEquals(_commiteeId);
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
