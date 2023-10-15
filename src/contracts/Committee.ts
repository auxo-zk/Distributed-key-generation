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

import DynamicArray from '../type/DynamicArray';

const accountFee = Mina.accountCreationFee();

const treeHeight = 5; // setting max 32 member
const Tree = new MerkleTree(treeHeight);
class MyMerkleWitness extends MerkleWitness(treeHeight) {}

export class GroupArray extends DynamicArray(Group, 32) {}

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
    dkgContract.account.permissions.set(Permissions.default());
    dkgContract.account.verificationKey.set(verificationKey);
    this.send({ to: this.sender, amount: accountFee });
  }

  @method createCommittee(
    address: PublicKey,
    verificationKey: VerificationKey
  ) {
    const currentVKHash = this.vkDKGHash.getAndAssertEquals();
    verificationKey.hash.assertEquals(currentVKHash);
    let dkgContract = AccountUpdate.createSigned(address);
    dkgContract.account.isNew.assertEquals(Bool(true));
    dkgContract.account.permissions.set(Permissions.default());
    dkgContract.account.verificationKey.set(verificationKey);
    this.send({ to: this.sender, amount: accountFee });
  }
}

// const createCommitteeProve = Experimental.ZkProgram({
//   publicInput: GroupArray,

//   methods: {
//     createProve: {
//       privateInputs: [],

//       method(state: GroupArray) {},
//     },
//   },
// });
