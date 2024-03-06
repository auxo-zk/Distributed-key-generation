import { Field, Group, Nullifier, Poseidon, Scalar } from 'o1js';
import {
    FieldDynamicArray,
    GroupDynamicArray,
    ScalarDynamicArray,
} from '@auxo-dev/auxo-libs';
import { SECRET_MAX, SECRET_UNIT, REQUEST_MAX_SIZE } from '../constants.js';

export class MArray extends GroupDynamicArray(REQUEST_MAX_SIZE) {}
export class RArray extends GroupDynamicArray(REQUEST_MAX_SIZE) {}
export class DArray extends GroupDynamicArray(REQUEST_MAX_SIZE) {}
export class skArray extends ScalarDynamicArray(REQUEST_MAX_SIZE) {}
export class RequestVector extends GroupDynamicArray(REQUEST_MAX_SIZE) {}
export class SecretVector extends ScalarDynamicArray(REQUEST_MAX_SIZE) {}
export class RandomVector extends ScalarDynamicArray(REQUEST_MAX_SIZE) {}
export class CommitmentVector extends FieldDynamicArray(REQUEST_MAX_SIZE) {}

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
    nullifier: Field;
    commitment: Field;
} {
    let dimension = vector.length;
    let r = new Array<Scalar>(dimension);
    let R = new Array<Group>(dimension);
    let M = new Array<Group>(dimension);
    let index = -1;
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
        index = i;
    }
    if (index == -1) throw new Error('Incorrect secret vector');
    let nullifier = Field.random();
    let commitment = Poseidon.hash([
        nullifier,
        Field(index),
        Field.from(vector[index]),
    ]);
    return { r, R, M, nullifier, commitment };
}

export function generateEncryptionWithRandomInput(
    r: Scalar[],
    publicKey: Group,
    vector: bigint[]
): {
    R: Group[];
    M: Group[];
} {
    let dimension = vector.length;
    let R = new Array<Group>(dimension);
    let M = new Array<Group>(dimension);
    for (let i = 0; i < dimension; i++) {
        let random = r[i];
        R[i] = Group.generator.scale(random);
        M[i] =
            vector[i] > 0n
                ? Group.generator
                      .scale(Scalar.from(vector[i]))
                      .add(publicKey.scale(random))
                : Group.zero.add(publicKey.scale(random));
    }
    return { R, M };
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

export function getResultVector(D: Group[], M: Group[]): Group[] {
    let result = Array<Group>(M.length);
    for (let i = 0; i < result.length; i++) {
        result[i] = M[i].sub(D[i]);
    }
    return result;
}

export function bruteForceResultVector(resultVector: Group[]): Scalar[] {
    let dimension = resultVector.length;
    let rawResult = [...Array(dimension).keys()].map(() => Scalar.from(0));
    let coefficient = [...Array(dimension).keys()].map(() => BigInt(0));

    [...Array(dimension).keys()].map((i) => {
        let found = false;
        let targetPoint = resultVector[i];
        while (!found) {
            let testingValue = Scalar.from(
                coefficient[i] * BigInt(SECRET_UNIT)
            );
            found = targetPoint
                .sub(Group.generator.scale(testingValue))
                .equals(Group.zero)
                .toBoolean();

            if (found) rawResult[i] = testingValue;
            else {
                coefficient[i] += BigInt(1);
                if (testingValue.toBigInt() == BigInt(SECRET_MAX))
                    throw new Error('No valid value found!');
            }
        }
    });

    return rawResult;
}
