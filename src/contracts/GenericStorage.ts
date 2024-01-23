import { Field } from 'o1js';

interface Storage<
    RawLeaf extends object,
    Level1MT extends object,
    Level1Witness extends object,
    Level2MT extends object,
    Level2Witness extends object
> {
    level1: Level1MT;
    level2s: { [key: string]: Level2MT };
    leafs: { [key: string]: { raw: RawLeaf | undefined; leaf: Field } };

    calculateLeaf(args: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel1Index(args: any): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel2Index?(args: any): Field;
    getLeafs(): Field[];
    getRawLeafs(): (RawLeaf | undefined)[];
    getLevel1Witness(level1Index: Field): Level1Witness;
    getLevel2Witness?(level1Index: Field, level2Index: Field): Level2Witness;
    updateInternal?(level1Index: Field, level2: Level2MT): void;
    updateLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index?: Field },
        leaf: Field
    ): void;
    updateRawLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index?: Field },
        rawLeaf: RawLeaf
    ): void;
}

// type Witness = {
//   isLeft: boolean;
//   sibling: Field;
// }[];

// declare class MerkleTreeWitness extends CircuitValue {
//   static height: number;
//   path: Field[];
//   isLeft: Bool[];
//   height(): number;
//   constructor(witness: Witness);
//   calculateRoot(leaf: Field): Field;
//   calculateIndex(): Field;
// }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type RawLeaf = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type Level1MT = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type Level2MT = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type Level1Witness = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type Level2Witness = any;
declare type FullMTWitness = {
    level1: Level1Witness;
    leve2: Level2Witness;
};

export abstract class GenericStorage<
    _RawLeaf extends object,
    _Level1MT extends object,
    _Level1Witness extends object,
    _Level2MT extends object,
    _Level2Witness extends object
> implements
        Storage<_RawLeaf, _Level1MT, _Level1Witness, _Level2MT, _Level2Witness>
{
    EMPTY_LEVEL_1_TREE?(): Level1MT;
    EMPTY_LEVEL_2_TREE?(): Level2MT;
    level1: Level1MT;
    level2s: { [key: string]: Level2MT };
    leafs: { [key: string]: { raw: RawLeaf | undefined; leaf: Field } };

    constructor(
        emptyLevel1Tree: () => Level1MT,
        level1?: Level1MT,
        emptyLevel2Tree?: () => Level2MT,
        level2s?: { index: Field; level2: Level2MT }[],
        leafs?: { level1Index: Field; level2Index?: Field; rawLeaf: RawLeaf }[]
    ) {
        this.EMPTY_LEVEL_1_TREE = emptyLevel1Tree;
        this.level1 = level1 || this.EMPTY_LEVEL_1_TREE();
        this.level2s = {};
        if (emptyLevel2Tree && level2s && level2s.length > 0) {
            this.EMPTY_LEVEL_2_TREE = emptyLevel2Tree;
            for (let i = 0; i < level2s.length; i++) {
                this.level2s[level2s[i].index.toString()] = level2s[i].level2;
            }
        }
        if (leafs) {
            for (let i = 0; i < leafs.length; i++) {
                this.updateRawLeaf(
                    {
                        level1Index: leafs[i].level1Index,
                        level2Index: leafs[i].level2Index,
                    },
                    leafs[i].rawLeaf
                );
            }
        }
    }

    abstract calculateLeaf(args: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel2Index?(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1Witness {
        return this.level1.getWitness(level1Index.toBigInt()) as Level1Witness;
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        let level2 = this.level2s[level1Index.toString()];
        if (!this.EMPTY_LEVEL_2_TREE)
            throw new Error('This storage does not support Level2MT');
        if (level2 === undefined)
            throw new Error('Level 2 MT does not exist at this index');
        return level2.getWitness(level2Index.toBigInt()) as Level2Witness;
    }

    getWitness(
        level1Index: Field,
        level2Index?: Field
    ): Level1Witness | FullMTWitness {
        if (level2Index) {
            return {
                level1: this.getLevel1Witness(level1Index),
                level2: this.getLevel2Witness(level1Index, level2Index),
            };
        } else {
            return this.getLevel1Witness(level1Index);
        }
    }

    getLeafs(): Field[] {
        return Object.values(this.leafs).map((e) => e.leaf);
    }

    getRawLeafs(): (RawLeaf | undefined)[] {
        return Object.values(this.leafs).map((e) => e.raw);
    }

    updateInternal(level1Index: Field, level2: Level2MT) {
        Object.assign(this.level2s, {
            [level1Index.toString()]: level2,
        });
        this.level1.setLeaf(level1Index.toBigInt(), level2.getRoot());
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
            if (this.EMPTY_LEVEL_2_TREE) {
                leafId += '-' + level2Index.toString();
                let level2 = this.level2s[level1Index.toString()];
                if (level2 === undefined) level2 = this.EMPTY_LEVEL_2_TREE();
                level2.setLeaf(level2Index.toBigInt(), leaf);
                this.updateInternal(level1Index, level2);
            } else {
                throw new Error('This storage does not support Level2MT');
            }
        } else this.level1.setLeaf(level1Index.toBigInt(), leaf);

        this.leafs[leafId] = {
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
            if (this.EMPTY_LEVEL_2_TREE) {
                leafId += '-' + level2Index.toString();
                let level2 = this.level2s[level1Index.toString()];
                if (level2 === undefined) level2 = this.EMPTY_LEVEL_2_TREE();

                level2.setLeaf(level2Index.toBigInt(), leaf);
                this.updateInternal(level1Index, level2);
            } else {
                throw new Error('This storage does not support Level2MT');
            }
        } else this.level1.setLeaf(level1Index.toBigInt(), leaf);

        this.leafs[leafId] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}
