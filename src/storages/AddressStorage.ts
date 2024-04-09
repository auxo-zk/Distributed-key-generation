import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { INSTANCE_LIMITS } from '../constants.js';
import { ErrorEnum, ZkAppIndex } from '../contracts/constants.js';
import { GenericStorage, Witness } from './GenericStorage.js';

export {
    ADDRESS_MT,
    ADDRESS_WITNESS,
    getZkAppRef,
    verifyZkApp,
    AddressMT,
    AddressWitness,
    ZkAppRef,
    AddressStorage,
};

const ADDRESS_TREE_HEIGHT = Math.ceil(Math.log2(INSTANCE_LIMITS.ADDRESS)) + 1;
class AddressMT extends MerkleTree {}
class AddressWitness extends MerkleWitness(ADDRESS_TREE_HEIGHT) {}
const ADDRESS_MT = () => new AddressMT(ADDRESS_TREE_HEIGHT);
const ADDRESS_WITNESS = (witness: Witness) => new AddressWitness(witness);

class ZkAppRef extends Struct({
    address: PublicKey,
    witness: AddressWitness,
}) {}

class AddressStorage extends GenericStorage<PublicKey> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: PublicKey | Field;
            isRaw: boolean;
        }[]
    ) {
        super(ADDRESS_MT, ADDRESS_WITNESS, undefined, undefined, leafs);
    }

    get addressMap(): AddressMT {
        return this.level1;
    }

    get addresses(): {
        [key: string]: { raw: PublicKey | undefined; leaf: Field };
    } {
        return this.leafs;
    }

    static calculateLeaf(address: PublicKey): Field {
        return Poseidon.hash(address.toFields());
    }

    calculateLeaf(address: PublicKey): Field {
        return AddressStorage.calculateLeaf(address);
    }

    static calculateLevel1Index(index: ZkAppIndex | number): Field {
        return Field(index);
    }

    calculateLevel1Index(index: ZkAppIndex | number): Field {
        return AddressStorage.calculateLevel1Index(index);
    }

    static calculateIndex(index: ZkAppIndex | number): Field {
        return AddressStorage.calculateLevel1Index(index);
    }

    calculateIndex(index: ZkAppIndex | number): Field {
        return AddressStorage.calculateIndex(index);
    }

    getWitness(index: Field): AddressWitness {
        return super.getWitness(index) as AddressWitness;
    }

    updateAddressLeaf(index: Field, leaf: Field): void {
        super.updateLeaf({ level1Index: index }, leaf);
    }

    updateAddress(index: Field, address: PublicKey) {
        super.updateRawLeaf({ level1Index: index }, address);
    }

    getZkAppRef(index: ZkAppIndex | number, address: PublicKey) {
        return new ZkAppRef({
            address: address,
            witness: this.getWitness(this.calculateIndex(index)),
        });
    }
}

function getZkAppRef(
    addressTree: AddressMT,
    zkAppIndex: ZkAppIndex | number,
    address: PublicKey
) {
    return new ZkAppRef({
        address: address,
        witness: new AddressWitness(
            addressTree.getWitness(
                AddressStorage.calculateIndex(zkAppIndex).toBigInt()
            )
        ),
    });
}

/**
 * Verify the address of a zkApp
 * @param ref Reference to a zkApp
 * @param key Index of its address in MT
 */
function verifyZkApp(
    programName: string,
    ref: ZkAppRef,
    root: Field,
    key: Field
) {
    root.assertEquals(
        ref.witness.calculateRoot(Poseidon.hash(ref.address.toFields())),
        Utils.buildAssertMessage(
            programName,
            'verifyZkApp',
            ErrorEnum.ZKAPP_ROOT
        )
    );

    key.assertEquals(
        ref.witness.calculateIndex(),
        Utils.buildAssertMessage(
            programName,
            'verifyZkApp',
            ErrorEnum.ZKAPP_INDEX
        )
    );
}
