import {
    OneLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { Field, Poseidon, PublicKey, UInt32 } from 'o1js';
import { calculateTaskReference } from '../../libs/Requester.js';
import {
    EmptyPlainMT,
    EmptyRequestMT,
    NewPlainWitness,
    NewRequestWitness,
    PlainWitness,
    RequestWitness,
} from '../../merklized.js';

export {
    RequestInfoLeaf,
    RequestInfoStorage,
    TaskRefLeaf,
    TaskRefStorage,
    VectorEncryptionLeaf,
    VectorEncryptionStorage,
    ResultLeaf,
    ResultStorage,
    IndexCounterLeaf,
    IndexCounterStorage,
};

type RequestInfoLeaf = {
    committeeId: Field;
    keyId: Field;
    deadline: UInt32;
    dimension: Field;
};

class RequestInfoStorage extends OneLevelStorage<
    RequestInfoLeaf,
    typeof RequestWitness
> {
    static readonly height = RequestWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RequestInfoLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyRequestMT, NewRequestWitness, leafs);
    }

    get height(): number {
        return RequestInfoStorage.height;
    }

    static calculateLeaf(rawLeaf: RequestInfoLeaf): Field {
        return Poseidon.hash([
            rawLeaf.committeeId,
            rawLeaf.keyId,
            rawLeaf.deadline.value,
            rawLeaf.dimension,
        ]);
    }

    calculateLeaf(rawLeaf: RequestInfoLeaf): Field {
        return RequestInfoStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return RequestInfoStorage.calculateLevel1Index(requestId);
    }
}

type TaskRefLeaf = {
    requester: PublicKey;
    taskId: Field;
};
class TaskRefStorage extends OneLevelStorage<
    TaskRefLeaf,
    typeof RequestWitness
> {
    static readonly height = RequestWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: TaskRefLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyRequestMT, NewRequestWitness, leafs);
    }

    get height(): number {
        return TaskRefStorage.height;
    }

    static calculateLeaf(rawLeaf: TaskRefLeaf): Field {
        return calculateTaskReference(rawLeaf.requester, rawLeaf.taskId);
    }

    calculateLeaf(rawLeaf: TaskRefLeaf): Field {
        return TaskRefStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return TaskRefStorage.calculateLevel1Index(requestId);
    }
}

type VectorEncryptionLeaf = Field;
class VectorEncryptionStorage extends OneLevelStorage<
    VectorEncryptionLeaf,
    typeof RequestWitness
> {
    static readonly height = RequestWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: VectorEncryptionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyRequestMT, NewRequestWitness, leafs);
    }

    get height(): number {
        return VectorEncryptionStorage.height;
    }

    static calculateLeaf(rawLeaf: VectorEncryptionLeaf): Field {
        return rawLeaf;
    }

    calculateLeaf(rawLeaf: VectorEncryptionLeaf): Field {
        return VectorEncryptionStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return VectorEncryptionStorage.calculateLevel1Index(requestId);
    }
}

type ResultLeaf = Field;
class ResultStorage extends TwoLevelStorage<
    ResultLeaf,
    typeof RequestWitness,
    typeof PlainWitness
> {
    static readonly height1 = RequestWitness.height;
    static readonly height2 = PlainWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: ResultLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            EmptyRequestMT,
            NewRequestWitness,
            EmptyPlainMT,
            NewPlainWitness,
            leafs
        );
    }

    get height1(): number {
        return ResultStorage.height1;
    }

    get height2(): number {
        return ResultStorage.height2;
    }

    static calculateLeaf(rawLeaf: ResultLeaf): Field {
        return rawLeaf;
    }

    calculateLeaf(rawLeaf: ResultLeaf): Field {
        return ResultStorage.calculateLeaf(rawLeaf);
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
}

type IndexCounterLeaf = Field;
class IndexCounterStorage extends OneLevelStorage<
    IndexCounterLeaf,
    typeof RequestWitness
> {
    static readonly height = RequestWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: IndexCounterLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyRequestMT, NewRequestWitness, leafs);
    }

    get height(): number {
        return IndexCounterStorage.height;
    }

    static calculateLeaf(rawLeaf: IndexCounterLeaf): Field {
        return rawLeaf;
    }

    calculateLeaf(rawLeaf: IndexCounterLeaf): Field {
        return IndexCounterStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return IndexCounterStorage.calculateLevel1Index(requestId);
    }
}
