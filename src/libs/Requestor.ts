import { Group, Scalar } from 'o1js';
import { GroupDynamicArray } from '@auxo-dev/auxo-libs';
import { REQUEST_MAX_SIZE } from '../constants.js';

export class MArray extends GroupDynamicArray(REQUEST_MAX_SIZE) {}
export class RArray extends GroupDynamicArray(REQUEST_MAX_SIZE) {}
export class DArray extends GroupDynamicArray(REQUEST_MAX_SIZE) {}

export function calculatePublicKey(contributedPublicKeys: Group[]): Group {
  let result = Group.zero;
  for (let i = 0; i < contributedPublicKeys.length; i++) {
    result = result.add(contributedPublicKeys[i]);
  }
  return result;
}

export function generateEncryption(
  publicKey: Group,
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
            .add(publicKey.scale(random))
        : Group.zero.add(publicKey.scale(random));
  }
  return { r, R, M };
}

export function accumulateEncryption(
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
