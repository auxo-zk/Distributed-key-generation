import { Field, Group, Poseidon, PublicKey } from 'o1js';
import { ECElGamal } from '@auxo-dev/o1js-encrypt';
import { ENC_LIMITS } from '../constants.js';
import {
    EncryptionConfig,
    EncryptionIndices,
    EncryptionMode,
    EncryptionNote,
    SecretNote,
    SubVectorFieldArray,
    SubVectorGroupArray,
} from './types.js';

export {
    calculatePublicKey as calculatePublicKeyFromPoints,
    calculateTaskReference,
    getEncryptionConfig,
    generateEncryption,
    accumulateEncryption,
    getResultVector,
    convertToBase,
    bruteForceResult,
};

function calculatePublicKey(C0: Group[]): Group {
    let result = Group.zero;
    for (let i = 0; i < C0.length; i++) {
        result = result.add(C0[i]);
    }
    return result;
}

function calculateTaskReference(requester: PublicKey, taskId: Field) {
    return Poseidon.hash([requester.toFields(), taskId].flat());
}

function getEncryptionConfig(
    vecDim: number,
    maxSubmission: number,
    minValue: number,
    maxValue: number,
    step: number
): EncryptionConfig {
    if (
        vecDim < 1 ||
        maxSubmission < 1 ||
        minValue < 0 ||
        maxValue < 0 ||
        step < 1
    )
        throw new Error('Invalid input for encryption config!');
    let d = Field(
        Math.round(vecDim / ENC_LIMITS.SUB_DIMENSION) * ENC_LIMITS.SUB_DIMENSION
    );
    let l = Field(maxSubmission);
    let n = Field(Math.floor((maxValue - minValue) / step) + 1);
    let config = EncryptionConfig.packConfig(n, l, d);
    config.assertCorrect();
    return config;
}

