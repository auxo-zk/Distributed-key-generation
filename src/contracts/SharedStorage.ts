import {
  Encoding,
  Field,
  MerkleMap,
  MerkleMapWitness,
  MerkleTree,
  MerkleWitness,
  Poseidon,
  PublicKey,
  Struct,
} from 'o1js';
import { ADDRESS_MAX_SIZE, ZkAppEnum } from '../constants.js';

export const ADDRESS_TREE_HEIGHT = Math.ceil(Math.log2(ADDRESS_MAX_SIZE)) + 1;
export class AddressMT extends MerkleTree {}
export class AddressWitness extends MerkleWitness(ADDRESS_TREE_HEIGHT) {}
export const EMPTY_ADDRESS_MT = () => new AddressMT(ADDRESS_TREE_HEIGHT);
export class ReduceWitness extends MerkleMapWitness {}
export const EMPTY_REDUCE_MT = () => new MerkleMap();

export class ZkAppRef extends Struct({
  address: PublicKey,
  witness: AddressWitness,
}) {}

export class AddressStorage {
  addresses: AddressMT;

  constructor(addresses?: AddressMT) {
    this.addresses = addresses || EMPTY_ADDRESS_MT();
  }

  calculateLeaf(address: PublicKey): Field {
    return Poseidon.hash(address.toFields());
  }

  calculateIndex(index: ZkAppEnum | number): Field {
    return Field(index);
  }

  getWitness(index: Field): AddressWitness {
    return new AddressWitness(this.addresses.getWitness(index.toBigInt()));
  }
}

export function getZkAppRef(
  map: AddressMT,
  index: ZkAppEnum | number,
  address: PublicKey
) {
  return new ZkAppRef({
    address: address,
    witness: new AddressWitness(
      map.getWitness(new AddressStorage().calculateIndex(index).toBigInt())
    ),
  });
}

export const enum ActionStatus {
  NOT_EXISTED,
  REDUCED,
}

export class ReduceStorage {
  actions: MerkleMap;

  constructor(actions?: MerkleMap) {
    this.actions = actions || EMPTY_REDUCE_MT();
  }

  calculateLeaf(status: ActionStatus): Field {
    return Field(status);
  }

  calculateIndex(actionState: Field): Field {
    return actionState;
  }

  getWitness(index: Field): MerkleMapWitness {
    return this.actions.getWitness(index);
  }

  updateLeaf(index: Field, leaf: Field): void {
    this.actions.set(index, leaf);
  }
}
