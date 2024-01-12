import {
  Field,
  MerkleMap,
  MerkleMapWitness,
  MerkleTree,
  MerkleWitness,
  Poseidon,
  PublicKey,
  Struct,
} from 'o1js';
import { ResponseContribution } from '../libs/Committee.js';
import { COMMITTEE_MAX_SIZE } from '../constants.js';
import { RequestStatusEnum } from './Request.js';

export const LEVEL2_TREE_HEIGHT = Math.ceil(Math.log2(COMMITTEE_MAX_SIZE)) + 1;
export class Level1MT extends MerkleMap {}
export class Level1Witness extends MerkleMapWitness {}
export class Level2MT extends MerkleTree {}
export class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
export const EMPTY_LEVEL_1_TREE = () => new Level1MT();
export const EMPTY_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);
export class FullMTWitness extends Struct({
  level1: Level1Witness,
  level2: Level2Witness,
}) {}

export abstract class RequestStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1?: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    this.level1 = level1 || EMPTY_LEVEL_1_TREE();
    this.level2s = {};
    if (level2s && level2s.length > 0) {
      for (let i = 0; i < level2s.length; i++) {
        this.level2s[level2s[i].index.toString()] = level2s[i].level2;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract calculateLeaf(args: any): Field;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract calculateLevel1Index(args: any): Field;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calculateLevel2Index?(args: any): Field;

  getLevel1Witness(level1Index: Field): Level1Witness {
    return this.level1.getWitness(level1Index);
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
    this.level1.set(level1Index, level2.getRoot());
  }

  updateLeaf(leaf: Field, level1Index: Field, level2Index?: Field): void {
    if (level2Index) {
      if (Object.keys(this.level2s).length == 0)
        throw new Error('This storage does support level 2 MT');

      let level2 = this.level2s[level1Index.toString()];
      if (level2 === undefined) level2 = EMPTY_LEVEL_2_TREE();

      level2.setLeaf(level2Index.toBigInt(), leaf);
      this.updateInternal(level1Index, level2);
    } else this.level1.set(level1Index, leaf);
  }
}

export class RequestStatusStorage extends RequestStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  static calculateLeaf(status: Field): Field {
    return Field(status);
  }

  calculateLeaf(status: Field): Field {
    return RequestStatusStorage.calculateLeaf(status);
  }

  static calculateLevel1Index(requestId: Field): Field {
    return requestId;
  }

  calculateLevel1Index(requestId: Field): Field {
    return RequestStatusStorage.calculateLevel1Index(requestId);
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

export class RequesterStorage extends RequestStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  static calculateLeaf(address: PublicKey): Field {
    return Poseidon.hash(address.toFields());
  }

  calculateLeaf(address: PublicKey): Field {
    return RequesterStorage.calculateLeaf(address);
  }

  static calculateLevel1Index(requestId: Field): Field {
    return requestId;
  }

  calculateLevel1Index(requestId: Field): Field {
    return RequesterStorage.calculateLevel1Index(requestId);
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

export class ResponseContributionStorage extends RequestStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1?: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    super(level1, level2s);
  }

  static calculateLeaf(contribution: ResponseContribution): Field {
    return contribution.hash();
  }

  calculateLeaf(contribution: ResponseContribution): Field {
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

  updateLeaf(leaf: Field, level1Index: Field, level2Index: Field): void {
    super.updateLeaf(leaf, level1Index, level2Index);
  }
}
