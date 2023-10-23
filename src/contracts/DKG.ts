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

export class MockDKGContract extends SmartContract {
  @state(Field) pharse = State<Field>();
  // 0: round 1
  // 1: round 2
}
