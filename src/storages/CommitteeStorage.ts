import { Bool, Field, Poseidon, PublicKey, Struct } from 'o1js';
import {
    getBestHeight,
    OneLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { INSTANCE_LIMITS } from '../constants.js';

export {
    EmptyMTL1 as COMMITTEE_LEVEL_1_TREE,
    EmptyMTL2 as COMMITTEE_LEVEL_2_TREE,
    MTWitnessL1 as CommitteeLevel1Witness,
    MTWitnessL2 as CommitteeLevel2Witness,
    FullMTWitness as CommitteeWitness,
    MemberLeaf,
    MemberStorage,
    SettingLeaf,
    SettingStorage,
};

const [MTWitnessL1, NewMTWitnessL1, EmptyMTL1] = getBestHeight(
    BigInt(INSTANCE_LIMITS.COMMITTEE)
);
const [MTWitnessL2, NewMTWitnessL2, EmptyMTL2] = getBestHeight(
    BigInt(INSTANCE_LIMITS.MEMBER)
);
class FullMTWitness extends Struct({
    level1: MTWitnessL1,
    level2: MTWitnessL2,
}) {}

type MemberLeaf = { pubKey: PublicKey; active: Bool };
class MemberStorage extends TwoLevelStorage<
    MemberLeaf,
    typeof MTWitnessL1,
    typeof MTWitnessL2
> {
    static readonly height1 = MTWitnessL1.height;
    static readonly height2 = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: MemberLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height1(): number {
        return MemberStorage.height1;
    }

    get height2(): number {
        return MemberStorage.height2;
    }

    static calculateLeaf(rawLeaf: MemberLeaf): Field {
        return Poseidon.hash(
            [rawLeaf.pubKey.toFields(), rawLeaf.active.toField()].flat()
        );
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
}

type SettingLeaf = { T: Field; N: Field };
class SettingStorage extends OneLevelStorage<SettingLeaf, typeof MTWitnessL1> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: SettingLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
    }

    get height(): number {
        return SettingStorage.height;
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
}
