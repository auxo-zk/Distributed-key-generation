import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
    UInt64,
} from 'o1js';
import { ResponseContribution } from '../libs/Committee.js';
import { COMMITTEE_MAX_SIZE, INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage } from './GenericStorage.js';

export const LEVEL1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.REQUEST)) + 1;
export const LEVEL2_TREE_HEIGHT = Math.ceil(Math.log2(COMMITTEE_MAX_SIZE)) + 1;
export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
export class Level2MT extends MerkleTree {}
export class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);
export const EMPTY_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);
export class FullMTWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}

export abstract class RequestStorage<RawLeaf> extends GenericStorage<
    RawLeaf,
    Level1MT,
    Level1Witness,
    Level2MT,
    Level2Witness
> {}

export type RequestIdLeaf = Field;

export class RequestIdStorage extends RequestStorage<RequestIdLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RequestIdLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }
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

export type CommitmentLeaf = Field;

export class CommitmentStorage extends RequestStorage<CommitmentLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: CommitmentLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }

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

// TODO: Consider changing to UInt64 for optimization
export type KeyIndexLeaf = Field;

export class KeyIndexStorage extends RequestStorage<KeyIndexLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyIndexLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }
    static calculateLeaf(keyIndex: KeyIndexLeaf): Field {
        return keyIndex;
    }

    calculateLeaf(keyIndex: KeyIndexLeaf): Field {
        return KeyIndexStorage.calculateLeaf(keyIndex);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return KeyIndexStorage.calculateLevel1Index(requestId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: KeyIndexLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type RequesterLeaf = PublicKey;

export class RequesterStorage extends RequestStorage<RequesterLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RequesterLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }

    static calculateLeaf(address: RequesterLeaf): Field {
        return Poseidon.hash(address.toFields());
    }

    calculateLeaf(address: RequesterLeaf): Field {
        return RequesterStorage.calculateLeaf(address);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return RequesterStorage.calculateLevel1Index(requestId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: RequesterLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type RequestStatusLeaf = Field;

export class RequestStatusStorage extends RequestStorage<RequestStatusLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RequestStatusLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }

    static calculateLeaf(keyIndex: RequestStatusLeaf): Field {
        return keyIndex;
    }

    calculateLeaf(keyIndex: RequestStatusLeaf): Field {
        return RequestStatusStorage.calculateLeaf(keyIndex);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return RequestStatusStorage.calculateLevel1Index(requestId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: RequestStatusLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type RequestPeriodLeaf = {
    startTimestamp: UInt64;
    endTimestamp: UInt64;
};

export class RequestPeriodStorage extends RequestStorage<RequestPeriodLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RequestPeriodLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }

    static calculateLeaf(rawLeaf: RequestPeriodLeaf): Field {
        return Poseidon.hash(
            [
                rawLeaf.startTimestamp.toFields(),
                rawLeaf.endTimestamp.toFields(),
            ].flat()
        );
    }

    calculateLeaf(rawLeaf: RequestPeriodLeaf): Field {
        return RequestPeriodStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return RequestStatusStorage.calculateLevel1Index(requestId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: RequestPeriodLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type AccumulationLeaf = {
    accumulatedR: Field;
    accumulatedM: Field;
};

export class AccumulationStorage extends RequestStorage<AccumulationLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: AccumulationLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }

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

export type ResponseContributionLeaf = ResponseContribution;

export class ResponseContributionStorage extends RequestStorage<ResponseContributionLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ResponseContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, EMPTY_LEVEL_2_TREE, leafs);
    }

    static calculateLeaf(contribution: ResponseContributionLeaf): Field {
        return contribution.hash();
    }

    calculateLeaf(contribution: ResponseContributionLeaf): Field {
        return ResponseContributionStorage.calculateLeaf(contribution);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return ResponseContributionStorage.calculateLevel1Index(requestId);
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return ResponseContributionStorage.calculateLevel2Index(memberId);
    }

    getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
        return super.getWitness(level1Index, level2Index) as FullMTWitness;
    }

    updateLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index: Field },
        leaf: Field
    ): void {
        super.updateLeaf({ level1Index, level2Index }, leaf);
    }

    updateRawLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index: Field },
        rawLeaf: ResponseContributionLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}
