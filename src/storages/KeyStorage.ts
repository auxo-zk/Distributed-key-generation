import { Field, Group, Poseidon, Struct } from 'o1js';
import { FieldDynamicArray } from '@auxo-dev/auxo-libs';
import {
    getBestHeight,
    OneLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { INSTANCE_LIMITS } from '../constants.js';
import { CommitteeLevel1Witness } from './CommitteeStorage.js';
import { KeyGenContribution } from '../libs/Committee.js';

export {
    calculateKeyIndex,
    EmptyMTL1 as KEY_LEVEL_1_TREE,
    EmptyMTL2 as KEY_LEVEL_2_TREE,
    MTWitnessL1 as KeyLevel1Witness,
    MTWitnessL2 as KeyLevel2Witness,
    FullMTWitness as DKGWitness,
    ProcessedContributions,
};

export {
    KeyCounterLeaf,
    KeyCounterStorage,
    KeyStatusLeaf,
    KeyStatusStorage,
    KeyLeaf,
    KeyStorage,
    KeyFeeLeaf,
    KeeFeeStorage,
    KeyGenContributionLeaf,
    KeyGenContributionStorage,
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

function calculateKeyIndex(committeeId: Field, keyId: Field): Field {
    return Field.from(INSTANCE_LIMITS.KEY).mul(committeeId).add(keyId);
}

class ProcessedContributions extends FieldDynamicArray(
    INSTANCE_LIMITS.MEMBER
) {}

type KeyCounterLeaf = Field;
class KeyCounterStorage extends OneLevelStorage<
    KeyCounterLeaf,
    typeof CommitteeLevel1Witness
> {
    static readonly height = CommitteeLevel1Witness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyCounterLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
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
    typeof MTWitnessL1
> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyStatusLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
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
class KeyStorage extends OneLevelStorage<KeyLeaf, typeof MTWitnessL1> {
    static readonly height = MTWitnessL1.height;
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
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
class KeeFeeStorage extends OneLevelStorage<KeyFeeLeaf, typeof MTWitnessL1> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyFeeLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, leafs);
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

type KeyGenContributionLeaf = KeyGenContribution;
class KeyGenContributionStorage extends TwoLevelStorage<
    KeyGenContributionLeaf,
    typeof MTWitnessL1,
    typeof MTWitnessL2
> {
    static readonly height1 = MTWitnessL1.height;
    static readonly height2 = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: KeyGenContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height1(): number {
        return KeyGenContributionStorage.height1;
    }

    get height2(): number {
        return KeyGenContributionStorage.height2;
    }

    static calculateLeaf(contribution: KeyGenContributionLeaf): Field {
        return contribution.hash();
    }

    calculateLeaf(contribution: KeyGenContributionLeaf): Field {
        return KeyGenContributionStorage.calculateLeaf(contribution);
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
        return KeyGenContributionStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return KeyGenContributionStorage.calculateLevel2Index(memberId);
    }
}

// type ResponseContributionLeaf = Field;
// class ResponseContributionWitness extends Struct({
//     level1: RequestLevel1Witness,
//     level2: MTWitnessL2,
// }) {}

// class ResponseContributionStorage extends TwoLevelStorage<
//     ResponseContributionLeaf,
//     typeof RequestLevel1Witness,
//     typeof MTWitnessL2
// > {
//     static readonly height1 = RequestLevel1Witness.height;
//     static readonly height2 = MTWitnessL2.height;

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
//             EmptyMTL2,
//             NewMTWitnessL2,
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
//     static readonly height = MTWitnessL1.height;

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
