import {
    Field,
    Group,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    Struct,
} from 'o1js';
import { KeyStatus } from '../contracts/DKG.js';
import { Round1Contribution, Round2Contribution } from '../libs/Committee.js';
import { INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage } from './GenericStorage.js';
import { RequestLevel1MT, RequestLevel1Witness } from './RequestStorage.js';
import { REQUESTER_LEVEL_1_TREE } from './RequesterStorage.js';
import { FieldDynamicArray } from '@auxo-dev/auxo-libs';

export {
    DKG_LEVEL_1_TREE as DKG_LEVEL_1_TREE,
    DKG_LEVEL_2_TREE as DKG_LEVEL_2_TREE,
    calculateKeyIndex,
    Level1MT as DkgLevel1MT,
    Level1Witness as DkgLevel1Witness,
    Level2MT as DkgLevel2MT,
    Level2Witness as DkgLevel2Witness,
    FullMTWitness as DKGWitness,
    ProcessedContributions,
};

export {
    KeyStatusLeaf,
    KeyStatusStorage,
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
const DKG_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);

function calculateKeyIndex(committeeId: Field, keyId: Field): Field {
    return Field.from(BigInt(INSTANCE_LIMITS.KEY)).mul(committeeId).add(keyId);
}

class ProcessedContributions extends FieldDynamicArray(
    INSTANCE_LIMITS.MEMBER
) {}

type KeyStatusLeaf = KeyStatus;
class KeyStatusStorage extends GenericStorage<
    KeyStatusLeaf,
    Level1MT,
    Level1Witness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: KeyStatusLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(DKG_LEVEL_1_TREE, undefined, leafs);
    }

    static calculateLeaf(status: KeyStatusLeaf): Field {
        return Field(status);
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

type Round1ContributionLeaf = Round1Contribution;
class Round1ContributionStorage extends GenericStorage<
    Round1ContributionLeaf,
    Level1MT,
    Level1Witness,
    Level2MT,
    Level2Witness
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: Round1ContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(DKG_LEVEL_1_TREE, DKG_LEVEL_2_TREE, leafs);
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
class PublicKeyStorage extends GenericStorage<
    PublicKeyLeaf,
    Level1MT,
    Level1Witness,
    Level2MT,
    Level2Witness
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: PublicKeyLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(DKG_LEVEL_1_TREE, DKG_LEVEL_2_TREE, leafs);
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
class Round2ContributionStorage extends GenericStorage<
    Round2ContributionLeaf,
    Level1MT,
    Level1Witness,
    Level2MT,
    Level2Witness
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: Round2ContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(DKG_LEVEL_1_TREE, DKG_LEVEL_2_TREE, leafs);
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
class EncryptionStorage extends GenericStorage<
    EncryptionLeaf,
    Level1MT,
    Level1Witness,
    Level2MT,
    Level2Witness
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: EncryptionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(DKG_LEVEL_1_TREE, DKG_LEVEL_2_TREE, leafs);
    }

    static calculateLeaf(rawLeaf: EncryptionLeaf): Field {
        let hashChain = Field(0);
        for (let i = 0; i < Number(rawLeaf.contributions[0].c.length); i++) {
            hashChain = Poseidon.hash(
                [
                    hashChain,
                    rawLeaf.contributions[i].c.get(rawLeaf.memberId).toFields(),
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

class ResponseContributionStorage extends GenericStorage<
    ResponseContributionLeaf,
    RequestLevel1MT,
    RequestLevel1Witness,
    Level2MT,
    Level2Witness
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ResponseContributionLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(REQUESTER_LEVEL_1_TREE, DKG_LEVEL_2_TREE, leafs);
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
        rawLeaf: ResponseContributionLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type ResponseLeaf = Field;
class ResponseStorage extends GenericStorage<
    ResponseLeaf,
    RequestLevel1MT,
    RequestLevel1Witness,
    undefined,
    undefined
> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ResponseLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(DKG_LEVEL_1_TREE, undefined, leafs);
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

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeafWithR(
        { level1Index }: { level1Index: Field },
        leaf: Field
    ): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: ResponseLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}