function generateEncryption(
    taskId: number,
    publicKey: Group,
    vector: { [key: number | string]: bigint | undefined },
    config: EncryptionConfig,
    mode = EncryptionMode.OPTIMIZED_PRIVACY
): {
    notes: EncryptionNote[];
    secretNotes: SecretNote[];
    nullifiers: SubVectorFieldArray[];
} {
    config.assertCorrect();
    let { d } = config;

    if (Object.keys(vector).length > ENC_LIMITS.DIMENSION)
        throw new Error('Exceeds limit for number of encrypting index!');

    let notes: EncryptionNote[] = [];
    let secretNotes: SecretNote[] = [];
    let nullifiers: SubVectorFieldArray[] = [];

    if (mode === EncryptionMode.OPTIMIZED_PRIVACY) {
        for (let i = 0; i < Number(d) / ENC_LIMITS.SUB_DIMENSION; i++) {
            let R = new Array<Group>(ENC_LIMITS.SUB_DIMENSION).fill(Group.zero);
            let M = new Array<Group>(ENC_LIMITS.SUB_DIMENSION).fill(Group.zero);
            let nulls = new Array<Field>(ENC_LIMITS.SUB_DIMENSION).fill(
                Field(0)
            );
            let coms = new Array<Field>(ENC_LIMITS.SUB_DIMENSION).fill(
                Field(0)
            );
            let startIndex = Field.from(i * ENC_LIMITS.SUB_DIMENSION);
            let isEmpty = true;
            for (let j = 0; j < ENC_LIMITS.SUB_DIMENSION; j++) {
                let index = j + i * ENC_LIMITS.SUB_DIMENSION;
                let value = vector[index] || 0;
                if (value < 0n)
                    throw new Error('Negative value is not allowed!');
                let secret = Field(value);
                let random = Field.random();
                let note = SecretNote.new(Field(taskId), Field(index), secret);
                if (value > 0n) {
                    secretNotes.push(note);
                    isEmpty = false;
                }
                R[j] = R[j].add(Group.generator.scale(random));
                M[j] = M[j].add(
                    Group.generator.scale(secret).add(publicKey.scale(random))
                );
                nulls[j] = note.nullifier;
                coms[j] = note.commitment(PublicKey.empty());
            }
            if (isEmpty) continue;
            let indices = EncryptionNote.packIndices(
                new EncryptionIndices(
                    [...Array(ENC_LIMITS.SUB_DIMENSION).keys()].map((e) =>
                        Field(e).add(startIndex)
                    )
                )
            );
            notes.push(
                new EncryptionNote({
                    indices,
                    R: new SubVectorGroupArray(R),
                    M: new SubVectorGroupArray(M),
                    commitments: new SubVectorFieldArray(coms),
                })
            );
            nullifiers.push(new SubVectorFieldArray(nulls));
        }
    } else if (mode === EncryptionMode.OPTIMIZED_TXS) {
        let keys: number[] = Object.keys(vector).map((e) => Number(e));
        let numTxs = Math.ceil(keys.length / ENC_LIMITS.SUB_DIMENSION);
        let globalIndices: number[] = [];
        for (let i = 0; i < numTxs; i++) {
            let R = new Array<Group>(ENC_LIMITS.SUB_DIMENSION).fill(Group.zero);
            let M = new Array<Group>(ENC_LIMITS.SUB_DIMENSION).fill(Group.zero);
            let nulls = new Array<Field>(ENC_LIMITS.SUB_DIMENSION).fill(
                Field(0)
            );
            let coms = new Array<Field>(ENC_LIMITS.SUB_DIMENSION).fill(
                Field(0)
            );
            let indices: Field[] = [];
            for (let j = 0; j < ENC_LIMITS.SUB_DIMENSION; j++) {
                let secret = Field(0);
                let random = Field.random();
                let index = 0;
                if (j + i * ENC_LIMITS.SUB_DIMENSION < keys.length) {
                    index = keys[j + i * ENC_LIMITS.SUB_DIMENSION];
                    let value = vector[index] || 0;
                    if (value <= 0n) continue;
                    secret = Field(value);
                } else {
                    while (index in globalIndices || index == Number(d)) {
                        index = Math.round(Math.random() * Number(d));
                    }
                }
                globalIndices.push(index);
                indices.push(Field(index));
                let note = SecretNote.new(Field(taskId), Field(index), secret);
                secretNotes.push(note);
                R[j] = R[j].add(Group.generator.scale(random));
                M[j] = M[j].add(
                    Group.generator.scale(secret).add(publicKey.scale(random))
                );
                nulls[j] = note.nullifier;
                coms[j] = note.commitment(PublicKey.empty());
            }
            notes.push(
                new EncryptionNote({
                    indices: EncryptionNote.packIndices(
                        new EncryptionIndices(indices)
                    ),
                    R: new SubVectorGroupArray(R),
                    M: new SubVectorGroupArray(M),
                    commitments: new SubVectorFieldArray(coms),
                })
            );
            nullifiers.push(new SubVectorFieldArray(nulls));
        }
    } else throw new Error('Invalid encryption mode!');

    return { notes, secretNotes, nullifiers };
}

function accumulateEncryption(
    R: Group[][],
    M: Group[][]
): { sumR: Group[]; sumM: Group[] } {
    if (R.length !== M.length || R[0].length !== M[0].length)
        throw new Error('Mismatch in length of ciphertext!');

    let sumR = new Array<Group>(Number(R[0].length)).fill(Group.zero);
    let sumM = new Array<Group>(Number(M[0].length)).fill(Group.zero);

    for (let j = 0; j < M.length; j++) {
        for (let k = 0; k < M[0].length; k++) {
            sumR[k] = sumR[k].add(R[j][k]);
            sumM[k] = sumM[k].add(M[j][k]);
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

function convertToBase(number: number, base: number): number[] {
    if (number < 0) {
        throw new Error('The number must be non-negative!');
    }
    const digits: number[] = [];
    while (number > 0) {
        digits.push(number % base);
        number = Math.floor(number / base);
    }
    return digits;
}

function bruteForceResult(
    resultVector: Group[],
    config: EncryptionConfig
): Field[] {
    let { d } = config;
    let babySteps = new Map<string, bigint>();
    ECElGamal.Lib.loadBabySteps(
        `src/libs/helpers/babySteps-1e${Math.ceil(
            Math.log10(Math.sqrt(ENC_LIMITS.RESULT))
        )}.txt`
    ).map((babyStep) => {
        babySteps.set(babyStep[0].toString(), babyStep[1]);
    });
    let result: Field[] = [];
    for (let i = 0; i < Number(d); i++) {
        result.push(
            ECElGamal.Lib.babyStepGiantStep(
                resultVector[i],
                babySteps,
                1n,
                BigInt(ENC_LIMITS.RESULT)
            )
        );
    }
    return result;
}
