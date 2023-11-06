import { Encoding, MerkleMap, MerkleMapWitness, Poseidon, PublicKey, Struct } from "o1js";

export class ZkAppRef extends Struct({
  address: PublicKey,
  witness: MerkleMapWitness,
}) { }

export function getZkAppRef(map: MerkleMap, key: string, address: PublicKey) {
  return new ZkAppRef({
    address: address,
    witness: map.getWitness(Poseidon.hash(Encoding.stringToFields(key)))
  });
}