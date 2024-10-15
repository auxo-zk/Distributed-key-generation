import { Field, Group, Poseidon } from 'o1js';
import {
    OneLevelStorage,
    ThreeLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { INST_LIMITS } from '../constants.js';
import { Cipher, ThresholdGroupArray } from '../libs/types.js';
import {
    CommitteeWitness,
    EmptyCommitteeMT,
    EmptyKeyMT,
    EmptyMemberMT,
    KeyWitness,
    MemberWitness,
    NewCommitteeWitness,
    NewKeyWitness,
    NewMemberWitness,
} from './Merklized.js';

export { calculateKeyIndex };

export {
    KeyCounterLeaf,
    KeyCounterStorage,
    KeyStatusLeaf,
    KeyStatusStorage,
    KeyLeaf,
    KeyStorage,
    KeyFeeLeaf,
    KeeFeeStorage,
    PolynomialCommitmentLeaf,
    PolynomialCommitmentStorage,
    EncryptionLeaf,
    EncryptionStorage,
    ShareCommitmentLeaf,
    ShareCommitmentStorage,
    PublicKeyLeaf,
    PublicKeyStorage,
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

type PublicKeyLeaf = Group;
class PublicKeyStorage extends TwoLevelStorage<
    PublicKeyLeaf,
    typeof KeyWitness,
    typeof MemberWitness
> {
    static readonly height1 = KeyWitness.height;
    static readonly height2 = MemberWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: PublicKeyLeaf | Field;
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
        return PublicKeyStorage.height1;
    }

    get height2(): number {
        return PublicKeyStorage.height2;
    }

    static calculateLeaf(publicKey: PublicKeyLeaf): Field {
        return Poseidon.hash(publicKey.toFields());
    }

    calculateLeaf(publicKey: PublicKeyLeaf): Field {
        return PublicKeyStorage.calculateLeaf(publicKey);
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
        return PublicKeyStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return PublicKeyStorage.calculateLevel2Index(memberId);
    }
}

// type ResponseContributionLeaf = Field;
// class ResponseContributionWitness extends Struct({
//     level1: RequestLevel1Witness,
//     level2: MemberWitness,
// }) {}

// class ResponseContributionStorage extends TwoLevelStorage<
//     ResponseContributionLeaf,
//     typeof RequestLevel1Witness,
//     typeof MemberWitness
// > {
//     static readonly height1 = RequestLevel1Witness.height;
//     static readonly height2 = MemberWitness.height;

//     constructor(
//         leafs?: {
//             level1Index: Field;
//             level2Index: Field;
//             leaf: ResponseContributionLeaf | Field;
//             isRaw: boolean;
//         }[]
//     ) {
//         super(
//             REQUEST_LEVEL_1_TREE,
//             REQUEST_LEVEL_1_WITNESS,
//             EmptyMemberMT,
//             NewMemberWitness,
//             leafs
//         );
//     }

//     get height1(): number {
//         return ResponseContributionStorage.height1;
//     }

//     get height2(): number {
//         return ResponseContributionStorage.height2;
//     }

//     static calculateLeaf(contribution: ResponseContributionLeaf): Field {
//         return contribution;
//     }

//     calculateLeaf(contribution: ResponseContributionLeaf): Field {
//         return ResponseContributionStorage.calculateLeaf(contribution);
//     }

//     static calculateLevel1Index(requestId: Field): Field {
//         return requestId;
//     }

//     calculateLevel1Index(requestId: Field): Field {
//         return ResponseContributionStorage.calculateLevel1Index(requestId);
//     }

//     static calculateLevel2Index(memberId: Field): Field {
//         return memberId;
//     }

//     calculateLevel2Index(memberId: Field): Field {
//         return ResponseContributionStorage.calculateLevel2Index(memberId);
//     }
// }

// type ResponseLeaf = Field;
// class ResponseStorage extends OneLevelStorage<
//     ResponseLeaf,
//     typeof RequestLevel1Witness
// > {
//     static readonly height = KeyWitness.height;

//     constructor(
//         leafs?: {
//             level1Index: Field;
//             leaf: ResponseLeaf | Field;
//             isRaw: boolean;
//         }[]
//     ) {
//         super(REQUEST_LEVEL_1_TREE, REQUEST_LEVEL_1_WITNESS, leafs);
//     }

//     get height(): number {
//         return ResponseStorage.height;
//     }

//     static calculateLeaf(responseRootD: ResponseLeaf): Field {
//         return responseRootD;
//     }

//     calculateLeaf(responseRootD: ResponseLeaf): Field {
//         return ResponseStorage.calculateLeaf(responseRootD);
//     }

//     static calculateLevel1Index(requestId: Field): Field {
//         return requestId;
//     }

//     calculateLevel1Index(requestId: Field): Field {
//         return ResponseStorage.calculateLevel1Index(requestId);
//     }
// }
