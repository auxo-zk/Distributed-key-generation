import { Field, Group, Poseidon, PublicKey, Scalar, UInt32, UInt8 } from 'o1js';
import { ECElGamal } from '@auxo-dev/o1js-encrypt';
import { ENC_LIMITS } from '../constants.js';
import { EncryptionConfig, SecretNote } from './types.js';

export {
    calculatePublicKey as calculatePublicKeyFromPoints,
    calculateTaskReference,
    generateEncryption,
    accumulateEncryption,
    getResultVector,
    bruteForceResult,
};

function calculatePublicKey(contributedPublicKeys: Group[]): Group {
    let result = Group.zero;
    for (let i = 0; i < contributedPublicKeys.length; i++) {
        result = result.add(contributedPublicKeys[i]);
    }
    return result;
}

function calculateTaskReference(requester: PublicKey, taskId: UInt32) {
    return Poseidon.hash([requester.toFields(), taskId.value].flat());
}

function generateEncryption(
    taskId: number,
    publicKey: Group,
    vector: { [key: number | string]: bigint | undefined },
    config: EncryptionConfig
): {
    R: Group[];
    M: Group[];
    notes: SecretNote[];
    fakeNotes: SecretNote[];
} {
    if (Object.keys(vector).length > ENC_LIMITS.DIMENSION)
        throw new Error('Exceeds limit for number of encrypting index!');
    let { base, d, splitSize } = config;
    let notes: SecretNote[] = [];
    let fakeNotes: SecretNote[] = [];
    let R = new Array<Group>(ENC_LIMITS.SPLIT).fill(Group.zero);
    let M = new Array<Group>(ENC_LIMITS.SPLIT).fill(Group.zero);
    let indices: number[] = [];

    for (let i = 0; i < Number(d); i++) {
        let value = vector[i] || 0;
        if (value < 0n) throw new Error('Negative value is not allowed!');
        let splitIdx = Math.floor(i / Number(splitSize));
        let localIdx = i % Number(splitSize);
        let secret = Field(value);
        let random = Field.random();
        let note = SecretNote.new(UInt32.from(taskId), UInt8.from(i), secret);
        if (value > 0n) {
            notes.push(note);
            indices.push(i);
        }
        R[splitIdx] = R[splitIdx].add(Group.generator.scale(random));
        M[splitIdx] = M[splitIdx].add(
            Group.generator
                .scale(secret.mul(Field(base.toBigInt() ** BigInt(localIdx))))
                .add(publicKey.scale(random))
        );
    }

    for (
        let i = Object.keys(vector).length;
        i < Math.ceil(Math.sqrt(ENC_LIMITS.DIMENSION));
        i++
    ) {
        let freeIndices = [...Array(ENC_LIMITS.DIMENSION).keys()].filter(
            (e) => !indices.includes(e)
        );
        let randomIndex =
            freeIndices[Math.floor(Math.random() * freeIndices.length)];

        let note = SecretNote.new(
            UInt32.from(taskId),
            UInt8.from(randomIndex),
            Field(0)
        );
        indices.push(randomIndex);
        fakeNotes.push(note);
    }

    return { R, M, notes, fakeNotes };
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
): Scalar[] {
    let { base, c, d } = config;
    let babySteps = new Map<string, bigint>();
    ECElGamal.Lib.loadBabySteps(
        `src/libs/helpers/babySteps-1e${Math.ceil(
            Math.log10(Math.sqrt(ENC_LIMITS.RESULT))
        )}.txt`
    ).map((babyStep) => {
        babySteps.set(babyStep[0].toString(), babyStep[1]);
    });
    let result: Scalar[] = [];
    for (let i = 0; i < Number(c); i++) {
        let combinedResult = ECElGamal.Lib.babyStepGiantStep(
            resultVector[i],
            babySteps,
            1n,
            BigInt(ENC_LIMITS.RESULT)
        );
        let rawResult = convertToBase(
            Number(combinedResult.toBigInt()),
            Number(base)
        );
        let splitSize = Number(d) / Number(c);
        if (rawResult.length > splitSize)
            throw new Error('Brute force result exceeds specified dimension!');
        result.push(
            ...rawResult
                .map((e) => Scalar.from(e))
                .concat(
                    [...Array(splitSize - rawResult.length)].map(() =>
                        Scalar.from(0)
                    )
                )
        );
    }
    return result;
}
