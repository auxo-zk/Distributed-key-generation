import { Field, Poseidon, Struct, UInt32, UInt64 } from 'o1js';
import { StaticArray } from '@auxo-dev/auxo-libs';
import {
    getBestHeight,
    OneLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { ENC_LIMITS, INSTANCE_LIMITS } from '../constants.js';

export {
    EmptyMTL1 as REQUESTER_LEVEL_1_TREE,
    EmptyMTCom as COMMITMENT_TREE,
    MTWitnessL1 as RequesterLevel1Witness,
    MTWitnessCom as CommitmentWitness,
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

const [MTWitnessL1, NewMTWitnessL1, EmptyMTL1] = getBestHeight(
    BigInt(INSTANCE_LIMITS.REQUEST)
);
const [MTWitnessCom, NewMTWitnessCom, EmptyMTCom] = getBestHeight(
    BigInt(INSTANCE_LIMITS.REQUEST * ENC_LIMITS.DIMENSION)
);

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
    typeof MTWitnessL1
> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyIndexLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
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

type TimestampLeaf = UInt64;
class TimestampStorage extends OneLevelStorage<
    TimestampLeaf,
    typeof MTWitnessL1
> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: TimestampLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
    }

    get height(): number {
        return TimestampStorage.height;
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
}

type AccumulationLeaf = {
    accumulationRootR: Field;
    accumulationRootM: Field;
};
class AccumulationStorage extends OneLevelStorage<
    AccumulationLeaf,
    typeof MTWitnessL1
> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: AccumulationLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
    }

    get height(): number {
        return AccumulationStorage.height;
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
}

type CommitmentLeaf = Field;
class CommitmentWitnesses extends StaticArray<typeof MTWitnessCom>(
    MTWitnessCom,
    ENC_LIMITS.DIMENSION
) {}
class CommitmentStorage extends OneLevelStorage<
    CommitmentLeaf,
    typeof MTWitnessCom
> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: CommitmentLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTCom, NewMTWitnessCom, leafs);
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
