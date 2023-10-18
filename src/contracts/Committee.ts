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

import DynamicGroupArray from '../type/DynamicGroupArray.js';

const accountFee = Mina.accountCreationFee();

const treeHeight = 6; // setting max 32 member
const Tree = new MerkleTree(treeHeight);
class MyMerkleWitness extends MerkleWitness(treeHeight) {}

export class GroupArray extends DynamicGroupArray(2 ** (treeHeight - 1)) {}

function updateOutOfSnark(state: Field, action: Field[][]) {
  if (action === undefined) return state;
  let actionsHash = AccountUpdate.Actions.hash(action);
  return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}

export class RollupState extends Struct({
  actionHash: Field,
  memberTreeRoot: Field,
  settingTreeRoot: Field,
  dkgAddressTreeRoot: Field,
  currentCommitteeId: Field,
}) {}

export const createCommitteeProof = Experimental.ZkProgram({
  publicInput: RollupState,
  publicOutput: RollupState,

  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<RollupState, RollupState>,
        GroupArray,
        MyMerkleWitness,
        Group,
        MerkleMapWitness,
        Field,
        MerkleMapWitness,
      ],

      method(
        input: RollupState,
        preProof: SelfProof<RollupState, RollupState>,
        publickeys: GroupArray,
        memberWitness: MyMerkleWitness,
        newAddresses: Group,
        settingWitess: MerkleMapWitness,
        threshold: Field,
        dkgAddressWitness: MerkleMapWitness
      ): RollupState {
        preProof.verify();

        ////// caculate new memberTreeRoot
        let newCommitteeId = memberWitness.calculateIndex();
        newCommitteeId.assertEquals(
          preProof.publicOutput.currentCommitteeId.add(Field(1))
        );
        let preMemberRoot = memberWitness.calculateRoot(Field(0));
        preMemberRoot.assertEquals(preProof.publicOutput.memberTreeRoot);
        let tree = new MerkleTree(treeHeight);
        for (let i = 0; i < 32; i++) {
          tree.setLeaf(BigInt(i), GroupArray.hash(publickeys.get(Field(i))));
        }
        // update new tree of public key in to the member tree
        let newMemberRoot = memberWitness.calculateRoot(tree.getRoot());

        ////// caculate new settingTreeRoot
        let [preSettingRoot, settingKey] = settingWitess.computeRootAndKey(
          Field(0)
        );
        settingKey.assertEquals(newCommitteeId);
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
        addressKey.assertEquals(newCommitteeId);
        preAddressRoot.assertEquals(preProof.publicOutput.dkgAddressTreeRoot);
        // update new tree of public key in to the member tree
        let [newAddressRoot] = dkgAddressWitness.computeRootAndKey(
          GroupArray.hash(newAddresses)
        );

        return new RollupState({
          actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [
            [
              publickeys.length,
              publickeys.toFields(),
              newAddresses.toFields(),
              threshold,
            ].flat(),
          ]),
          memberTreeRoot: newMemberRoot,
          settingTreeRoot: newSettingRoot,
          dkgAddressTreeRoot: newAddressRoot,
          currentCommitteeId: newCommitteeId,
        });
      },
    },

    firstStep: {
      privateInputs: [],

      method(input: RollupState): RollupState {
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

  @state(Field) curCommitteeId = State<Field>();
  @state(Field) memberTreeRoot = State<Field>();
  @state(Field) settingTreeRoot = State<Field>();
  @state(Field) dkgAddressTreeRoot = State<Field>();

  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: CommitteeInput });

  init() {
    super.init();
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
    this.send({ to: this.sender, amount: accountFee });
  }

  @method createCommittee(
    addresses: GroupArray,
    dkgAddress: Group,
    threshold: Field
  ) {
    threshold.assertLessThanOrEqual(addresses.length);
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
    let curCommitteeId = this.curCommitteeId.getAndAssertEquals();
    let memberTreeRoot = this.memberTreeRoot.getAndAssertEquals();
    let settingTreeRoot = this.settingTreeRoot.getAndAssertEquals();
    let dkgAddressTreeRoot = this.dkgAddressTreeRoot.getAndAssertEquals();

    curActionState.assertEquals(proof.publicInput.actionHash);
    curCommitteeId.assertEquals(proof.publicInput.currentCommitteeId);
    memberTreeRoot.assertEquals(proof.publicInput.memberTreeRoot);
    settingTreeRoot.assertEquals(proof.publicInput.settingTreeRoot);
    dkgAddressTreeRoot.assertEquals(proof.publicInput.dkgAddressTreeRoot);

    // compute the new counter and hash from pending actions
    let pendingActions = this.reducer.getActions({
      fromActionState: curActionState,
    });

    let { state: newCounter, actionState: newActionState } =
      this.reducer.reduce(
        pendingActions,
        // state type
        Field,
        // function that says how to apply an action
        (state: Field, action: CommitteeInput) => {
          return Field(0);
        },
        { state: Field(0), actionState: curActionState }
      );

    newActionState.assertEquals(proof.publicOutput.actionHash);

    // update on-chain state
    this.actionState.set(proof.publicOutput.actionHash);
    this.curCommitteeId.set(proof.publicOutput.currentCommitteeId);
    this.memberTreeRoot.set(proof.publicOutput.memberTreeRoot);
    this.settingTreeRoot.set(proof.publicOutput.settingTreeRoot);
    this.dkgAddressTreeRoot.set(proof.publicOutput.dkgAddressTreeRoot);
  }
}
