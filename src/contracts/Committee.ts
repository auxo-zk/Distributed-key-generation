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
import { PublicKeyDynamicArray, IPFSHash } from '@auxo-dev/auxo-libs';
import { COMMITTEE_MAX_SIZE } from '../libs/Committee.js';
import { updateOutOfSnark } from '../libs/utils.js';

export const LEVEL2_TREE_HEIGHT = Math.log2(COMMITTEE_MAX_SIZE) + 1;
export class Level1MT extends MerkleMap {}
export class Level1Witness extends MerkleMapWitness {}
export class Level2MT extends MerkleTree {}
export class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
export const EMPTY_LEVEL_1_TREE = () => new Level1MT();
export const EMPTY_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);
export class FullMTWitness extends Struct({
  level1: Level1Witness,
  level2: Level2Witness,
}) {}

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
  N: Field,
  T: Field,
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

export class CommitteeAction extends Struct({
  addresses: MemberArray,
  threshold: Field,
  ipfsHash: IPFSHash,
}) {
  static fromFields(fields: Field[]): CommitteeAction {
    return new CommitteeAction({
      addresses: MemberArray.fromFields(
        fields.slice(0, COMMITTEE_MAX_SIZE + 1)
      ),
      threshold: fields[COMMITTEE_MAX_SIZE + 1],
      ipfsHash: IPFSHash.fromFields(
        fields.slice(COMMITTEE_MAX_SIZE + 2, COMMITTEE_MAX_SIZE + 5)
      ),
    });
  }
}

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
    this.memberTreeRoot.set(EmptyMerkleMap.getRoot());
    this.settingTreeRoot.set(EmptyMerkleMap.getRoot());
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

    this.emitEvent(
      EventEnum.COMMITTEE_CREATED,
      proof.publicOutput.currentCommitteeId
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
