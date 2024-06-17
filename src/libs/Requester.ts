import {
    Field,
    Group,
    Poseidon,
    PublicKey,
    Scalar,
    Struct,
    UInt32,
    UInt8,
} from 'o1js';
import {
    CustomScalar,
    GroupDynamicArray,
    StaticArray,
    Utils,
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
    SecretNote,
    calculatePublicKey as calculatePublicKeyFromPoints,
    calculateCommitment,
    calculateTaskReference,
    generateEncryption,
    // recoverEncryption,
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
    ENCRYPTION_LIMITS.FULL_DIMENSION
) {}
class NullifierArray extends StaticArray(Field, ENCRYPTION_LIMITS.DIMENSION) {}
class CommitmentArray extends StaticArray(Field, ENCRYPTION_LIMITS.DIMENSION) {}
class SecretNote extends Struct({
    taskId: UInt32,
    index: UInt8,
    nullifier: Field,
    commitment: Field,
}) {}

function calculatePublicKey(contributedPublicKeys: Group[]): Group {
    let result = Group.zero;
    for (let i = 0; i < contributedPublicKeys.length; i++) {
        result = result.add(contributedPublicKeys[i]);
    }
    return result;
}

function calculateCommitment(
    nullifier: Field,
    taskId: UInt32,
    index: UInt8,
    secret: CustomScalar
) {
    return Poseidon.hash(
        [nullifier, taskId.value, index.value, secret.toFields()].flat()
    );
}

function calculateTaskReference(requester: PublicKey, taskId: UInt32) {
    return Poseidon.hash([requester.toFields(), taskId.value].flat());
}

function generateEncryption(
    taskId: number,
    publicKey: Group,
    vector: { [key: number | string]: bigint | undefined }
): {
    indices: number[];
    packedIndices: Field;
    secrets: SecretVector;
    randoms: RandomVector;
    nullifiers: NullifierArray;
    R: Group[];
    M: Group[];
    notes: SecretNote[];
} {
    if (Object.keys(vector).length > ENCRYPTION_LIMITS.DIMENSION)
        throw new Error('Exceeds limit for submission dimension!');
    let secrets = new SecretVector();
    let randoms = new RandomVector();
    let indices: number[] = [];
    let nullifiers = new NullifierArray();
    let notes: SecretNote[] = [];
    let R = new Array<Group>(ENCRYPTION_LIMITS.FULL_DIMENSION).fill(Group.zero);
    let M = new Array<Group>(ENCRYPTION_LIMITS.FULL_DIMENSION).fill(Group.zero);

    Object.entries(vector).map(([key, value], i) => {
        if (value === undefined || value < 0n)
            throw new Error('Negative value is not allowed!');

        let secret = Scalar.from(value);
        let random = Scalar.random();
        let nullifier = Field.random();
        indices.push(Number(key));
        secrets.set(Field(i), CustomScalar.fromScalar(secret));
        randoms.set(Field(i), CustomScalar.fromScalar(random));
        nullifiers.set(Field(i), nullifier);
        let index = UInt8.from(Number(key));
        let commitment = calculateCommitment(
            nullifier,
            UInt32.from(taskId),
            index,
            CustomScalar.fromScalar(secret)
        );
        if (value > 0n)
            notes.push({
                taskId: UInt32.from(taskId),
                index,
                nullifier,
                commitment,
            });

        R[Number(key)] = Group.generator.scale(random);
        M[Number(key)] =
            value > 0n
                ? Group.generator.scale(secret).add(publicKey.scale(random))
                : Group.zero.add(publicKey.scale(random));
    });

    for (
        let i = Object.keys(vector).length;
        i < ENCRYPTION_LIMITS.DIMENSION;
        i++
    ) {
        let freeIndices = [
            ...Array(ENCRYPTION_LIMITS.FULL_DIMENSION).keys(),
        ].filter((e) => !indices.includes(e));
        let randomIndex =
            freeIndices[Math.floor(Math.random() * freeIndices.length)];

        let secret = Scalar.from(0);
        let random = Scalar.random();
        let nullifier = Field.random();
        indices.push(Number(randomIndex));
        secrets.set(Field(i), CustomScalar.fromScalar(secret));
        randoms.set(Field(i), CustomScalar.fromScalar(random));
        nullifiers.set(Field(i), nullifier);
        R[randomIndex] = Group.generator.scale(random);
        M[randomIndex] = Group.zero.add(publicKey.scale(random));
    }

    let packedIndices = Utils.packNumberArray(indices, 8);
    return {
        indices,
        packedIndices,
        secrets,
        randoms,
        nullifiers,
        R,
        M,
        notes,
    };
}

// function recoverEncryption(
//     taskIndex: number,
//     publicKey: Group,
//     r: Scalar[],
//     vector: { [key: number | string]: bigint | undefined }
// ): {
//     packedIndices: Field;
//     R: Group[];
//     M: Group[];
//     notes: SecretNote[];
// } {
//     let dimension = vector.length;
//     let R = new Array<Group>(dimension);
//     let M = new Array<Group>(dimension);
//     let notes = new Array<SecretNote>(dimension);
//     let packedIndices = Utils.packNumberArray(indices, 8);
//     for (let i = 0; i < dimension; i++) {
//         let random = r[i];
//         R[i] = Group.generator.scale(random);
//         M[i] =
//             vector[i] > 0n
//                 ? Group.generator
//                       .scale(Scalar.from(vector[i]))
//                       .add(publicKey.scale(random))
//                 : Group.zero.add(publicKey.scale(random));
//         let nullifier = Field.random();
//         let taskId = Field(taskIndex);
//         let index = Field(indices[i]);
//         // let commitment = calculateCommitment(
//         //     nullifier,
//         //     taskId,
//         //     index,
//         //     CustomScalar.fromScalar(Scalar.from(vector[i]))
//         // );
//         // notes[i] = { taskId, index, nullifier, commitment };
//     }
//     return { packedIndices, R, M, notes };
// }

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

function bruteForceResultVector(
    resultVector: Group[],
    unitValue = SECRET_UNIT,
    maxValue = SECRET_MAX
): Scalar[] {
    let dimension = resultVector.length;
    let rawResult = [...Array(dimension).keys()].map(() => Scalar.from(0));
    let coefficient = [...Array(dimension).keys()].map(() => BigInt(0));

    [...Array(dimension).keys()].map((i) => {
        let found = false;
        let targetPoint = resultVector[i];
        while (!found) {
            let testingValue = Scalar.from(coefficient[i] * BigInt(unitValue));
            found = targetPoint
                .sub(Group.generator.scale(testingValue))
                .equals(Group.zero)
                .toBoolean();

            if (found) rawResult[i] = testingValue;
            else {
                coefficient[i] += BigInt(1);
                if (testingValue.toBigInt() == BigInt(maxValue))
                    throw new Error('No valid value found!');
            }
        }
    });

    return rawResult;
}
