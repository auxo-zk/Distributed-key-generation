import { Field, Group, Poseidon, Struct, UInt32, UInt64 } from 'o1js';
import { StaticArray } from '@auxo-dev/auxo-libs';
import {
    OneLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { ENC_LIMITS } from '../constants.js';
import {
    CommitmentWitness,
    EmptyCommitmentMT,
    EmptySplitMT,
    EmptyTaskMT,
    NewCommitmentWitness,
    NewSplitWitness,
    NewTaskWitness,
    SplitWitness,
    TaskWitness,
} from './Merklized.js';

export {
    RequesterCounters,
    KeyIndexLeaf as RequesterKeyIndexLeaf,
    KeyIndexStorage as RequesterKeyIndexStorage,
    BlocknumberLeaf,
    BlocknumberStorage,
    AccumulationLeaf as RequesterAccumulationLeaf,
    AccumulationStorage as RequesterAccumulationStorage,
    CommitmentLeaf,
    CommitmentStorage,
    CommitmentWitnesses,
};

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
class KeyIndexStorage extends OneLevelStorage<
    KeyIndexLeaf,
    typeof TaskWitness
> {
    static readonly height = TaskWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyIndexLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyTaskMT, NewTaskWitness, leafs);
    }

    get height(): number {
        return KeyIndexStorage.height;
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
}

type BlocknumberLeaf = UInt32;
class BlocknumberStorage extends OneLevelStorage<
    BlocknumberLeaf,
    typeof TaskWitness
> {
    static readonly height = TaskWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: BlocknumberLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyTaskMT, NewTaskWitness, leafs);
    }

    get height(): number {
        return BlocknumberStorage.height;
    }

    static calculateLeaf(timestamp: BlocknumberLeaf): Field {
        return timestamp.value;
    }

    calculateLeaf(timestamp: BlocknumberLeaf): Field {
        return BlocknumberStorage.calculateLeaf(timestamp);
    }

    static calculateLevel1Index(taskId: Field): Field {
        return taskId;
    }

    calculateLevel1Index(taskId: Field): Field {
        return BlocknumberStorage.calculateLevel1Index(taskId);
    }
}

type AccumulationLeaf = {
    R: Group;
    M: Group;
};
class AccumulationStorage extends TwoLevelStorage<
    AccumulationLeaf,
    typeof TaskWitness,
    typeof SplitWitness
> {
    static readonly height1 = TaskWitness.height;
    static readonly height2 = SplitWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: AccumulationLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            EmptyTaskMT,
            NewTaskWitness,
            EmptySplitMT,
            NewSplitWitness,
            leafs
        );
    }

    get height1(): number {
        return AccumulationStorage.height1;
    }

    get height2(): number {
        return AccumulationStorage.height2;
    }

    static calculateLeaf(rawLeaf: AccumulationLeaf): Field {
        return Poseidon.hash(
            [rawLeaf.R.toFields(), rawLeaf.M.toFields()].flat()
        );
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

    static calculateLevel2Index(splitId: Field): Field {
        return splitId;
    }

    calculateLevel2Index(splitId: Field): Field {
        return AccumulationStorage.calculateLevel2Index(splitId);
    }
}

type CommitmentLeaf = Field;
class CommitmentWitnesses extends StaticArray(
    CommitmentWitness,
    ENC_LIMITS.DIMENSION
) {}
class CommitmentStorage extends OneLevelStorage<
    CommitmentLeaf,
    typeof CommitmentWitness
> {
    static readonly height = CommitmentWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: CommitmentLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyCommitmentMT, NewCommitmentWitness, leafs);
    }

    get height(): number {
        return CommitmentStorage.height;
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
}
