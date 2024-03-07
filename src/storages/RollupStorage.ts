import { Field, MerkleTree, MerkleWitness, Poseidon, PublicKey } from 'o1js';
import { GenericStorage } from './GenericStorage.js';

export const ROLLUP_TREE_HEIGHT = 256;
export class RollupMT extends MerkleTree {}
export class RollupWitness extends MerkleWitness(ROLLUP_TREE_HEIGHT) {}
export const EMPTY_ROLLUP_MT = () => new RollupMT(ROLLUP_TREE_HEIGHT);

export type RollupCounterLeaf = Field;

export class RollupCounterStorage extends GenericStorage<
    RollupCounterLeaf,
    RollupMT,
    RollupWitness,
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
        super(EMPTY_ROLLUP_MT, undefined, leafs);
    }
    static calculateLeaf(counter: RollupCounterLeaf): Field {
        return counter;
    }

    calculateLeaf(counter: RollupCounterLeaf): Field {
        return RollupCounterStorage.calculateLeaf(counter);
    }

    static calculateLevel1Index(address: PublicKey): Field {
        return Poseidon.hash(address.toFields());
    }

    calculateLevel1Index(address: PublicKey): Field {
        return RollupCounterStorage.calculateLevel1Index(address);
    }

    getWitness(level1Index: Field): RollupWitness {
        return super.getWitness(level1Index) as RollupWitness;
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
