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

export class RollupState extends Struct({
  actionHash: Field,
  memberTreeRoot: Field,
}) {
  hash(): Field {
    return Poseidon.hash([this.actionHash, this.memberTreeRoot]);
  }
}

export class DKGContract extends SmartContract {
  @state(Field) num = State<Field>();

  @method addNum(addNum: Field) {
    const currentState = this.num.getAndAssertEquals();
    const newState = currentState.add(addNum);
    this.num.set(newState);
  }
}
