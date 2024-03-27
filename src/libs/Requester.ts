import { Field, Group, Poseidon, Scalar } from 'o1js';
import {
    CustomScalar,
    GroupDynamicArray,
    StaticArray,
} from '@auxo-dev/auxo-libs';
import { ENCRYPTION_LIMITS, SECRET_MAX, SECRET_UNIT } from '../constants.js';

export {
    RArray,
    MArray,
    DArray,
    SecretVector,
    RandomVector,
    RequestVector,
    ResultVector,
    NullifierArray,
    CommitmentArray,
    calculatePublicKey as calculatePublicKeyFromPoints,
    generateEncryption,
    recoverEncryption,
    accumulateEncryption,
    getResultVector,
    bruteForceResultVector,
};

class RArray extends GroupDynamicArray(ENCRYPTION_LIMITS.FULL_DIMENSION) {}
class MArray extends GroupDynamicArray(ENCRYPTION_LIMITS.FULL_DIMENSION) {}
class DArray extends GroupDynamicArray(ENCRYPTION_LIMITS.FULL_DIMENSION) {}
class SecretVector extends StaticArray(
    CustomScalar,
    ENCRYPTION_LIMITS.DIMENSION
) {}
class RandomVector extends StaticArray(
    CustomScalar,
    ENCRYPTION_LIMITS.DIMENSION
) {}
class RequestVector extends StaticArray(Group, ENCRYPTION_LIMITS.DIMENSION) {}
class ResultVector extends StaticArray(
    CustomScalar,
    ENCRYPTION_LIMITS.DIMENSION
) {}
class NullifierArray extends StaticArray(Field, ENCRYPTION_LIMITS.DIMENSION) {}
class CommitmentArray extends StaticArray(Field, ENCRYPTION_LIMITS.DIMENSION) {}
type SecretNote = {
    index: Field;
    nullifier: Field;
    commitment: Field;
};

function calculatePublicKey(contributedPublicKeys: Group[]): Group {
    let result = Group.zero;
    for (let i = 0; i < contributedPublicKeys.length; i++) {
        result = result.add(contributedPublicKeys[i]);
    }
    return result;
}

function generateEncryption(
    publicKey: Group,
    vector: bigint[]
): {
    r: Scalar[];
    R: Group[];
    M: Group[];
    notes: SecretNote[];
} {
    let dimension = vector.length;
    let r = new Array<Scalar>(dimension);
    let R = new Array<Group>(dimension);
    let M = new Array<Group>(dimension);
    let notes = new Array<SecretNote>(dimension);
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
        let nullifier = Field.random();
        notes[i] = {
            index: Field(i),
            nullifier: nullifier,
            commitment: Poseidon.hash(
                [
                    nullifier,
                    Field(index),
                    CustomScalar.fromScalar(Scalar.from(vector[i])).toFields(),
                ].flat()
            ),
        };
    }
    if (index == -1) throw new Error('Incorrect secret vector');
    return { r, R, M, notes };
}

function recoverEncryption(
    r: Scalar[],
    publicKey: Group,
    vector: bigint[]
): {
    R: Group[];
    M: Group[];
    notes: SecretNote[];
} {
    let dimension = vector.length;
    let R = new Array<Group>(dimension);
    let M = new Array<Group>(dimension);
    let notes = new Array<SecretNote>(dimension);
    let index = -1;
    for (let i = 0; i < dimension; i++) {
        let random = r[i];
        R[i] = Group.generator.scale(random);
        M[i] =
            vector[i] > 0n
                ? Group.generator
                      .scale(Scalar.from(vector[i]))
                      .add(publicKey.scale(random))
                : Group.zero.add(publicKey.scale(random));
        index = i;
        let nullifier = Field.random();
        notes[i] = {
            index: Field(i),
            nullifier: nullifier,
            commitment: Poseidon.hash(
                [
                    nullifier,
                    Field(index),
                    CustomScalar.fromScalar(Scalar.from(vector[i])).toFields(),
                ].flat()
            ),
        };
    }
    return { R, M, notes };
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

function getResultVector(D: Group[], M: Group[]): Group[] {
    let result = Array<Group>(M.length);
    for (let i = 0; i < result.length; i++) {
        result[i] = M[i].sub(D[i]);
    }
    return result;
}

function bruteForceResultVector(resultVector: Group[]): Scalar[] {
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
