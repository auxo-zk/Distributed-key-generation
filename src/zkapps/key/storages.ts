import { Field, Group, Poseidon } from 'o1js';
import { OneLevelStorage } from '@auxo-dev/zkapp-offchain-storage';
import { INST_LIMITS } from '../../constants.js';
import {
    CommitteeWitness,
    EmptyCommitteeMT,
    EmptyKeyMT,
    KeyWitness,
    NewCommitteeWitness,
    NewKeyWitness,
} from '../../merklized.js';

export {
    calculateKeyIndex,
    KeyCounterLeaf,
    KeyCounterStorage,
    KeyStatusLeaf,
    KeyStatusStorage,
    KeyLeaf,
    KeyStorage,
    KeyFeeLeaf,
    KeeFeeStorage,
};

function calculateKeyIndex(committeeId: Field, keyId: Field): Field {
    return Field.from(INST_LIMITS.KEY).mul(committeeId).add(keyId);
}

type KeyCounterLeaf = Field;
class KeyCounterStorage extends OneLevelStorage<
    KeyCounterLeaf,
    typeof CommitteeWitness
> {
    static readonly height = CommitteeWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyCounterLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyCommitteeMT, NewCommitteeWitness, leafs);
    }

    get height(): number {
        return KeyCounterStorage.height;
    }

    static calculateLeaf(counter: KeyCounterLeaf): Field {
        return counter;
    }

    calculateLeaf(counter: KeyCounterLeaf): Field {
        return KeyCounterStorage.calculateLeaf(counter);
    }

    static calculateLevel1Index(committeeId: Field): Field {
        return committeeId;
    }

    calculateLevel1Index(committeeId: Field): Field {
        return KeyCounterStorage.calculateLevel1Index(committeeId);
    }
}

type KeyStatusLeaf = Field;
class KeyStatusStorage extends OneLevelStorage<
    KeyStatusLeaf,
    typeof KeyWitness
> {
    static readonly height = KeyWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyStatusLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyKeyMT, NewKeyWitness, leafs);
    }

    get height(): number {
        return KeyStatusStorage.height;
    }

    static calculateLeaf(status: KeyStatusLeaf): Field {
        return status;
    }

    calculateLeaf(status: KeyStatusLeaf): Field {
        return KeyStatusStorage.calculateLeaf(status);
    }

    static calculateLevel1Index({
        committeeId,
        keyId,
    }: {
        committeeId: Field;
        keyId: Field;
    }): Field {
        return calculateKeyIndex(committeeId, keyId);
    }

    calculateLevel1Index({
        committeeId,
        keyId,
    }: {
        committeeId: Field;
        keyId: Field;
    }): Field {
        return KeyStatusStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }
}

type KeyLeaf = Group;
class KeyStorage extends OneLevelStorage<KeyLeaf, typeof KeyWitness> {
    static readonly height = KeyWitness.height;
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyKeyMT, NewKeyWitness, leafs);
    }

    get height(): number {
        return KeyStorage.height;
    }

    static calculateLeaf(key: KeyLeaf): Field {
        return Poseidon.hash(key.toFields());
    }

    calculateLeaf(key: KeyLeaf): Field {
        return KeyStorage.calculateLeaf(key);
    }

    static calculateLevel1Index({
        committeeId,
        keyId,
    }: {
        committeeId: Field;
        keyId: Field;
    }): Field {
        return calculateKeyIndex(committeeId, keyId);
    }

    calculateLevel1Index({
        committeeId,
        keyId,
    }: {
        committeeId: Field;
        keyId: Field;
    }): Field {
        return KeyStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }
}

type KeyFeeLeaf = Field;
class KeeFeeStorage extends OneLevelStorage<KeyFeeLeaf, typeof KeyWitness> {
    static readonly height = KeyWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyFeeLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyKeyMT, NewKeyWitness, leafs);
    }

    get height(): number {
        return KeeFeeStorage.height;
    }

    static calculateLeaf(fee: KeyFeeLeaf): Field {
        return fee;
    }

    calculateLeaf(fee: KeyFeeLeaf): Field {
        return KeeFeeStorage.calculateLeaf(fee);
    }

    static calculateLevel1Index({
        committeeId,
        keyId,
    }: {
        committeeId: Field;
        keyId: Field;
    }): Field {
        return calculateKeyIndex(committeeId, keyId);
    }

    calculateLevel1Index({
        committeeId,
        keyId,
    }: {
        committeeId: Field;
        keyId: Field;
    }): Field {
        return KeeFeeStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }
}
