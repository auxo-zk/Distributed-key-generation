import {
    Field,
    Group,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    Struct,
} from 'o1js';
import { Round1Contribution, Round2Contribution } from '../libs/Committee.js';
import { INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage, Witness } from './GenericStorage.js';
import { Bit255, FieldDynamicArray } from '@auxo-dev/auxo-libs';
import {
    REQUEST_LEVEL_1_TREE,
    REQUEST_LEVEL_1_WITNESS,
    RequestLevel1Witness,
} from './RequestStorage.js';

export {
    DKG_LEVEL_1_TREE,
    DKG_LEVEL_1_WITNESS,
    DKG_LEVEL_2_TREE,
    DKG_LEVEL_2_WITNESS,
    calculateKeyIndex,
    Level1MT as DkgLevel1MT,
    Level1Witness as DkgLevel1Witness,
    Level2MT as DkgLevel2MT,
    Level2Witness as DkgLevel2Witness,
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

const LEVEL1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.COMMITTEE * INSTANCE_LIMITS.KEY)) + 1;
const LEVEL2_TREE_HEIGHT = Math.ceil(Math.log2(INSTANCE_LIMITS.MEMBER)) + 1;
class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
class Level2MT extends MerkleTree {}
class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
class FullMTWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}

const DKG_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);
const DKG_LEVEL_1_WITNESS = (witness: Witness) => new Level1Witness(witness);
const DKG_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);
const DKG_LEVEL_2_WITNESS = (witness: Witness) => new Level2Witness(witness);

function calculateKeyIndex(committeeId: Field, keyId: Field): Field {
    return Field.from(INSTANCE_LIMITS.KEY).mul(committeeId).add(keyId);
}

class ProcessedContributions extends FieldDynamicArray(
    INSTANCE_LIMITS.MEMBER
) {}

type KeyStatusLeaf = Field;
class KeyStatusStorage extends GenericStorage<KeyStatusLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyStatusLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            DKG_LEVEL_1_TREE,
            DKG_LEVEL_1_WITNESS,
            undefined,
            undefined,
            leafs
        );
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
        return Field.from(
            committeeId.toBigInt() * BigInt(INSTANCE_LIMITS.KEY) +
                keyId.toBigInt()
        );
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

    getLevel1Witness(level1Index: Field): Level1Witness {
        return super.getLevel1Witness(level1Index) as Level1Witness;
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: KeyStatusLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type KeyLeaf = Group;
class KeyStorage extends GenericStorage<KeyLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            DKG_LEVEL_1_TREE,
            DKG_LEVEL_1_WITNESS,
            undefined,
            undefined,
            leafs
        );
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
        return Field.from(
            committeeId.toBigInt() * BigInt(INSTANCE_LIMITS.KEY) +
                keyId.toBigInt()
        );
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

    getLevel1Witness(level1Index: Field): Level1Witness {
        return super.getLevel1Witness(level1Index) as Level1Witness;
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: KeyLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

type Round1ContributionLeaf = Round1Contribution;
class Round1ContributionStorage extends GenericStorage<Round1ContributionLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: Round1ContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            DKG_LEVEL_1_TREE,
            DKG_LEVEL_1_WITNESS,
            DKG_LEVEL_2_TREE,
            DKG_LEVEL_2_WITNESS,
            leafs
        );
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
        return Field.from(
            committeeId.toBigInt() * BigInt(INSTANCE_LIMITS.KEY) +
                keyId.toBigInt()
        );
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

    getLevel1Witness(level1Index: Field): Level1Witness {
        return super.getLevel1Witness(level1Index) as Level1Witness;
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        return super.getLevel2Witness?.(
            level1Index,
            level2Index
        ) as Level2Witness;
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
        rawLeaf: Round1ContributionLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type PublicKeyLeaf = Group;
class PublicKeyStorage extends GenericStorage<PublicKeyLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: PublicKeyLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            DKG_LEVEL_1_TREE,
            DKG_LEVEL_1_WITNESS,
            DKG_LEVEL_2_TREE,
            DKG_LEVEL_2_WITNESS,
            leafs
        );
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
        return Field.from(
            committeeId.toBigInt() * BigInt(INSTANCE_LIMITS.KEY) +
                keyId.toBigInt()
        );
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

    getLevel1Witness(level1Index: Field): Level1Witness {
        return super.getLevel1Witness(level1Index) as Level1Witness;
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        return super.getLevel2Witness?.(
            level1Index,
            level2Index
        ) as Level2Witness;
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
        rawLeaf: PublicKeyLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type Round2ContributionLeaf = Round2Contribution;
class Round2ContributionStorage extends GenericStorage<Round2ContributionLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: Round2ContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            DKG_LEVEL_1_TREE,
            DKG_LEVEL_1_WITNESS,
            DKG_LEVEL_2_TREE,
            DKG_LEVEL_2_WITNESS,
            leafs
        );
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
        return Field.from(
            committeeId.toBigInt() * BigInt(INSTANCE_LIMITS.KEY) +
                keyId.toBigInt()
        );
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

    getLevel1Witness(level1Index: Field): Level1Witness {
        return super.getLevel1Witness(level1Index) as Level1Witness;
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        return super.getLevel2Witness?.(
            level1Index,
            level2Index
        ) as Level2Witness;
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
        rawLeaf: Round2ContributionLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type EncryptionLeaf = {
    contributions: Round2Contribution[];
    memberId: Field;
};
class EncryptionStorage extends GenericStorage<EncryptionLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: EncryptionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            DKG_LEVEL_1_TREE,
            DKG_LEVEL_1_WITNESS,
            DKG_LEVEL_2_TREE,
            DKG_LEVEL_2_WITNESS,
            leafs
        );
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
        return Field.from(
            committeeId.toBigInt() * BigInt(INSTANCE_LIMITS.KEY) +
                keyId.toBigInt()
        );
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

    getLevel1Witness(level1Index: Field): Level1Witness {
        return super.getLevel1Witness(level1Index) as Level1Witness;
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        return super.getLevel2Witness?.(
            level1Index,
            level2Index
        ) as Level2Witness;
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
        rawLeaf: EncryptionLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type ResponseContributionLeaf = Field;
class ResponseContributionWitness extends Struct({
    level1: RequestLevel1Witness,
    level2: Level2Witness,
}) {}

class ResponseContributionStorage extends GenericStorage<ResponseContributionLeaf> {
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
            DKG_LEVEL_2_TREE,
            DKG_LEVEL_2_WITNESS,
            leafs
        );
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

    getLevel1Witness(level1Index: Field): RequestLevel1Witness {
        return super.getLevel1Witness(level1Index) as RequestLevel1Witness;
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        return super.getLevel2Witness?.(
            level1Index,
            level2Index
        ) as Level2Witness;
    }

    getWitness(
        level1Index: Field,
        level2Index: Field
    ): ResponseContributionWitness {
        return super.getWitness(
            level1Index,
            level2Index
        ) as ResponseContributionWitness;
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
        rawLeaf: ResponseContributionLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type ResponseLeaf = Field;
class ResponseStorage extends GenericStorage<ResponseLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ResponseLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(
            REQUEST_LEVEL_1_TREE,
            REQUEST_LEVEL_1_WITNESS,
            undefined,
            undefined,
            leafs
        );
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

    getLevel1Witness(level1Index: Field): Level1Witness {
        return super.getLevel1Witness(level1Index) as Level1Witness;
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf1({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: ResponseLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}
