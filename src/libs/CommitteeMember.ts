import {
  Bool,
  Encryption,
  Field,
  Group,
  MerkleWitness,
  Poseidon,
  PrivateKey,
  Provable,
  PublicKey,
  Scalar,
  Struct,
  UInt32,
} from 'o1js';
import * as ElgamalECC from './Elgamal';

export {
  SecretPolynomial,
  Round1Contribution,
  Round2Contribution,
  Round2Data,
  TallyContribution,
  calculatePublicKey,
  calculatePolynomialValue,
  generateRandomPolynomial,
  getRound1Contribution,
  getRound2Contribution,
  getTallyContribution,
  getLagrangeCoefficient,
  getResultVector,
  encryptVector,
  accumulateEncryption,
};

type SecretPolynomial = {
  a: Scalar[];
  C: Group[];
  f: Scalar[];
};

type Round1Contribution = {
  C: Group[];
};

type Round2Data = {
  c: bigint;
  U: Group;
};

type Round2Contribution = {
  data: Round2Data[];
};

type TallyContribution = {
  D: Group[];
};

function calculatePublicKey(
  round1Contributions: Round1Contribution[]
): PublicKey {
  let result = Group.zero;
  for (let i = 0; i < round1Contributions.length; i++) {
    result = result.add(round1Contributions[i].C[0]);
  }
  return PublicKey.fromGroup(result);
}

function calculatePolynomialValue(a: Scalar[], x: number): Scalar {
  let result = Scalar.from(a[0]);
  for (let i = 1; i < a.length; i++) {
    result = result.add(a[i].mul(Scalar.from(Math.pow(x, i))));
  }
  return result;
}

function generateRandomPolynomial(T: number, N: number): SecretPolynomial {
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

function getRound1Contribution(secret: SecretPolynomial): Round1Contribution {
  return { C: secret.C };
}

function getRound2Contribution(
  secret: SecretPolynomial,
  index: number,
  round1Contributions: Round1Contribution[]
): Round2Contribution {
  let data = new Array<Round2Data>(secret.f.length);
  for (let i = 0; i < data.length; i++) {
    if (i + 1 == index) {
      data[i] = {
        U: Group.zero,
        c: 0n,
      };
    } else {
      let encryption = ElgamalECC.encrypt(
        secret.f[i].toBigInt(),
        PublicKey.fromGroup(round1Contributions[i].C[0])
      );
      data[i] = {
        U: encryption.U,
        c: encryption.c,
      };
    }
  }
  return { data };
}

function getTallyContribution(
  secret: SecretPolynomial,
  index: number,
  round2Data: Round2Data[],
  R: Group[]
): TallyContribution {
  let decryptions: Scalar[] = round2Data.map((data) =>
    Scalar.from(
      ElgamalECC.decrypt(
        data.c,
        data.U,
        PrivateKey.fromBigInt(secret.a[0].toBigInt())
      ).m
    )
  );
  let ski: Scalar = decryptions.reduce(
    (prev: Scalar, curr: Scalar) => prev.add(curr),
    secret.f[index]
  );

  let D = new Array<Group>(R.length);
  for (let i = 0; i < R.length; i++) {
    D[i] = R[i].scale(ski);
  }
  return { D };
}

function getLagrangeCoefficient(listIndex: number[]): Scalar[] {
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

function getResultVector(
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

function encryptVector(
  publicKey: PublicKey,
  vector: bigint[]
): {
  r: Scalar[];
  R: Group[];
  M: Group[];
} {
  let dimension = vector.length;
  let r = new Array<Scalar>(dimension);
  let R = new Array<Group>(dimension);
  let M = new Array<Group>(dimension);
  for (let i = 0; i < dimension; i++) {
    let random = Scalar.random();
    r[i] = random;
    R[i] = Group.generator.scale(random);
    M[i] =
      vector[i] > 0n
        ? Group.generator
            .scale(Scalar.from(vector[i]))
            .add(publicKey.toGroup().scale(random))
        : Group.zero.add(publicKey.toGroup().scale(random));
  }
  return { r, R, M };
}

function accumulateEncryption(
  R: Group[][],
  M: Group[][]
): { sumR: Group[]; sumM: Group[] } {
  let quantity = R.length;
  let dimension = R[0].length ?? 0;
  let sumR = new Array<Group>(dimension);
  let sumM = new Array<Group>(dimension);
  sumR.fill(Group.zero);
  sumM.fill(Group.zero);

  for (let i = 0; i < quantity; i++) {
    for (let j = 0; j < dimension; j++) {
      sumR[j] = sumR[j].add(R[i][j]);
      sumM[j] = sumM[j].add(M[i][j]);
    }
  }
  return { sumR, sumM };
}
