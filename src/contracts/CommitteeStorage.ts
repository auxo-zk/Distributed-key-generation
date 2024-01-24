import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
} from 'o1js';
import { COMMITTEE_MAX_SIZE, INSTANCE_LIMITS } from '../constants.js';

export const LEVEL1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.COMMITTEE)) + 1;
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

export abstract class CommitteeStrorage<RawLeaf> {
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

export type MemberLeaf = PublicKey;

// export class MemberStorage extends GenericStorage<
//   MemberLeaf,
//   Level1MT,
//   Level1Witness,
//   Level2MT,
//   Level2Witness
// >

export class MemberStorage extends CommitteeStrorage<MemberLeaf> {
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

export type SettingLeaf = {
    T: Field;
    N: Field;
};

export class SettingStorage extends CommitteeStrorage<SettingLeaf> {
    static calculateLeaf(rawLeaf: SettingLeaf): Field {
        return Poseidon.hash([rawLeaf.T, rawLeaf.N]);
    }

    calculateLeaf(rawLeaf: SettingLeaf): Field {
        return SettingStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(commiteeId: Field): Field {
        return commiteeId;
    }

    calculateLevel1Index(commiteeId: Field): Field {
        return SettingStorage.calculateLevel1Index(commiteeId);
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

export type KeyCounterLeaf = Field;

export class KeyCounterStorage extends CommitteeStrorage<KeyCounterLeaf> {
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
