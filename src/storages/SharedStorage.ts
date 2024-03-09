import {
    Field,
    MerkleMap,
    MerkleMapWitness,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
} from 'o1js';
import {
    ACTION_PROCESS_LIMITS,
    ADDRESS_MAX_SIZE,
    COMMITTEE_MAX_SIZE,
    ZkAppEnum,
} from '../constants.js';
import { FieldDynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { ErrorEnum } from '../contracts/constants.js';

export const ADDRESS_TREE_HEIGHT = Math.ceil(Math.log2(ADDRESS_MAX_SIZE)) + 1;
export class AddressMT extends MerkleTree {}
export class AddressWitness extends MerkleWitness(ADDRESS_TREE_HEIGHT) {}
export const EMPTY_ADDRESS_MT = () => new AddressMT(ADDRESS_TREE_HEIGHT);
export class ActionWitness extends MerkleMapWitness {}
export const EMPTY_ACTION_MT = () => new MerkleMap();

export class ZkAppRef extends Struct({
    address: PublicKey,
    witness: AddressWitness,
}) {}

export class AddressStorage {
    private _addressMap: AddressMT;
    private _addresses: {
        [key: string]: { raw: PublicKey | undefined; leaf: Field };
    };

    constructor(
        addresses?: { index: ZkAppEnum | number; address: PublicKey }[]
    ) {
        this._addressMap = EMPTY_ADDRESS_MT();
        this._addresses = {};
        if (addresses) {
            for (let i = 0; i < addresses.length; i++) {
                this.updateAddress(
                    AddressStorage.calculateIndex(addresses[i].index),
                    addresses[i].address
                );
            }
        }
    }

    get root(): Field {
        return this._addressMap.getRoot();
    }

    get addressMap(): AddressMT {
        return this._addressMap;
    }

    get addresses(): {
        [key: string]: { raw: PublicKey | undefined; leaf: Field };
    } {
        return this._addresses;
    }

    static calculateLeaf(address: PublicKey): Field {
        return Poseidon.hash(address.toFields());
    }

    calculateLeaf(address: PublicKey): Field {
        return AddressStorage.calculateLeaf(address);
    }

    static calculateIndex(index: ZkAppEnum | number): Field {
        return Field(index);
    }

    calculateIndex(index: ZkAppEnum | number): Field {
        return AddressStorage.calculateIndex(index);
    }

    getWitness(index: Field): AddressWitness {
        return new AddressWitness(
            this._addressMap.getWitness(index.toBigInt())
        );
    }

    updateLeaf(index: Field, leaf: Field): void {
        this._addressMap.setLeaf(index.toBigInt(), leaf);
        this._addresses[index.toString()] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateAddress(index: Field, address: PublicKey) {
        let leaf = this.calculateLeaf(address);
        this._addressMap.setLeaf(index.toBigInt(), leaf);
        this._addresses[index.toString()] = {
            raw: address,
            leaf: leaf,
        };
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

export enum RollupStatus {
    RECORDED,
    ROLLUPED,
}

export enum ProcessStatus {
    NOT_PROCESSED,
    PROCESSED,
}

export class ProcessedContributions extends FieldDynamicArray(
    COMMITTEE_MAX_SIZE
) {}

export class ProcessedActions extends FieldDynamicArray(
    ACTION_PROCESS_LIMITS
) {}

export class ActionStorage {
    private _actionMap: MerkleMap;
    private _actions: { [key: string]: Field };

    constructor(
        actions?: { actionState: Field; status: RollupStatus | ProcessStatus }[]
    ) {
        this._actionMap = EMPTY_ACTION_MT();
        this._actions = {};
        if (actions) {
            for (let i = 0; i < actions.length; i++) {
                this.updateLeaf(
                    actions[i].actionState,
                    ActionStorage.calculateLeaf(actions[i].status)
                );
            }
        }
    }

    get root(): Field {
        return this._actionMap.getRoot();
    }

    get actionMap(): MerkleMap {
        return this._actionMap;
    }

    get actions(): { [key: string]: Field } {
        return this._actions;
    }

    static calculateLeaf(status: RollupStatus | ProcessStatus): Field {
        return Field(status);
    }

    calculateLeaf(status: RollupStatus | ProcessStatus): Field {
        return ActionStorage.calculateLeaf(status);
    }

    static calculateIndex(actionIndex: Field): Field {
        return actionIndex;
    }

    calculateIndex(actionIndex: Field): Field {
        return ActionStorage.calculateIndex(actionIndex);
    }

    getWitness(index: Field): ActionWitness {
        return this._actionMap.getWitness(index);
    }

    updateLeaf(index: Field, leaf: Field): void {
        this._actionMap.set(index, leaf);
        this._actions[index.toString()] = leaf;
    }
}
