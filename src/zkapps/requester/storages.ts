import { Field, Group, Poseidon, Struct, UInt32, UInt64 } from 'o1js';
import {
    OneLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import {
    CommitmentWitness,
    EmptyCommitmentMT,
    EmptyCipherMT,
    EmptyTaskMT,
    NewCommitmentWitness,
    NewCipherWitness,
    NewTaskWitness,
    CipherWitness,
    TaskWitness,
} from '../../merklized.js';
import { EncryptionConfig } from '../../libs/types.js';

export {
    RequesterCounters,
    InfoLeaf,
    InfoStorage,
    AccumulationLeaf,
    AccumulationStorage,
    CommitmentLeaf,
    CommitmentStorage,
};

class RequesterCounters extends Struct({
    lastBlocknumber: UInt32,
    taskCounter: UInt32,
    commitmentCounter: UInt64,
}) {
    static fromFields(fields: Field[]): RequesterCounters {
        return new RequesterCounters({
            lastBlocknumber: UInt32.fromFields([
                Field.fromBits(fields[0].toBits().slice(0, 32)),
            ]),
            taskCounter: UInt32.fromFields([
                Field.fromBits(fields[0].toBits().slice(32, 64)),
            ]),
            commitmentCounter: UInt64.fromFields([
                Field.fromBits(fields[0].toBits().slice(64, 128)),
            ]),
        });
    }

    static toFields({
        lastBlocknumber,
        taskCounter,
        commitmentCounter,
    }: {
        lastBlocknumber: UInt32;
        taskCounter: UInt32;
        commitmentCounter: UInt64;
    }): Field[] {
        return [
            Field.fromBits([
                ...lastBlocknumber.value.toBits(32),
                ...taskCounter.value.toBits(32),
                ...commitmentCounter.value.toBits(64),
            ]),
        ];
    }

    static hash({
        lastBlocknumber,
        taskCounter,
        commitmentCounter,
    }: {
        lastBlocknumber: UInt32;
        taskCounter: UInt32;
        commitmentCounter: UInt64;
    }): Field {
        return Poseidon.hash([
            lastBlocknumber.value,
            taskCounter.value,
            commitmentCounter.value,
        ]);
    }

    static empty(): RequesterCounters {
        return new RequesterCounters({
            lastBlocknumber: UInt32.zero,
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

type InfoLeaf = {
    committeeId: Field;
    keyId: Field;
    deadline: UInt32;
    config: EncryptionConfig;
};
class InfoStorage extends OneLevelStorage<InfoLeaf, typeof TaskWitness> {
    static readonly height = TaskWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: InfoLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyTaskMT, NewTaskWitness, leafs);
    }

    get height(): number {
        return InfoStorage.height;
    }

    static calculateLeaf(info: InfoLeaf): Field {
        return Poseidon.hash([
            info.committeeId,
            info.keyId,
            info.deadline.value,
            info.config.hash(),
        ]);
    }

    calculateLeaf(info: InfoLeaf): Field {
        return InfoStorage.calculateLeaf(info);
    }

    static calculateLevel1Index(taskId: Field): Field {
        return taskId;
    }

    calculateLevel1Index(taskId: Field): Field {
        return InfoStorage.calculateLevel1Index(taskId);
    }
}

type AccumulationLeaf = Group;
class AccumulationStorage extends TwoLevelStorage<
    AccumulationLeaf,
    typeof TaskWitness,
    typeof CipherWitness
> {
    static readonly height1 = TaskWitness.height;
    static readonly height2 = CipherWitness.height;

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
            EmptyCipherMT,
            NewCipherWitness,
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
        return Poseidon.hash(rawLeaf.toFields());
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
