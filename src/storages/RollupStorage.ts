import { Field, MerkleTree, MerkleWitness } from 'o1js';
import { GenericStorage } from './GenericStorage.js';
import { INSTANCE_LIMITS } from '../constants.js';
import {
    AddressMT,
    AddressWitness,
    EMPTY_ADDRESS_MT,
} from './SharedStorage.js';

export const ROLLUP_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.ADDRESS * INSTANCE_LIMITS.ACTION)) + 1;
export class RollupMT extends MerkleTree {}
export class RollupWitness extends MerkleWitness(ROLLUP_TREE_HEIGHT) {}
export const EMPTY_ROLLUP_MT = () => new RollupMT(ROLLUP_TREE_HEIGHT);
export class RollupCounterMT extends AddressMT {}
export class RollupCounterWitness extends AddressWitness {}
export const EMPTY_ROLLUP_COUNTER_MT = EMPTY_ADDRESS_MT;

export function calculateActionIndex(
    zkAppIndex: Field,
    actionId: Field
): Field {
    return Field.from(BigInt(INSTANCE_LIMITS.ACTION))
        .mul(zkAppIndex)
        .add(actionId);
}

export type RollupLeaf = Field;

export class RollupStorage extends GenericStorage<
    RollupLeaf,
    RollupMT,
    RollupWitness,
    never,
    never
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RollupLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_ROLLUP_MT, undefined, leafs);
    }

    static calculateLeaf(actionHash: RollupLeaf): Field {
        return actionHash;
    }

    calculateLeaf(actionHash: RollupLeaf): Field {
        return RollupStorage.calculateLeaf(actionHash);
    }

    static calculateLevel1Index({
        zkAppIndex,
        actionId,
    }: {
        zkAppIndex: Field;
        actionId: Field;
    }): Field {
        return calculateActionIndex(zkAppIndex, actionId);
    }

    calculateLevel1Index({
        zkAppIndex,
        actionId,
    }: {
        zkAppIndex: Field;
        actionId: Field;
    }): Field {
        return RollupStorage.calculateLevel1Index({
            zkAppIndex,
            actionId,
        });
    }

    getWitness(level1Index: Field): RollupWitness {
        return super.getWitness(level1Index) as RollupWitness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: RollupLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type RollupCounterLeaf = Field;

export class RollupCounterStorage extends GenericStorage<
    RollupCounterLeaf,
    RollupCounterMT,
    RollupCounterWitness,
    never,
    never
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RollupCounterLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_ROLLUP_COUNTER_MT, undefined, leafs);
    }

    static calculateLeaf(counter: RollupCounterLeaf): Field {
        return counter;
    }

    calculateLeaf(counter: RollupCounterLeaf): Field {
        return RollupCounterStorage.calculateLeaf(counter);
    }

    static calculateLevel1Index(zkAppIndex: Field): Field {
        return zkAppIndex;
    }

    calculateLevel1Index(zkAppIndex: Field): Field {
        return RollupCounterStorage.calculateLevel1Index(zkAppIndex);
    }

    getWitness(level1Index: Field): RollupCounterWitness {
        return super.getWitness(level1Index) as RollupCounterWitness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: RollupCounterLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}
