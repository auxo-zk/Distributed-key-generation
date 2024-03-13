import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
} from 'o1js';
import {
    ACTION_PROCESS_LIMITS,
    INSTANCE_LIMITS,
    ZkAppEnum,
} from '../constants.js';
import { FieldDynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { ErrorEnum } from '../contracts/constants.js';
import { GenericStorage } from './GenericStorage.js';

export const ADDRESS_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.ADDRESS)) + 1;
export class AddressMT extends MerkleTree {}
export class AddressWitness extends MerkleWitness(ADDRESS_TREE_HEIGHT) {}
export const EMPTY_ADDRESS_MT = () => new AddressMT(ADDRESS_TREE_HEIGHT);

export const ACTION_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.ACTION)) + 1;
export class ActionMT extends MerkleTree {}
export class ActionWitness extends MerkleWitness(ACTION_TREE_HEIGHT) {}
export const EMPTY_ACTION_MT = () => new ActionMT(ACTION_TREE_HEIGHT);

export class ZkAppRef extends Struct({
    address: PublicKey,
    witness: AddressWitness,
}) {}

export class AddressStorage extends GenericStorage<
    PublicKey,
    AddressMT,
    AddressWitness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: PublicKey | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_ADDRESS_MT, undefined, leafs);
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

    static calculateLevel1Index(index: ZkAppEnum | number): Field {
        return Field(index);
    }

    calculateLevel1Index(index: ZkAppEnum | number): Field {
        return AddressStorage.calculateLevel1Index(index);
    }

    static calculateIndex(index: ZkAppEnum | number): Field {
        return AddressStorage.calculateLevel1Index(index);
    }

    calculateIndex(index: ZkAppEnum | number): Field {
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

    getZkAppRef(index: ZkAppEnum | number, address: PublicKey) {
        return new ZkAppRef({
            address: address,
            witness: this.getWitness(this.calculateIndex(index)),
        });
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
            map.getWitness(AddressStorage.calculateIndex(index).toBigInt())
        ),
    });
}

/**
 * Verify the address of a zkApp
 * @param ref Reference to a zkApp
 * @param key Index of its address in MT
 */
export function verifyZkApp(
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

export class ProcessedContributions extends FieldDynamicArray(
    INSTANCE_LIMITS.MEMBER
) {}

export class ProcessedActions extends FieldDynamicArray(
    ACTION_PROCESS_LIMITS
) {}

export class ActionStorageV1 extends GenericStorage<
    Field,
    ActionMT,
    ActionWitness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: Field | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_ACTION_MT, undefined, leafs);
    }

    get actionMap() {
        return this.level1;
    }

    get actions(): { [key: string]: { leaf: Field } } {
        return this.leafs;
    }

    static calculateLeaf(nextActionState: Field): Field {
        return Field(nextActionState);
    }

    calculateLeaf(nextActionState: Field): Field {
        return ActionStorageV1.calculateLeaf(nextActionState);
    }

    static calculateLevel1Index(actionIndex: Field): Field {
        return actionIndex;
    }

    calculateLevel1Index(actionIndex: Field): Field {
        return ActionStorageV1.calculateLevel1Index(actionIndex);
    }

    static calculateIndex(actionIndex: Field): Field {
        return ActionStorageV1.calculateLevel1Index(actionIndex);
    }

    calculateIndex(actionIndex: Field): Field {
        return ActionStorageV1.calculateIndex(actionIndex);
    }

    getWitness(index: Field): ActionWitness {
        return super.getWitness(index) as ActionWitness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: Field
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }

    updateAction(index: Field, nextActionState: Field): void {
        super.updateRawLeaf({ level1Index: index }, nextActionState);
    }
}
