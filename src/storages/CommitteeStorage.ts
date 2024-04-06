import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
} from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage, Witness } from './GenericStorage.js';

export {
    EMPTY_LEVEL_1_TREE as COMMITTEE_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE as COMMITTEE_LEVEL_2_TREE,
    Level1MT as CommitteeLevel1MT,
    Level1Witness as CommitteeLevel1Witness,
    Level2MT as CommitteeLevel2MT,
    Level2Witness as CommitteeLevel2Witness,
    FullMTWitness as CommitteeWitness,
};

export {
    MemberLeaf,
    MemberStorage,
    SettingLeaf,
    SettingStorage,
    KeyCounterLeaf,
    KeyCounterStorage,
};

const LEVEL1_TREE_HEIGHT = Math.ceil(Math.log2(INSTANCE_LIMITS.COMMITTEE)) + 1;
const LEVEL2_TREE_HEIGHT = Math.ceil(Math.log2(INSTANCE_LIMITS.MEMBER)) + 1;
class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
class Level2MT extends MerkleTree {}
class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
class FullMTWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}
const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);
const LEVEL_1_WITNESS = (witness: Witness) => new Level1Witness(witness);
const EMPTY_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);
const LEVEL_2_WITNESS = (witness: Witness) => new Level2Witness(witness);

type MemberLeaf = PublicKey;
class MemberStorage extends GenericStorage<MemberLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: MemberLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            EMPTY_LEVEL_1_TREE,
            LEVEL_1_WITNESS,
            EMPTY_LEVEL_2_TREE,
            LEVEL_2_WITNESS,
            leafs
        );
    }

    static calculateLeaf(publicKey: MemberLeaf): Field {
        return Poseidon.hash(publicKey.toFields());
    }

    calculateLeaf(publicKey: MemberLeaf): Field {
        return MemberStorage.calculateLeaf(publicKey);
    }

    static calculateLevel1Index(committeeId: Field): Field {
        return committeeId;
    }

    calculateLevel1Index(committeeId: Field): Field {
        return MemberStorage.calculateLevel1Index(committeeId);
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return MemberStorage.calculateLevel2Index(memberId);
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
        rawLeaf: MemberLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type SettingLeaf = {
    T: Field;
    N: Field;
};
class SettingStorage extends GenericStorage<SettingLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: SettingLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, LEVEL_1_WITNESS, undefined, undefined, leafs);
    }

    static calculateLeaf(rawLeaf: SettingLeaf): Field {
        return Poseidon.hash([rawLeaf.T, rawLeaf.N]);
    }

    calculateLeaf(rawLeaf: SettingLeaf): Field {
        return SettingStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(committeeId: Field): Field {
        return committeeId;
    }

    calculateLevel1Index(committeeId: Field): Field {
        return SettingStorage.calculateLevel1Index(committeeId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: SettingLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type KeyCounterLeaf = Field;
class KeyCounterStorage extends GenericStorage<KeyCounterLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyCounterLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EMPTY_LEVEL_1_TREE, LEVEL_1_WITNESS, undefined, undefined, leafs);
    }

    static calculateLeaf(nextKeyId: KeyCounterLeaf): Field {
        return nextKeyId;
    }

    calculateLeaf(nextKeyId: KeyCounterLeaf): Field {
        return KeyCounterStorage.calculateLeaf(nextKeyId);
    }

    static calculateLevel1Index(committeeId: Field): Field {
        return committeeId;
    }

    calculateLevel1Index(committeeId: Field): Field {
        return KeyCounterStorage.calculateLevel1Index(committeeId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: KeyCounterLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}
