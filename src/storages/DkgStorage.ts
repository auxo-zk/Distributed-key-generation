import { Field, Group, Poseidon, Struct } from 'o1js';
import { Bit255, FieldDynamicArray } from '@auxo-dev/auxo-libs';
import {
    getBestHeight,
    OneLevelStorage,
    TwoLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';
import { Round1Contribution, Round2Contribution } from '../libs/Committee.js';
import { INSTANCE_LIMITS } from '../constants.js';
import {
    REQUEST_LEVEL_1_TREE,
    REQUEST_LEVEL_1_WITNESS,
    RequestLevel1Witness,
} from './RequestStorage.js';

export {
    calculateKeyIndex,
    EmptyMTL1 as DKG_LEVEL_1_TREE,
    EmptyMTL2 as DKG_LEVEL_2_TREE,
    MTWitnessL1 as DkgLevel1Witness,
    MTWitnessL2 as DkgLevel2Witness,
    FullMTWitness as DKGWitness,
    ResponseContributionWitness,
    ProcessedContributions,
};

export {
    KeyStatusLeaf,
    KeyStatusStorage,
    KeyLeaf,
    KeyStorage,
    Round1ContributionLeaf,
    Round1ContributionStorage,
    PublicKeyLeaf,
    PublicKeyStorage,
    Round2ContributionLeaf,
    Round2ContributionStorage,
    EncryptionLeaf,
    EncryptionStorage,
    ResponseContributionLeaf,
    ResponseContributionStorage,
    ResponseLeaf,
    ResponseStorage,
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

type Round1ContributionLeaf = Round1Contribution;
class Round1ContributionStorage extends TwoLevelStorage<
    Round1ContributionLeaf,
    typeof MTWitnessL1,
    typeof MTWitnessL2
> {
    static readonly height1 = MTWitnessL1.height;
    static readonly height2 = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: Round1ContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height1(): number {
        return Round1ContributionStorage.height1;
    }

    get height2(): number {
        return Round1ContributionStorage.height2;
    }

    static calculateLeaf(contribution: Round1ContributionLeaf): Field {
        return contribution.hash();
    }

    calculateLeaf(contribution: Round1ContributionLeaf): Field {
        return Round1ContributionStorage.calculateLeaf(contribution);
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
        return Round1ContributionStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return Round1ContributionStorage.calculateLevel2Index(memberId);
    }
}

type PublicKeyLeaf = Group;
class PublicKeyStorage extends TwoLevelStorage<
    PublicKeyLeaf,
    typeof MTWitnessL1,
    typeof MTWitnessL2
> {
    static readonly height1 = MTWitnessL1.height;
    static readonly height2 = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: PublicKeyLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height1(): number {
        return PublicKeyStorage.height1;
    }

    get height2(): number {
        return PublicKeyStorage.height2;
    }

    static calculateLeaf(C0: PublicKeyLeaf): Field {
        return Poseidon.hash(C0.toFields());
    }

    calculateLeaf(C0: PublicKeyLeaf): Field {
        return PublicKeyStorage.calculateLeaf(C0);
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

type Round2ContributionLeaf = Round2Contribution;
class Round2ContributionStorage extends TwoLevelStorage<
    Round2ContributionLeaf,
    typeof MTWitnessL1,
    typeof MTWitnessL2
> {
    static readonly height1 = MTWitnessL1.height;
    static readonly height2 = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: Round2ContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height1(): number {
        return Round2ContributionStorage.height1;
    }

    get height2(): number {
        return Round2ContributionStorage.height2;
    }

    static calculateLeaf(contribution: Round2ContributionLeaf): Field {
        return contribution.hash();
    }

    calculateLeaf(contribution: Round2ContributionLeaf): Field {
        return Round2ContributionStorage.calculateLeaf(contribution);
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
        return Round2ContributionStorage.calculateLevel1Index({
            committeeId,
            keyId,
        });
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return Round2ContributionStorage.calculateLevel2Index(memberId);
    }
}

type EncryptionLeaf = {
    contributions: Round2Contribution[];
    memberId: Field;
};
class EncryptionStorage extends TwoLevelStorage<
    EncryptionLeaf,
    typeof MTWitnessL1,
    typeof MTWitnessL2
> {
    static readonly height1 = MTWitnessL1.height;
    static readonly height2 = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: EncryptionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMTL1, NewMTWitnessL1, EmptyMTL2, NewMTWitnessL2, leafs);
    }

    get height1(): number {
        return EncryptionStorage.height1;
    }

    get height2(): number {
        return EncryptionStorage.height2;
    }

    static calculateLeaf(rawLeaf: EncryptionLeaf): Field {
        let hashChain = Field(0);
        for (let i = 0; i < Number(rawLeaf.contributions[0].c.length); i++) {
            hashChain = Poseidon.hash(
                [
                    hashChain,
                    (
                        rawLeaf.contributions[i].c.get(
                            rawLeaf.memberId
                        ) as Bit255
                    ).toFields(),
                    rawLeaf.contributions[i].U.get(rawLeaf.memberId).toFields(),
                ].flat()
            );
        }
        return hashChain;
    }

    calculateLeaf(rawLeaf: EncryptionLeaf): Field {
        return EncryptionStorage.calculateLeaf(rawLeaf);
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
}

type ResponseContributionLeaf = Field;
class ResponseContributionWitness extends Struct({
    level1: RequestLevel1Witness,
    level2: MTWitnessL2,
}) {}

class ResponseContributionStorage extends TwoLevelStorage<
    ResponseContributionLeaf,
    RequestLevel1Witness,
    typeof MTWitnessL2
> {
    static readonly height1 = MTWitnessL1.height; // FIXME
    static readonly height2 = MTWitnessL2.height;

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index: Field;
            leaf: ResponseContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            REQUEST_LEVEL_1_TREE,
            REQUEST_LEVEL_1_WITNESS,
            EmptyMTL2,
            NewMTWitnessL2,
            leafs
        );
    }

    get height1(): number {
        return ResponseContributionStorage.height1;
    }

    get height2(): number {
        return ResponseContributionStorage.height2;
    }

    static calculateLeaf(contribution: ResponseContributionLeaf): Field {
        return contribution;
    }

    calculateLeaf(contribution: ResponseContributionLeaf): Field {
        return ResponseContributionStorage.calculateLeaf(contribution);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return ResponseContributionStorage.calculateLevel1Index(requestId);
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return ResponseContributionStorage.calculateLevel2Index(memberId);
    }
}

type ResponseLeaf = Field;
class ResponseStorage extends OneLevelStorage<
    ResponseLeaf,
    RequestLevel1Witness
> {
    static readonly height = MTWitnessL1.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ResponseLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(REQUEST_LEVEL_1_TREE, REQUEST_LEVEL_1_WITNESS, leafs);
    }

    get height(): number {
        return ResponseStorage.height;
    }

    static calculateLeaf(responseRootD: ResponseLeaf): Field {
        return responseRootD;
    }

    calculateLeaf(responseRootD: ResponseLeaf): Field {
        return ResponseStorage.calculateLeaf(responseRootD);
    }

    static calculateLevel1Index(requestId: Field): Field {
        return requestId;
    }

    calculateLevel1Index(requestId: Field): Field {
        return ResponseStorage.calculateLevel1Index(requestId);
    }
}
