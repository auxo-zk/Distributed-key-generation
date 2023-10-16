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
  Struct,
  Experimental,
} from 'o1js';

import DynamicGroupArray from '../type/DynamicGroupArray.js';

const accountFee = Mina.accountCreationFee();

const treeHeight = 6; // setting max 32 member
const Tree = new MerkleTree(treeHeight);
class MyMerkleWitness extends MerkleWitness(treeHeight) {}

export class GroupArray extends DynamicGroupArray(2 ** (treeHeight - 1)) {}

export class Committee extends SmartContract {
  @state(Field) vkDKGHash = State<Field>();
  @state(Field) curCommitteeId = State<Field>();

  init() {
    super.init();
    this.curCommitteeId.set(Field(1));
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
    address: PublicKey,
    verificationKey: VerificationKey
  ) {
    const curCommitteeId = this.curCommitteeId.getAndAssertEquals();
  }
}

export const createCommitteeProve = Experimental.ZkProgram({
  publicInput: GroupArray,
  publicOutput: Field,

  methods: {
    createProve: {
      privateInputs: [],

      method(input: GroupArray): Field {
        let tree = new MerkleTree(treeHeight);
        for (let i = 0; i < 32; i++) {
          tree.setLeaf(BigInt(i), GroupArray.hash(input.get(Field(i))));
        }
        return tree.getRoot();
      },
    },
  },
});

class CommitteeProve extends Experimental.ZkProgram.Proof(
  createCommitteeProve
) {}
