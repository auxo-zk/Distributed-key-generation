import {
    Field,
    Group,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Scalar,
    Struct,
    UInt32,
    UInt64,
} from 'o1js';
import { CustomScalar, StaticArray } from '@auxo-dev/auxo-libs';
import { ENCRYPTION_LIMITS, INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage } from './GenericStorage.js';

export {
    EMPTY_LEVEL_1_TREE as REQUEST_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE as REQUEST_LEVEL_2_TREE,
    Level1MT as RequestLevel1MT,
    Level1Witness as RequestLevel1Witness,
    Level2MT as RequestLevel2MT,
    Level2Witness as RequestLevel2Witness,
    FullMTWitness as RequestWitness,
};

export {
    KeyIndexLeaf as RequestKeyIndexLeaf,
    KeyIndexStorage as RequestKeyIndexStorage,
    TaskIdLeaf,
    TaskIdStorage,
    AccumulationLeaf as RequestAccumulationLeaf,
    AccumulationStorage as RequestAccumulationStorage,
    ExpirationLeaf,
    ExpirationStorage,
    ResultLeaf,
    ResultStorage,
    GroupVectorLeaf,
    GroupVectorStorage,
    GroupVectorWitnesses,
    ScalarVectorLeaf,
    ScalarVectorStorage,
    ScalarVectorWitnesses,
};

const LEVEL1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.REQUEST * INSTANCE_LIMITS.REQUESTER)) +
    1;
const LEVEL2_TREE_HEIGHT =
    Math.ceil(Math.log2(ENCRYPTION_LIMITS.FULL_DIMENSION)) + 1;
class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
class Level2MT extends MerkleTree {}
class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
class FullMTWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}
const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);
const EMPTY_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);

type KeyIndexLeaf = Field;
class KeyIndexStorage extends GenericStorage<
    KeyIndexLeaf,
    Level1MT,
    Level1Witness,
    undefined,
    undefined
> {
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

type TaskIdLeaf = {
    requester: PublicKey;
    taskId: UInt32;
};
class TaskIdStorage extends GenericStorage<
    TaskIdLeaf,
    Level1MT,
    Level1Witness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: TaskIdLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
    }

    static calculateLeaf(rawLeaf: TaskIdLeaf): Field {
        return Poseidon.hash(
            [rawLeaf.requester.toFields(), rawLeaf.taskId.value].flat()
        );
    }

    calculateLeaf(rawLeaf: TaskIdLeaf): Field {
        return TaskIdStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return TaskIdStorage.calculateLevel1Index(requestId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: TaskIdLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type ExpirationLeaf = UInt64;
class ExpirationStorage extends GenericStorage<
    ExpirationLeaf,
    Level1MT,
    Level1Witness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ExpirationLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
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

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: ExpirationLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type ResultLeaf = Field;
class ResultStorage extends GenericStorage<
    ResultLeaf,
    Level1MT,
    Level1Witness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ResultLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, undefined, leafs);
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

    static calculateLevel2Index(dimensionIndex: Field): Field {
        return dimensionIndex;
    }

    calculateLevel2Index(dimensionIndex: Field): Field {
        return ResultStorage.calculateLevel2Index(dimensionIndex);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: ResultLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type AccumulationLeaf = {
    accumulationRootR: Field;
    accumulationRootM: Field;
    dimension: UInt32;
};

class AccumulationStorage extends GenericStorage<
    AccumulationLeaf,
    Level1MT,
    Level1Witness,
    undefined,
    undefined
> {
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

type GroupVectorLeaf = Group;
class GroupVectorWitnesses extends StaticArray(
    Level2Witness,
    ENCRYPTION_LIMITS.DIMENSION
) {}
class GroupVectorStorage extends GenericStorage<
    GroupVectorLeaf,
    Level2MT,
    Level2Witness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: GroupVectorLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_2_TREE, undefined, leafs);
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

    getWitness(level1Index: Field): Level2Witness {
        return super.getWitness(level1Index) as Level2Witness;
    }

    updateLeafWithR(
        { level1Index }: { level1Index: Field },
        leaf: Field
    ): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: GroupVectorLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type ScalarVectorLeaf = Scalar;
class ScalarVectorWitnesses extends StaticArray(
    Level2Witness,
    ENCRYPTION_LIMITS.DIMENSION
) {}
class ScalarVectorStorage extends GenericStorage<
    ScalarVectorLeaf,
    Level2MT,
    Level2Witness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: ScalarVectorLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_2_TREE, undefined, leafs);
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

    getWitness(level1Index: Field): Level2Witness {
        return super.getWitness(level1Index) as Level2Witness;
    }

    updateLeafWithR(
        { level1Index }: { level1Index: Field },
        leaf: Field
    ): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: ScalarVectorLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}
