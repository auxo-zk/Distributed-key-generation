import {
  Encoding,
  Field,
  MerkleMap,
  MerkleMapWitness,
  Poseidon,
  PublicKey,
} from 'o1js';

export class ZkAppStorage {
  addressMap: MerkleMap;

  constructor(addressMap: MerkleMap) {
    this.addressMap = addressMap;
  }

  calculateLeaf(address: PublicKey): Field {
    return Poseidon.hash(address.toFields());
  }

  calculateIndex(name: string): Field {
    return Poseidon.hash(Encoding.stringToFields(name));
  }

  getWitness(index: Field): MerkleMapWitness {
    return this.addressMap.getWitness(index);
  }
}
