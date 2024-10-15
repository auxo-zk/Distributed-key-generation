import {
    Field,
    Group,
    Poseidon,
    PublicKey,
    Scalar,
    Struct,
    UInt32,
    UInt64,
} from 'o1js';
import { CustomScalar, StaticArray } from '@auxo-dev/auxo-libs';
import { ENC_LIMITS, INST_LIMITS } from '../constants.js';
import {
    getBestHeight,
    OneLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';

export {
    EmptyMTL1 as REQUEST_LEVEL_1_TREE,
    EmptyMTL2 as REQUEST_LEVEL_2_TREE,
    MTWitnessL1 as RequestLevel1Witness,
    MTWitnessL2 as RequestLevel2Witness,
    FullMTWitness as RequestWitness,
};

export {
    KeyIndexLeaf as RequestKeyIndexLeaf,
    KeyIndexStorage as RequestKeyIndexStorage,
    TaskLeaf,
    TaskStorage,
    AccumulationLeaf as RequestAccumulationLeaf,
    AccumulationStorage as RequestAccumulationStorage,
    ExpirationLeaf,
    ExpirationStorage,
    ResultLeaf,
    ResultStorage,
    GroupVector,
    GroupVectorLeaf,
    GroupVectorStorage,
    GroupVectorWitnesses,
    ScalarVectorLeaf,
    ScalarVectorStorage,
    ScalarVectorWitnesses,
};

const [MTWitnessL1, NewMTWitnessL1, EmptyMTL1] = getBestHeight(
    BigInt(INST_LIMITS.REQUEST * INST_LIMITS.REQUESTER)
);
const [MTWitnessL2, NewMTWitnessL2, EmptyMTL2] = getBestHeight(
    BigInt(ENC_LIMITS.DIMENSION)
);
class FullMTWitness extends Struct({
    level1: MTWitnessL1,
    level2: MTWitnessL2,
}) {}

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

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return KeyIndexStorage.calculateLevel1Index(requestId);
    }
}

type TaskLeaf = {
    requester: PublicKey;
    taskId: UInt32;
};
class TaskStorage extends OneLevelStorage<TaskLeaf, typeof MTWitnessL1> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: TaskLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
    }

    get height(): number {
        return TaskStorage.height;
    }

    static calculateLeaf(rawLeaf: TaskLeaf): Field {
        return Poseidon.hash(
            [rawLeaf.requester.toFields(), rawLeaf.taskId.value].flat()
        );
    }

    calculateLeaf(rawLeaf: TaskLeaf): Field {
        return TaskStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return TaskStorage.calculateLevel1Index(requestId);
    }
}

type ExpirationLeaf = UInt64;
class ExpirationStorage extends OneLevelStorage<
    ExpirationLeaf,
    typeof MTWitnessL1
> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ExpirationLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
    }

    get height(): number {
        return ExpirationStorage.height;
    }

    static calculateLeaf(timestamp: ExpirationLeaf): Field {
        return timestamp.value;
    }

    calculateLeaf(timestamp: ExpirationLeaf): Field {
        return ExpirationStorage.calculateLeaf(timestamp);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return ExpirationStorage.calculateLevel1Index(requestId);
    }
}

type ResultLeaf = Field;
class ResultStorage extends OneLevelStorage<ResultLeaf, typeof MTWitnessL1> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ResultLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
    }

    get height(): number {
        return ResultStorage.height;
    }

    static calculateLeaf(resultRoot: ResultLeaf): Field {
        return resultRoot;
    }

    calculateLeaf(resultRoot: ResultLeaf): Field {
        return ResultStorage.calculateLeaf(resultRoot);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return ResultStorage.calculateLevel1Index(requestId);
    }
}

type AccumulationLeaf = {
    accumulationRootR: Field;
    accumulationRootM: Field;
    dimension: UInt32;
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
            rawLeaf.dimension.value,
        ]);
    }

    calculateLeaf(rawLeaf: AccumulationLeaf): Field {
        return AccumulationStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return AccumulationStorage.calculateLevel1Index(requestId);
    }
}

type GroupVectorLeaf = Group;
class GroupVector extends StaticArray(Group, ENC_LIMITS.DIMENSION) {}
class GroupVectorWitnesses extends StaticArray<typeof MTWitnessL2>(
    MTWitnessL2,
    ENC_LIMITS.DIMENSION
) {}
class GroupVectorStorage extends OneLevelStorage<
    GroupVectorLeaf,
    typeof MTWitnessL2
> {
    static readonly height = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: GroupVectorLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height(): number {
        return GroupVectorStorage.height;
    }

    static calculateLeaf(point: GroupVectorLeaf): Field {
        return Poseidon.hash(point.toFields());
    }

    calculateLeaf(point: GroupVectorLeaf): Field {
        return GroupVectorStorage.calculateLeaf(point);
    }

    static calculateLevel1Index(dimensionIndex: Field): Field {
        return dimensionIndex;
    }

    calculateLevel1Index(dimensionIndex: Field): Field {
        return GroupVectorStorage.calculateLevel1Index(dimensionIndex);
    }
}

type ScalarVectorLeaf = Scalar;
class ScalarVectorWitnesses extends StaticArray<typeof MTWitnessL2>(
    MTWitnessL2,
    ENC_LIMITS.DIMENSION
) {}
class ScalarVectorStorage extends OneLevelStorage<
    ScalarVectorLeaf,
    typeof MTWitnessL2
> {
    static readonly height = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ScalarVectorLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height(): number {
        return ScalarVectorStorage.height;
    }

    static calculateLeaf(value: ScalarVectorLeaf): Field {
        return Poseidon.hash(CustomScalar.fromScalar(value).toFields());
    }

    calculateLeaf(value: ScalarVectorLeaf): Field {
        return ScalarVectorStorage.calculateLeaf(value);
    }

    static calculateLevel1Index(dimensionIndex: Field): Field {
        return dimensionIndex;
    }

    calculateLevel1Index(dimensionIndex: Field): Field {
        return ScalarVectorStorage.calculateLevel1Index(dimensionIndex);
    }
}
