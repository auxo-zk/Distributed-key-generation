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
  dkgAddressTreeRoot: Field,
  currentCommitteeId: Field,
}) {
  hash(): Field {
    return Poseidon.hash([
      this.actionHash,
      this.memberTreeRoot,
      this.settingTreeRoot,
      this.dkgAddressTreeRoot,
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
        Group,
        MerkleMapWitness,
        Field,
        MerkleMapWitness,
      ],

      method(
        input: CommitteeRollupState,
        preProof: SelfProof<CommitteeRollupState, CommitteeRollupState>,
        publickeys: GroupArray,
        memberWitness: MerkleMapWitness,
        newAddress: Group,
        settingWitess: MerkleMapWitness,
        threshold: Field,
        dkgAddressWitness: MerkleMapWitness
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
        let [newSettingRoot] = dkgAddressWitness.computeRootAndKey(
          // hash [t,n]
          Poseidon.hash([threshold, publickeys.length])
        );

        ////// caculate new address tree root
        let [preAddressRoot, addressKey] = dkgAddressWitness.computeRootAndKey(
          Field(0)
        );
        addressKey.assertEquals(nextCommitteeId);
        preAddressRoot.assertEquals(preProof.publicOutput.dkgAddressTreeRoot);
        // update new tree of public key in to the member tree
        let [newAddressRoot] = dkgAddressWitness.computeRootAndKey(
          GroupArray.hash(newAddress)
        );

        return new CommitteeRollupState({
          actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [
            [
              publickeys.length,
              publickeys.toFields(),
              newAddress.toFields(),
              threshold,
            ].flat(),
          ]),
          memberTreeRoot: newMemberRoot,
          settingTreeRoot: newSettingRoot,
          dkgAddressTreeRoot: newAddressRoot,
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
  dkgAddress: Group,
  threshold: Field,
}) {}

export class Committee extends SmartContract {
  @state(Field) vkDKGHash = State<Field>();

  @state(Field) nextCommitteeId = State<Field>();
  @state(Field) memberTreeRoot = State<Field>();
  @state(Field) settingTreeRoot = State<Field>();
  @state(Field) dkgAddressTreeRoot = State<Field>();

  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: CommitteeInput });

  init() {
    super.init();
    this.memberTreeRoot.set(EmptyMerkleMap.getRoot());
    this.settingTreeRoot.set(EmptyMerkleMap.getRoot());
    this.dkgAddressTreeRoot.set(EmptyMerkleMap.getRoot());
    this.actionState.set(Reducer.initialActionState);
  }

  // to-do add permission only owner
  @method setVkDKGHash(verificationKey: VerificationKey) {
    this.vkDKGHash.set(verificationKey.hash);
  }

  @method deployContract(address: PublicKey, verificationKey: VerificationKey) {
    const currentVKHash = this.vkDKGHash.getAndAssertEquals();
    verificationKey.hash.assertEquals(currentVKHash);
    let dkgContract = AccountUpdate.createSigned(address);
    dkgContract.account.isNew.assertEquals(Bool(true));
    // To-do: setting not cho change permision on the future
    dkgContract.account.permissions.set(Permissions.default());
    dkgContract.account.verificationKey.set(verificationKey);
  }

  @method createCommittee(
    addresses: GroupArray,
    threshold: Field,
    dkgAddress: Group,
    verificationKey: VerificationKey
  ) {
    threshold.assertLessThanOrEqual(addresses.length);
    this.deployContract(PublicKey.fromGroup(dkgAddress), verificationKey);
    this.reducer.dispatch(
      new CommitteeInput({
        addresses,
        dkgAddress,
        threshold,
      })
    );
  }

  @method rollupIncrements(proof: CommitteeProof) {
    proof.verify();
    let curActionState = this.actionState.getAndAssertEquals();
    let nextCommitteeId = this.nextCommitteeId.getAndAssertEquals();
    let memberTreeRoot = this.memberTreeRoot.getAndAssertEquals();
    let settingTreeRoot = this.settingTreeRoot.getAndAssertEquals();
    let dkgAddressTreeRoot = this.dkgAddressTreeRoot.getAndAssertEquals();

    curActionState.assertEquals(proof.publicInput.actionHash);
    nextCommitteeId.assertEquals(proof.publicInput.currentCommitteeId);
    memberTreeRoot.assertEquals(proof.publicInput.memberTreeRoot);
    settingTreeRoot.assertEquals(proof.publicInput.settingTreeRoot);
    dkgAddressTreeRoot.assertEquals(proof.publicInput.dkgAddressTreeRoot);

    this.account.actionState.assertEquals(proof.publicOutput.actionHash);

    // update on-chain state
    this.actionState.set(proof.publicOutput.actionHash);
    this.nextCommitteeId.set(proof.publicOutput.currentCommitteeId);
    this.memberTreeRoot.set(proof.publicOutput.memberTreeRoot);
    this.settingTreeRoot.set(proof.publicOutput.settingTreeRoot);
    this.dkgAddressTreeRoot.set(proof.publicOutput.dkgAddressTreeRoot);
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
