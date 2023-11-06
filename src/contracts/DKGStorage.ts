import { Encoding, Field, Group, MerkleMap, Poseidon, PublicKey } from "o1js";
import { Action, Level1MT, Level2MT, Level1Witness, FullMTWitness, KeyStatus, PublicKeyArray, Level2Witness } from "./DKG.js";
import { ResponseContribution, Round1Contribution, Round2Contribution } from "../libs/Committee.js";

abstract class DKGStrorage {
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

export class ZkAppStorage extends DKGStrorage {
  level1: Level1MT;

  constructor(level1: Level1MT) {
    super(level1);
  }

  calculateLeaf(address: PublicKey): Field {
    return Poseidon.hash(address.toFields());
  }

  calculateLevel1Index(name: string): Field {
    return Poseidon.hash(Encoding.stringToFields(name));
  }

  getWitness(level1Index: Field): Level1Witness {
    return this.level1.getWitness(level1Index) as Level1Witness;
  }
}

export class RollupStateStorage extends DKGStrorage {
  level1: Level1MT;

  constructor(level1: Level1MT) {
    super(level1);
  }

  calculateLeaf(action: Action): Field {
    return action.hash();
  }

  calculateLevel1Index({ committeeId, keyId,}: {committeeId: Field, keyId: Field}): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  getWitness(level1Index: Field): Level1Witness {
    return this.level1.getWitness(level1Index) as Level1Witness;
  }
}

export class KeyStatusStorage extends DKGStrorage {
  level1: Level1MT;

  constructor(level1: Level1MT) {
    super(level1);
  }

  calculateLeaf(status: KeyStatus): Field {
    return Field(status);
  }

  calculateLevel1Index({ committeeId, keyId,}: {committeeId: Field, keyId: Field}): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  getWitness(level1Index: Field): Level1Witness {
    return this.level1.getWitness(level1Index) as Level1Witness;
  }
}

export class PublicKeyStorage extends DKGStrorage {
  level1: Level1MT;
  level2: Level2MT;

  constructor(level1: Level1MT, level2: Level2MT) {
    super(level1, level2);
  }

  calculateLeaf(C0: Group): Field {
    return Poseidon.hash(C0.toFields());
  }

  calculateLevel1Index({ committeeId, keyId,}: {committeeId: Field, keyId: Field}): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(
    {level1Index, level2Index}: {
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

export class Round1ContributionStorage extends DKGStrorage {
  level1: Level1MT;
  level2: Level2MT;

  constructor(level1: Level1MT, level2: Level2MT) {
    super(level1, level2);
  }

  calculateLeaf(contribution: Round1Contribution): Field {
    return contribution.hash();
  }

  calculateLevel1Index({ committeeId, keyId,}: {committeeId: Field, keyId: Field}): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(
    {level1Index, level2Index}: {
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

export class Round2ContributionStorage extends DKGStrorage {
  level1: Level1MT;
  level2: Level2MT;

  constructor(level1: Level1MT, level2: Level2MT) {
    super(level1, level2);
  }

  calculateLeaf(contribution: Round2Contribution): Field {
    return contribution.hash();
  }

  calculateLevel1Index({ committeeId, keyId,}: {committeeId: Field, keyId: Field}): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(
    {level1Index, level2Index}: {
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

export class ResponseContributionStorage extends DKGStrorage {
  level1: Level1MT;
  level2: Level2MT;

  constructor(level1: Level1MT, level2: Level2MT) {
    super(level1, level2);
  }

  calculateLeaf(contribution: ResponseContribution): Field {
    return contribution.hash();
  }

  calculateLevel1Index(
    { committeeId, keyId, requestId}: {
      committeeId: Field, 
      keyId: Field,
      requestId: Field,
    }
  ): Field {
    return Poseidon.hash([committeeId, keyId, requestId]);
  }

  calculateLevel2Index(memberId: Field): Field {
    return memberId;
  }

  getWitness(
    {level1Index, level2Index}: {
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