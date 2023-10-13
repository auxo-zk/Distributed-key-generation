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
} from 'o1js';

const accountFee = Mina.accountCreationFee();

export class Committee extends SmartContract {
  @state(Field) vkDKGHash = State<Field>();

  init() {
    super.init();
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
}
