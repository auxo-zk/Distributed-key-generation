import { Bool, Field, Poseidon, PublicKey } from 'o1js';
import {
    OneLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import {
    CommitteeWitness,
    EmptyCommitteeMT,
    EmptyMemberMT,
    MemberWitness,
    NewCommitteeWitness,
    NewMemberWitness,
} from '../../merklized.js';

export { MemberLeaf, MemberStorage, SettingLeaf, SettingStorage };

type MemberLeaf = { pubKey: PublicKey; active: Bool };
class MemberStorage extends TwoLevelStorage<
    MemberLeaf,
    typeof CommitteeWitness,
    typeof MemberWitness
> {
    static readonly height1 = CommitteeWitness.height;
    static readonly height2 = MemberWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: MemberLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            EmptyCommitteeMT,
            NewCommitteeWitness,
            EmptyMemberMT,
            NewMemberWitness,
            leafs
        );
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

    calculateLeaf(rawLeaf: MemberLeaf): Field {
        return MemberStorage.calculateLeaf(rawLeaf);
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
class SettingStorage extends OneLevelStorage<
    SettingLeaf,
    typeof CommitteeWitness
> {
    static readonly height = CommitteeWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: SettingLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyCommitteeMT, NewCommitteeWitness, leafs);
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
