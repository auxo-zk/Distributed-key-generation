import { Bool, Field, MerkleTree } from 'o1js';

export { Witness, BaseMerkleWitness, GenericStorage };

type Witness = {
    isLeft: boolean;
    sibling: Field;
}[];

interface BaseMerkleWitness {
    path: Field[];
    isLeft: Bool[];
    height(): number;
    calculateRoot(leaf: Field): Field;
    calculateIndex(): Field;
}

interface Storage<RawLeaf> {
    get root(): Field;
    get level1(): MerkleTree;
    get level2s(): { [key: string]: MerkleTree };
    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } };

    calculateLeaf(args: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel1Index(args: any): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel2Index?(args: any): Field;
    getLevel1Witness(level1Index: Field): BaseMerkleWitness;
    getLevel2Witness?(
        level1Index: Field,
        level2Index: Field
    ): BaseMerkleWitness;
    updateInternal?(level1Index: Field, level2: MerkleTree): void;
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

abstract class GenericStorage<RawLeaf> implements Storage<RawLeaf> {
    private emptyLevel1Tree: () => MerkleTree;
    private generateLevel1Witness: (witness: Witness) => BaseMerkleWitness;
    private emptyLevel2Tree?: () => MerkleTree;
    private generateLevel2Witness?: (witness: Witness) => BaseMerkleWitness;
    private _level1: MerkleTree;
    private _level2s: { [key: string]: MerkleTree };
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        emptyLevel1Tree: () => MerkleTree,
        generateLevel1Witness: (witness: Witness) => BaseMerkleWitness,
        emptyLevel2Tree?: () => MerkleTree,
        generateLevel2Witness?: (witness: Witness) => BaseMerkleWitness,
        leafs?: {
            level1Index: Field;
            level2Index?: Field;
            leaf: RawLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        this.emptyLevel1Tree = emptyLevel1Tree;
        this.generateLevel1Witness = generateLevel1Witness;
        this._level1 = this.emptyLevel1Tree();
        this._level2s = {};
        this._leafs = {};
        if (emptyLevel2Tree && generateLevel2Witness) {
            this.emptyLevel2Tree = emptyLevel2Tree;
            this.generateLevel2Witness = generateLevel2Witness;
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

    get level1(): MerkleTree {
        return this._level1;
    }

    get level2s(): { [key: string]: MerkleTree } {
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

    getLevel1Witness(level1Index: Field): BaseMerkleWitness {
        return this.generateLevel1Witness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getLevel2Witness?(
        level1Index: Field,
        level2Index: Field
    ): BaseMerkleWitness {
        let level2 = this._level2s[level1Index.toString()];
        if (!this.emptyLevel2Tree)
            throw new Error('This storage does not support MerkleTree');
        if (level2 === undefined || this.generateLevel2Witness === undefined)
            throw new Error('Level 2 MT does not exist at this index');
        return this.generateLevel2Witness(
            level2.getWitness(level2Index.toBigInt())
        );
    }

    getWitness(
        level1Index: Field,
        level2Index?: Field
    ):
        | BaseMerkleWitness
        | {
              level1: BaseMerkleWitness;
              level2: BaseMerkleWitness;
          } {
        if (level2Index && this.getLevel2Witness) {
            return {
                level1: this.getLevel1Witness(level1Index),
                level2: this.getLevel2Witness(level1Index, level2Index),
            };
        } else {
            return this.getLevel1Witness(level1Index);
        }
    }

    updateInternal(level1Index: Field, level2: MerkleTree) {
        if (this.emptyLevel2Tree) {
            Object.assign(this._level2s, {
                [level1Index.toString()]: level2,
            });
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this._level1.setLeaf(level1Index.toBigInt(), level2!.getRoot());
        } else {
            throw new Error('This storage does not support MerkleTree');
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
            if (this.emptyLevel2Tree) {
                leafId += '-' + level2Index.toString();
                let level2 = this._level2s[level1Index.toString()];
                if (level2 === undefined) level2 = this.emptyLevel2Tree();
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                level2!.setLeaf(level2Index.toBigInt(), leaf);
                this.updateInternal(level1Index, level2);
            } else {
                throw new Error('This storage does not support MerkleTree');
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
            if (this.emptyLevel2Tree) {
                leafId += '-' + level2Index.toString();
                let level2 = this._level2s[level1Index.toString()];
                if (level2 === undefined) level2 = this.emptyLevel2Tree();
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                level2!.setLeaf(level2Index.toBigInt(), leaf);
                this.updateInternal(level1Index, level2);
            } else {
                throw new Error('This storage does not support MerkleTree');
            }
        } else this._level1.setLeaf(level1Index.toBigInt(), leaf);

        this._leafs[leafId] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}
