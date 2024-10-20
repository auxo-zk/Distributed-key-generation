import { Field, Poseidon } from 'o1js';
import {
    ThreeLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { Cipher, ThresholdGroupArray } from '../../libs/types.js';
import {
    EmptyKeyMT,
    EmptyMemberMT,
    KeyWitness,
    MemberWitness,
    NewKeyWitness,
    NewMemberWitness,
} from '../../merklized.js';
import { calculateKeyIndex } from '../key/index.js';

export {
    PolynomialCommitmentLeaf,
    PolynomialCommitmentStorage,
    EncryptionLeaf,
    EncryptionStorage,
    ShareCommitmentLeaf,
    ShareCommitmentStorage,
};

type PolynomialCommitmentLeaf = ThresholdGroupArray;
class PolynomialCommitmentStorage extends TwoLevelStorage<
    PolynomialCommitmentLeaf,
    typeof KeyWitness,
    typeof MemberWitness
> {
    static readonly height1 = KeyWitness.height;
    static readonly height2 = MemberWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: PolynomialCommitmentLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            EmptyKeyMT,
            NewKeyWitness,
            EmptyMemberMT,
            NewMemberWitness,
            leafs
        );
    }

    get height1(): number {
        return PolynomialCommitmentStorage.height1;
    }

    get height2(): number {
        return PolynomialCommitmentStorage.height2;
    }

    static calculateLeaf(commitment: PolynomialCommitmentLeaf): Field {
        return commitment.hash();
    }

    calculateLeaf(commitment: PolynomialCommitmentLeaf): Field {
        return PolynomialCommitmentStorage.calculateLeaf(commitment);
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
        return PolynomialCommitmentStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return PolynomialCommitmentStorage.calculateLevel2Index(memberId);
    }
}

type EncryptionLeaf = Cipher;
class EncryptionStorage extends ThreeLevelStorage<
    EncryptionLeaf,
    typeof KeyWitness,
    typeof MemberWitness,
    typeof MemberWitness
> {
    static readonly height1 = KeyWitness.height;
    static readonly height2 = MemberWitness.height;
    static readonly height3 = MemberWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            level3Index: Field;
            leaf: EncryptionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            EmptyKeyMT,
            NewKeyWitness,
            EmptyMemberMT,
            NewMemberWitness,
            EmptyMemberMT,
            NewMemberWitness,
            leafs
        );
    }

    get height1(): number {
        return EncryptionStorage.height1;
    }

    get height2(): number {
        return EncryptionStorage.height2;
    }

    get height3(): number {
        return EncryptionStorage.height3;
    }

    static calculateLeaf(encryption: EncryptionLeaf): Field {
        return Poseidon.hash(
            [encryption.c.toFields(), encryption.U.toFields()].flat()
        );
    }

    calculateLeaf(encryption: EncryptionLeaf): Field {
        return EncryptionStorage.calculateLeaf(encryption);
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
        return EncryptionStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return EncryptionStorage.calculateLevel2Index(memberId);
    }

    static calculateLevel3Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel3Index(memberId: Field): Field {
        return EncryptionStorage.calculateLevel3Index(memberId);
    }
}

type ShareCommitmentLeaf = Field;
class ShareCommitmentStorage extends TwoLevelStorage<
    ShareCommitmentLeaf,
    typeof KeyWitness,
    typeof MemberWitness
> {
    static readonly height1 = KeyWitness.height;
    static readonly height2 = MemberWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: ShareCommitmentLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            EmptyKeyMT,
            NewKeyWitness,
            EmptyMemberMT,
            NewMemberWitness,
            leafs
        );
    }

    get height1(): number {
        return ShareCommitmentStorage.height1;
    }

    get height2(): number {
        return ShareCommitmentStorage.height2;
    }

    static calculateLeaf(commitment: ShareCommitmentLeaf): Field {
        return commitment;
    }

    calculateLeaf(commitment: ShareCommitmentLeaf): Field {
        return ShareCommitmentStorage.calculateLeaf(commitment);
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
        return ShareCommitmentStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return ShareCommitmentStorage.calculateLevel2Index(memberId);
    }
}
