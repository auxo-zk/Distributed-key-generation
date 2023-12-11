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

export abstract class CommitteeStrorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1?: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    this.level1 = level1 || EMPTY_LEVEL_1_TREE();
    this.level2s = {};
    if (level2s) {
      for (let i = 0; i < level2s.length; i++) {
        this.level2s[level2s[i].index.toString()] = level2s[i].level2;
      }
    }
  }

  abstract calculateLeaf(args: any): Field;
  abstract calculateLevel1Index(args: any): Field;
  calculateLevel2Index?(args: any): Field;

  getLevel1Witness(level1Index: Field): Level1Witness {
    return new Level1Witness(this.level1.getWitness(level1Index.toBigInt()));
  }

  getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
    let level2 = this.level2s[level1Index.toString()];
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
    Object.assign(this.level2s, {
      [level1Index.toString()]: level2,
    });
    this.level1.setLeaf(level1Index.toBigInt(), level2.getRoot());
  }

  updateLeaf(leaf: Field, level1Index: Field, level2Index?: Field): void {
    if (level2Index) {
      if (Object.keys(this.level2s).length == 0)
        throw new Error('This storage does support level 2 MT');

      let level2 = this.level2s[level1Index.toString()];
      if (level2 === undefined) level2 = EMPTY_LEVEL_2_TREE();

      level2.setLeaf(level2Index.toBigInt(), leaf);
      this.updateInternal(level1Index, level2);
    } else this.level1.setLeaf(level1Index.toBigInt(), leaf);
  }
}

export class MemberStorage extends CommitteeStrorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1?: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    super(level1, level2s);
  }

  calculateLeaf(publicKey: PublicKey): Field {
    return Poseidon.hash(publicKey.toFields());
  }

  calculateLevel1Index(committeeId: Field): Field {
    return committeeId;
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
    return super.getWitness(level1Index, level2Index) as FullMTWitness;
  }

  updateLeaf(leaf: Field, level1Index: Field, level2Index: Field): void {
    super.updateLeaf(leaf, level1Index, level2Index);
  }
}

export class SettingStorage extends CommitteeStrorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf({ T, N }: { T: Field; N: Field }): Field {
    return Poseidon.hash([T, N]);
  }

  calculateLevel1Index(commiteeId: Field): Field {
    return commiteeId;
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

export class KeyCounterStorage extends CommitteeStrorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf(nextKeyId: Field): Field {
    return nextKeyId;
  }

  calculateLevel1Index(committeeId: Field): Field {
    return committeeId;
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}
