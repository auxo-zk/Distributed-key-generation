import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    Struct,
    UInt32,
    UInt64,
} from 'o1js';
import { StaticArray } from '@auxo-dev/auxo-libs';
import { ENCRYPTION_LIMITS, INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage, Witness } from './GenericStorage.js';

export {
    REQUESTER_LEVEL_1_TREE,
    REQUESTER_LEVEL_1_WITNESS,
    COMMITMENT_TREE,
    COMMITMENT_WITNESS,
    Level1MT as RequesterLevel1MT,
    Level1Witness as RequesterLevel1Witness,
    CommitmentMT,
    CommitmentWitness,
};

export {
    RequesterCounters,
    KeyIndexLeaf as RequesterKeyIndexLeaf,
    KeyIndexStorage as RequesterKeyIndexStorage,
    TimestampLeaf,
    TimestampStorage,
    AccumulationLeaf as RequesterAccumulationLeaf,
    AccumulationStorage as RequesterAccumulationStorage,
    CommitmentLeaf,
    CommitmentStorage,
    CommitmentWitnesses,
};

const LEVEL1_TREE_HEIGHT = Math.ceil(Math.log2(INSTANCE_LIMITS.REQUEST)) + 1;
const COMMITMENT_TREE_HEIGHT =
    Math.ceil(
        Math.log2(INSTANCE_LIMITS.REQUEST * ENCRYPTION_LIMITS.SUBMISSION)
    ) + 1;
class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
class CommitmentMT extends MerkleTree {}
class CommitmentWitness extends MerkleWitness(COMMITMENT_TREE_HEIGHT) {}
const REQUESTER_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);
const REQUESTER_LEVEL_1_WITNESS = (witness: Witness) =>
    new Level1Witness(witness);
const COMMITMENT_TREE = () => new CommitmentMT(COMMITMENT_TREE_HEIGHT);
const COMMITMENT_WITNESS = (witness: Witness) => new CommitmentWitness(witness);

class RequesterCounters extends Struct({
    taskCounter: UInt32,
    commitmentCounter: UInt64,
}) {
    static fromFields(fields: Field[]): RequesterCounters {
        return new RequesterCounters({
            taskCounter: UInt32.fromFields([
                Field.fromBits(fields[0].toBits().slice(0, 32)),
            ]),
            commitmentCounter: UInt64.fromFields([
                Field.fromBits(fields[0].toBits().slice(32, 96)),
            ]),
        });
    }

    static toFields({
        taskCounter,
        commitmentCounter,
    }: {
        taskCounter: UInt32;
        commitmentCounter: UInt64;
    }): Field[] {
        return [
            Field.fromBits([
                ...taskCounter.value.toBits(32),
                ...commitmentCounter.value.toBits(64),
            ]),
        ];
    }

    static hash({
        taskCounter,
        commitmentCounter,
    }: {
        taskCounter: UInt32;
        commitmentCounter: UInt64;
    }): Field {
        return Poseidon.hash([taskCounter.value, commitmentCounter.value]);
    }

    static empty(): RequesterCounters {
        return new RequesterCounters({
            taskCounter: UInt32.zero,
            commitmentCounter: UInt64.zero,
        });
    }

    toFields(): Field[] {
        return RequesterCounters.toFields(this);
    }

    hash(): Field {
        return RequesterCounters.hash(this);
    }
}

type KeyIndexLeaf = Field;
class KeyIndexStorage extends GenericStorage<KeyIndexLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyIndexLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            REQUESTER_LEVEL_1_TREE,
            REQUESTER_LEVEL_1_WITNESS,
            undefined,
            undefined,
            leafs
        );
    }
    static calculateLeaf(keyIndex: KeyIndexLeaf): Field {
        return keyIndex;
    }

    calculateLeaf(keyIndex: KeyIndexLeaf): Field {
        return KeyIndexStorage.calculateLeaf(keyIndex);
    }

    static calculateLevel1Index(taskId: Field): Field {
        return taskId;
    }

    calculateLevel1Index(taskId: Field): Field {
        return KeyIndexStorage.calculateLevel1Index(taskId);
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

type TimestampLeaf = UInt64;
class TimestampStorage extends GenericStorage<TimestampLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: TimestampLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            REQUESTER_LEVEL_1_TREE,
            REQUESTER_LEVEL_1_WITNESS,
            undefined,
            undefined,
            leafs
        );
    }
    static calculateLeaf(timestamp: TimestampLeaf): Field {
        return timestamp.value;
    }

    calculateLeaf(timestamp: TimestampLeaf): Field {
        return TimestampStorage.calculateLeaf(timestamp);
    }

    static calculateLevel1Index(taskId: Field): Field {
        return taskId;
    }

    calculateLevel1Index(taskId: Field): Field {
        return TimestampStorage.calculateLevel1Index(taskId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: TimestampLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type AccumulationLeaf = {
    accumulationRootR: Field;
    accumulationRootM: Field;
};
class AccumulationStorage extends GenericStorage<AccumulationLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: AccumulationLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            REQUESTER_LEVEL_1_TREE,
            REQUESTER_LEVEL_1_WITNESS,
            undefined,
            undefined,
            leafs
        );
    }

    static calculateLeaf(rawLeaf: AccumulationLeaf): Field {
        return Poseidon.hash([
            rawLeaf.accumulationRootR,
            rawLeaf.accumulationRootM,
        ]);
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

    updateLeafWithR(
        { level1Index }: { level1Index: Field },
        leaf: Field
    ): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: AccumulationLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type CommitmentLeaf = Field;
class CommitmentWitnesses extends StaticArray(
    CommitmentWitness,
    ENCRYPTION_LIMITS.DIMENSION
) {}
class CommitmentStorage extends GenericStorage<CommitmentLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: CommitmentLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(COMMITMENT_TREE, COMMITMENT_WITNESS, undefined, undefined, leafs);
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

    getWitness(level1Index: Field): CommitmentWitness {
        return super.getWitness(level1Index) as CommitmentWitness;
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
