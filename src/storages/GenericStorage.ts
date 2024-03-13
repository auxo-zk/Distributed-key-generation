import { Field, MerkleTree } from 'o1js';

interface Storage<RawLeaf, Level1MT, Level1Witness, Level2MT, Level2Witness> {
    get root(): Field;
    get level1(): Level1MT;
    get level2s(): { [key: string]: Level2MT };
    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } };

    calculateLeaf(args: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel1Index(args: any): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel2Index?(args: any): Field;
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

export abstract class GenericStorage<
    RawLeaf,
    Level1MT extends MerkleTree,
    Level1MTWitness,
    Level2MT extends MerkleTree | undefined,
    Level2Witness
> implements
        Storage<RawLeaf, Level1MT, Level1MTWitness, Level2MT, Level2Witness>
{
    EMPTY_LEVEL_1_TREE?(): Level1MT;
    EMPTY_LEVEL_2_TREE?(): Level2MT;
    private _level1: Level1MT;
    private _level2s: { [key: string]: Level2MT };
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        emptyLevel1Tree: () => Level1MT,
        emptyLevel2Tree?: () => Level2MT,
        leafs?: {
            level1Index: Field;
            level2Index?: Field;
            leaf: RawLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        this.EMPTY_LEVEL_1_TREE = emptyLevel1Tree;
        this._level1 = this.EMPTY_LEVEL_1_TREE();
        this._level2s = {};
        this._leafs = {};
        if (emptyLevel2Tree) {
            this.EMPTY_LEVEL_2_TREE = emptyLevel2Tree;
            if (leafs) {
                for (let i = 0; i < leafs.length; i++) {
                    if (leafs[i].isRaw) {
                        this.updateRawLeaf(
                            {
                                level1Index: leafs[i].level1Index,
                                level2Index: leafs[i].level2Index,
                            },
                            leafs[i].leaf as RawLeaf
                        );
                    } else {
                        this.updateLeaf(
                            {
                                level1Index: leafs[i].level1Index,
                                level2Index: leafs[i].level2Index,
                            },
                            leafs[i].leaf as Field
                        );
                    }
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

    abstract calculateLeaf(args: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel2Index?(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1MTWitness {
        return this._level1.getWitness(
            level1Index.toBigInt()
        ) as Level1MTWitness;
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        let level2 = this._level2s[level1Index.toString()];
        if (!this.EMPTY_LEVEL_2_TREE)
            throw new Error('This storage does not support Level2MT');
        if (level2 === undefined)
            throw new Error('Level 2 MT does not exist at this index');
        return level2.getWitness(level2Index.toBigInt()) as Level2Witness;
    }

    getWitness(
        level1Index: Field,
        level2Index?: Field
    ):
        | Level1MTWitness
        | {
              level1: Level1MTWitness;
              level2: Level2Witness;
          } {
        if (level2Index) {
            return {
                level1: this.getLevel1Witness(level1Index),
                level2: this.getLevel2Witness(level1Index, level2Index),
            };
        } else {
            return this.getLevel1Witness(level1Index);
        }
    }

    updateInternal(level1Index: Field, level2: Level2MT) {
        if (this.EMPTY_LEVEL_2_TREE) {
            Object.assign(this._level2s, {
                [level1Index.toString()]: level2,
            });
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this._level1.setLeaf(level1Index.toBigInt(), level2!.getRoot());
        } else {
            throw new Error('This storage does not support Level2MT');
        }
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
                let level2 = this._level2s[level1Index.toString()];
                if (level2 === undefined) level2 = this.EMPTY_LEVEL_2_TREE();
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                level2!.setLeaf(level2Index.toBigInt(), leaf);
                this.updateInternal(level1Index, level2);
            } else {
                throw new Error('This storage does not support Level2MT');
            }
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
            if (this.EMPTY_LEVEL_2_TREE) {
                leafId += '-' + level2Index.toString();
                let level2 = this._level2s[level1Index.toString()];
                if (level2 === undefined) level2 = this.EMPTY_LEVEL_2_TREE();
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                level2!.setLeaf(level2Index.toBigInt(), leaf);
                this.updateInternal(level1Index, level2);
            } else {
                throw new Error('This storage does not support Level2MT');
            }
        } else this._level1.setLeaf(level1Index.toBigInt(), leaf);

        this._leafs[leafId] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}
