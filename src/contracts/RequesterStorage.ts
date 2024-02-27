import { Field, MerkleTree, MerkleWitness, Poseidon } from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage } from './GenericStorage.js';

export const LEVEL1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.REQUEST)) + 1;
export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);

export abstract class RequesterStorage<RawLeaf> extends GenericStorage<
    RawLeaf,
    Level1MT,
    Level1Witness,
    never,
    never
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RawLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }
}

export type RequestIdLeaf = Field;

export class RequestIdStorage extends RequesterStorage<RequestIdLeaf> {
    static calculateLeaf(requestId: RequestIdLeaf): Field {
        return requestId;
    }

    calculateLeaf(requestId: RequestIdLeaf): Field {
        return RequestIdStorage.calculateLeaf(requestId);
    }

    static calculateLevel1Index(taskId: Field): Field {
        return taskId;
    }

    calculateLevel1Index(taskId: Field): Field {
        return RequestIdStorage.calculateLevel1Index(taskId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: RequestIdLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type AccumulationLeaf = {
    accumulatedR: Field;
    accumulatedM: Field;
};

export class AccumulationStorage extends RequesterStorage<AccumulationLeaf> {
    static calculateLeaf(rawLeaf: AccumulationLeaf): Field {
        return Poseidon.hash([rawLeaf.accumulatedR, rawLeaf.accumulatedM]);
    }

    calculateLeaf(rawLeaf: AccumulationLeaf): Field {
        return AccumulationStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(taskId: Field): Field {
        return taskId;
    }

    calculateLevel1Index(taskId: Field): Field {
        return AccumulationStorage.calculateLevel1Index(taskId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: AccumulationLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type CommitmentLeaf = Field;

export class CommitmentStorage extends RequesterStorage<CommitmentLeaf> {
    static calculateLeaf(commitment: CommitmentLeaf): Field {
        return commitment;
    }

    calculateLeaf(commitment: CommitmentLeaf): Field {
        return CommitmentStorage.calculateLeaf(commitment);
    }

    static calculateLevel1Index(index: Field): Field {
        return index;
    }

    calculateLevel1Index(index: Field): Field {
        return CommitmentStorage.calculateLevel1Index(index);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: CommitmentLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}
