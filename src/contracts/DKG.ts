import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  Group,
  Bool,
  Reducer,
  Permissions,
  MerkleMap,
  MerkleMapWitness,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
} from 'o1js';

export class DKGContract extends SmartContract {
  @state(Field) keyId = State<Field>();
  @state(Field) round1Contribution = State<Field>();
  @state(Field) round2Contribution = State<Field>();
  @state(Field) tallyContribution = State<Field>();
}
