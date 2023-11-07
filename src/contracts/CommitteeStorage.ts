import { Field, Poseidon, PublicKey } from "o1js";
import { Level1MT, Level1Witness, Level2MT, Level2Witness, FullMTWitness } from "./Committee.js";

abstract class CommitteeStrorage {
  level1: Level1MT;
  level2?: Level2MT;

  constructor(level1: Level1MT, level2?: Level2MT) {
    this.level1 = level1;
    if (level2) this.level2 = level2;
  }

  abstract calculateLeaf(args: any): Field;
  abstract calculateLevel1Index(args: any): Field;
  calculateLevel2Index?(args: any): Field;
  abstract getWitness(args: any): Level1Witness | FullMTWitness;
}

export class MemberStorage extends CommitteeStrorage {
  level1: Level1MT;
  level2: Level2MT;

  constructor(level1: Level1MT, level2: Level2MT) {
    super(level1, level2);
  }

  calculateLeaf(publicKey: PublicKey): Field {
    return Poseidon.hash(publicKey.toGroup().toFields());
  }

  calculateLevel1Index(committeeId: Field): Field {
    return Poseidon.hash([committeeId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(
    { level1Index, level2Index }: {
      level1Index: Field,
      level2Index: Field
    }
  ): FullMTWitness {
    return new FullMTWitness({
      level1: this.level1.getWitness(level1Index) as Level1Witness,
      level2: new Level2Witness(this.level2.getWitness(level2Index.toBigInt())),
    });
  }
}

export class SettingStorage extends CommitteeStrorage {
  level1: Level1MT;

  constructor(level1: Level1MT) {
    super(level1);
  }

  calculateLeaf({ T, N }: { T: Field, N: Field }): Field {
    return Poseidon.hash([T, N]);
  }

  calculateLevel1Index(commiteeId: Field): Field {
    return Poseidon.hash([commiteeId]);
  }

  getWitness(level1Index: Field): Level1Witness {
    return this.level1.getWitness(level1Index) as Level1Witness;
  }
}