import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
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

export type AccumulationLeaf = {
    accumulatedR: Field;
    accumulatedM: Field;
};

export class AccumulationStorage extends RequestStorage<AccumulationLeaf> {
    static calculateLeaf(rawLeaf: AccumulationLeaf): Field {
        return Poseidon.hash([rawLeaf.accumulatedR, rawLeaf.accumulatedM]);
    }

    calculateLeaf(rawLeaf: AccumulationLeaf): Field {
        return AccumulationStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index({
        committeeId,
        keyId,
        requestId,
    }: {
        committeeId: Field;
        keyId: Field;
        requestId: Field;
    }): Field {
        return calculateRequestIndex(committeeId, keyId, requestId);
    }

    calculateLevel1Index(requestId: Field): Field {
        return AccumulationStorage.calculateLevel1Index({
            committeeId,
            keyId,
            requestId,
        });
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

export type RequesterLeaf = PublicKey;

export class RequesterStorage extends RequestStorage<RequesterLeaf> {
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

export type ResponseContributionLeaf = ResponseContribution;

export class ResponseContributionStorage extends RequestStorage<ResponseContributionLeaf> {
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
