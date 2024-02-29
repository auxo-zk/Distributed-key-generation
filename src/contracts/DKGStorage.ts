import {
    Field,
    Group,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    Struct,
} from 'o1js';
import { KeyStatus } from './DKG.js';
import { Round1Contribution, Round2Contribution } from '../libs/Committee.js';
import { COMMITTEE_MAX_SIZE, INSTANCE_LIMITS } from '../constants.js';

export const LEVEL1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.COMMITTEE * INSTANCE_LIMITS.KEY)) + 1;
export const LEVEL2_TREE_HEIGHT = Math.ceil(Math.log2(COMMITTEE_MAX_SIZE)) + 1;
export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
export class Level2MT extends MerkleTree {}
export class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);
export const EMPTY_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);
export class FullMTWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}

export function calculateKeyIndex(committeeId: Field, keyId: Field): Field {
    return Field.from(BigInt(INSTANCE_LIMITS.KEY)).mul(committeeId).add(keyId);
}

export abstract class DKGStorage<RawLeaf> {
    private _level1: Level1MT;
    private _level2s: { [key: string]: Level2MT };
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index?: Field;
            leaf: RawLeaf | Field;
        }[]
    ) {
        this._level1 = EMPTY_LEVEL_1_TREE();
        this._level2s = {};
        this._leafs = {};
        if (leafs) {
            for (let i = 0; i < leafs.length; i++) {
                if (leafs[i].leaf instanceof Field) {
                    this.updateLeaf(
                        {
                            level1Index: leafs[i].level1Index,
                            level2Index: leafs[i].level2Index,
                        },
                        leafs[i].leaf as Field
                    );
                } else {
                    this.updateRawLeaf(
                        {
                            level1Index: leafs[i].level1Index,
                            level2Index: leafs[i].level2Index,
                        },
                        leafs[i].leaf as RawLeaf
                    );
                }
            }
        }
    }

    get root(): Field {
        return this._level1.getRoot();
    }

    get level1(): Level1MT {
        return this._level1;
    }

    get level2s(): { [key: string]: Level2MT } {
        return this._level2s;
    }

    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } } {
        return this._leafs;
    }

    abstract calculateLeaf(rawLeaf: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel2Index?(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1Witness {
        return new Level1Witness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        let level2 = this._level2s[level1Index.toString()];
        if (level2 === undefined)
            throw new Error('Level 2 MT does not exist at this index');
        return new Level2Witness(level2.getWitness(level2Index.toBigInt()));
    }

    getWitness(
        level1Index: Field,
        level2Index?: Field
    ): Level1Witness | FullMTWitness {
        if (level2Index) {
            return new FullMTWitness({
                level1: this.getLevel1Witness(level1Index),
                level2: this.getLevel2Witness(level1Index, level2Index),
            });
        } else {
            return this.getLevel1Witness(level1Index);
        }
    }

    updateInternal(level1Index: Field, level2: Level2MT) {
        Object.assign(this._level2s, {
            [level1Index.toString()]: level2,
        });
        this._level1.setLeaf(level1Index.toBigInt(), level2.getRoot());
    }

    updateLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index?: Field },
        leaf: Field
    ): void {
        let leafId = level1Index.toString();
        if (level2Index) {
            leafId += '-' + level2Index.toString();
            let level2 = this._level2s[level1Index.toString()];
            if (level2 === undefined) level2 = EMPTY_LEVEL_2_TREE();

            level2.setLeaf(level2Index.toBigInt(), leaf);
            this.updateInternal(level1Index, level2);
        } else this._level1.setLeaf(level1Index.toBigInt(), leaf);

        this._leafs[leafId] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateRawLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index?: Field },
        rawLeaf: RawLeaf
    ): void {
        let leafId = level1Index.toString();
        let leaf = this.calculateLeaf(rawLeaf);
        if (level2Index) {
            leafId += '-' + level2Index.toString();
            let level2 = this._level2s[level1Index.toString()];
            if (level2 === undefined) level2 = EMPTY_LEVEL_2_TREE();

            level2.setLeaf(level2Index.toBigInt(), leaf);
            this.updateInternal(level1Index, level2);
        } else this._level1.setLeaf(level1Index.toBigInt(), leaf);

        this._leafs[leafId] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}

export type KeyStatusLeaf = KeyStatus;

export class KeyStatusStorage extends DKGStorage<KeyStatusLeaf> {
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

export type Round1ContributionLeaf = Round1Contribution;

export class Round1ContributionStorage extends DKGStorage<Round1ContributionLeaf> {
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

export type PublicKeyLeaf = Group;

export class PublicKeyStorage extends DKGStorage<PublicKeyLeaf> {
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

export type Round2ContributionLeaf = Round2Contribution;

export class Round2ContributionStorage extends DKGStorage<Round2ContributionLeaf> {
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

export type EncryptionLeaf = {
    contributions: Round2Contribution[];
    memberId: Field;
};

export class EncryptionStorage extends DKGStorage<EncryptionLeaf> {
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
