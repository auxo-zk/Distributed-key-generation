import {
  Field,
  Group,
  MerkleMap,
  MerkleMapWitness,
  MerkleTree,
  MerkleWitness,
  Poseidon,
  Struct,
} from 'o1js';
import { KeyStatus } from './DKG.js';
import {
  ResponseContribution,
  Round1Contribution,
  Round2Contribution,
} from '../libs/Committee.js';
import { COMMITTEE_MAX_SIZE } from '../constants.js';

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

export const enum ActionStatus {
  NOT_EXISTED,
  REDUCED,
}

abstract class DKGStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    this.level1 = level1;
    this.level2s = {};
    if (level2s && level2s.length > 0) {
      for (let i = 0; i < level2s.length; i++) {
        this.level2s[level2s[i].index.toString()] = level2s[i].level2;
      }
    }
  }

  abstract calculateLeaf(args: any): Field;
  abstract calculateLevel1Index(args: any): Field;
  calculateLevel2Index?(args: any): Field;

  getLevel1Witness(level1Index: Field): Level1Witness {
    return this.level1.getWitness(level1Index) as Level1Witness;
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

export class KeyStatusStorage extends DKGStorage {
  level1: Level1MT;

  constructor(level1: Level1MT) {
    super(level1);
  }

  calculateLeaf(status: KeyStatus): Field {
    return Field(status);
  }

  calculateLevel1Index({
    committeeId,
    keyId,
  }: {
    committeeId: Field;
    keyId: Field;
  }): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }
}

export class ReduceStorage extends DKGStorage {
  level1: Level1MT;

  constructor(level1: Level1MT) {
    super(level1);
  }

  calculateLeaf(status: ActionStatus): Field {
    return Field(status);
  }

  calculateLevel1Index(actionState: Field): Field {
    return actionState;
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }
}

export class Round1ContributionStorage extends DKGStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    super(level1, level2s);
  }

  calculateLeaf(contribution: Round1Contribution): Field {
    return contribution.hash();
  }

  calculateLevel1Index({
    committeeId,
    keyId,
  }: {
    committeeId: Field;
    keyId: Field;
  }): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
    return super.getWitness(level1Index, level2Index) as FullMTWitness;
  }
}

export class PublicKeyStorage extends DKGStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    super(level1, level2s);
  }

  calculateLeaf(C0: Group): Field {
    return Poseidon.hash(C0.toFields());
  }

  calculateLevel1Index({
    committeeId,
    keyId,
  }: {
    committeeId: Field;
    keyId: Field;
  }): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
    return super.getWitness(level1Index, level2Index) as FullMTWitness;
  }
}

export class Round2ContributionStorage extends DKGStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    super(level1, level2s);
  }

  calculateLeaf(contribution: Round2Contribution): Field {
    return contribution.hash();
  }

  calculateLevel1Index({
    committeeId,
    keyId,
  }: {
    committeeId: Field;
    keyId: Field;
  }): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
    return super.getWitness(level1Index, level2Index) as FullMTWitness;
  }
}

export class EncryptionStorage extends DKGStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    super(level1, level2s);
  }

  calculateLeaf({
    contributions,
    memberId,
  }: {
    contributions: Round2Contribution[];
    memberId: Field;
  }): Field {
    let hashChain = Field(0);
    for (let i = 0; i < Number(contributions[0].c.length); i++) {
      hashChain = Poseidon.hash(
        [
          hashChain,
          contributions[i].c.get(memberId).toFields(),
          contributions[i].U.get(memberId).toFields(),
        ].flat()
      );
    }
    return hashChain;
  }

  calculateLevel1Index({
    committeeId,
    keyId,
  }: {
    committeeId: Field;
    keyId: Field;
  }): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
    return super.getWitness(level1Index, level2Index) as FullMTWitness;
  }
}

export class ResponseContributionStorage extends DKGStorage {
  level1: Level1MT;
  level2s: { [key: string]: Level2MT };

  constructor(
    level1: Level1MT,
    level2s?: { index: Field; level2: Level2MT }[]
  ) {
    super(level1, level2s);
  }

  calculateLeaf(contribution: ResponseContribution): Field {
    return contribution.hash();
  }

  calculateLevel1Index(requestId: Field): Field {
    return requestId;
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
    return super.getWitness(level1Index, level2Index) as FullMTWitness;
  }
}
