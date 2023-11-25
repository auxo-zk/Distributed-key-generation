import {
  Field,
  Group,
  Poseidon,
  PrivateKey,
  PublicKey,
  Scalar,
  Struct,
} from 'o1js';
import {
  Bit255,
  Bit255DynamicArray,
  FieldDynamicArray,
  GroupDynamicArray,
  PublicKeyDynamicArray,
} from '@auxo-dev/auxo-libs';
import { DArray } from './Requestor.js';
import * as ElgamalECC from './Elgamal.js';
import { COMMITTEE_MAX_SIZE } from '../constants.js';

/* ========== CONSTANTS, TYPES, & STRUCTS ========== */

export class MemberArray extends PublicKeyDynamicArray(COMMITTEE_MAX_SIZE) {}
export class CArray extends GroupDynamicArray(COMMITTEE_MAX_SIZE) {}
export class cArray extends Bit255DynamicArray(COMMITTEE_MAX_SIZE) {}
export class UArray extends GroupDynamicArray(COMMITTEE_MAX_SIZE) {}
export class PublicKeyArray extends GroupDynamicArray(COMMITTEE_MAX_SIZE) {}
export class EncryptionHashArray extends FieldDynamicArray(
  COMMITTEE_MAX_SIZE
) {}

export type SecretPolynomial = {
  a: Scalar[];
  C: Group[];
  f: Scalar[];
};

export type Round2Data = {
  c: Bit255;
  U: Group;
};

export class Round1Contribution extends Struct({
  C: CArray,
}) {
  static empty(): Round1Contribution {
    return new Round1Contribution({
      C: new CArray(),
    });
  }

  toFields(): Field[] {
    return this.C.toFields();
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}

export class Round2Contribution extends Struct({
  c: cArray,
  U: UArray,
}) {
  static empty(): Round2Contribution {
    return new Round2Contribution({
      c: new cArray(),
      U: new UArray(),
    });
  }

  toFields(): Field[] {
    return this.c.toFields().concat(this.U.toFields());
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}

export class ResponseContribution extends Struct({
  D: DArray,
}) {
  static empty(): ResponseContribution {
    return new ResponseContribution({
      D: new DArray(),
    });
  }

  toFields(): Field[] {
    return this.D.toFields();
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}

/* ========== FUNCTIONS ========== */

export function calculatePublicKey(
  round1Contributions: Round1Contribution[]
): Group {
  let result = Group.zero;
  for (let i = 0; i < round1Contributions.length; i++) {
    result = result.add(round1Contributions[i].C.values[0]);
  }
  return result;
}

export function calculatePolynomialValue(a: Scalar[], x: number): Scalar {
  let result = Scalar.from(a[0]);
  for (let i = 1; i < a.length; i++) {
    result = result.add(a[i].mul(Scalar.from(Math.pow(x, i))));
  }
  return result;
}

export function generateRandomPolynomial(
  T: number,
  N: number
): SecretPolynomial {
  let a = new Array<Scalar>(T);
  let C = new Array<Group>(T);
  for (let i = 0; i < T; i++) {
    a[i] = Scalar.random();
    C[i] = Group.generator.scale(a[i]);
  }
  let f = new Array<Scalar>(N);
  for (let i = 0; i < N; i++) {
    f[i] = calculatePolynomialValue(a, i + 1);
  }
  return { a, C, f };
}

export function getRound1Contribution(
  secret: SecretPolynomial
): Round1Contribution {
  let provableC = CArray.from(secret.C);
  return new Round1Contribution({ C: provableC });
}

export function getRound2Contribution(
  secret: SecretPolynomial,
  index: number,
  round1Contributions: Round1Contribution[],
  randoms: Scalar[]
): Round2Contribution {
  let data = new Array<Round2Data>(secret.f.length);
  let c = new Array<Bit255>(secret.f.length);
  let U = new Array<Group>(secret.f.length);
  for (let i = 0; i < data.length; i++) {
    if (i + 1 == index) {
      c[i] = Bit255.fromBigInt(0n);
      U[i] = Group.zero;
    } else {
      let encryption = ElgamalECC.encrypt(
        secret.f[i],
        round1Contributions[i].C.values[0],
        randoms[i]
      );
      c[i] = encryption.c;
      U[i] = encryption.U;
    }
  }
  let provablec = cArray.from(c);
  let provableU = UArray.from(U);
  return new Round2Contribution({ c: provablec, U: provableU });
}

export function getResponseContribution(
  secret: SecretPolynomial,
  index: number,
  round2Data: Round2Data[],
  R: Group[]
): [ResponseContribution, Scalar] {
  let decryptions: Scalar[] = round2Data.map((data) =>
    Scalar.from(ElgamalECC.decrypt(data.c, data.U, secret.a[0]).m)
  );
  let ski: Scalar = decryptions.reduce(
    (prev: Scalar, curr: Scalar) => prev.add(curr),
    secret.f[index]
  );

  let D = new Array<Group>(R.length);
  for (let i = 0; i < R.length; i++) {
    D[i] = R[i].scale(ski);
  }
  return [new ResponseContribution({ D: DArray.from(D) }), ski];
}

export function getLagrangeCoefficient(listIndex: number[]): Scalar[] {
  const threshold = listIndex.length;
  let lagrangeCoefficient = new Array<Scalar>(threshold);
  for (let i = 0; i < threshold; i++) {
    let indexI = listIndex[i];
    let numerator = Scalar.from(1);
    let denominator = Scalar.from(1);
    for (let j = 0; j < threshold; j++) {
      let indexJ = listIndex[j];
      if (indexI != indexJ) {
        numerator = numerator.mul(Scalar.from(indexJ));
        denominator = denominator.mul(Scalar.from(indexJ - indexI));
      }
    }
    lagrangeCoefficient[i] = numerator.div(denominator);
  }
  return lagrangeCoefficient;
}

export function getResultVector(
  listIndex: number[],
  D: Group[][],
  M: Group[]
): Group[] {
  let lagrangeCoefficient = getLagrangeCoefficient(listIndex);
  let threshold = listIndex.length;
  let sumD = Array<Group>(M.length);
  sumD.fill(Group.zero);
  for (let i = 0; i < threshold; i++) {
    for (let j = 0; j < sumD.length; j++) {
      sumD[j] = sumD[j].add(D[i][j].scale(lagrangeCoefficient[i]));
    }
  }
  // console.log(sumD);
  let result = Array<Group>(M.length);
  for (let i = 0; i < result.length; i++) {
    result[i] = M[i].sub(sumD[i]);
  }
  return result;
}
