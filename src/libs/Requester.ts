import {
    Bool,
    Field,
    Group,
    Poseidon,
    Provable,
    PublicKey,
    Scalar,
    Struct,
    UInt32,
    UInt8,
} from 'o1js';
import { GroupDynamicArray, StaticArray } from '@auxo-dev/auxo-libs';
import { ECElGamal } from '@auxo-dev/o1js-encrypt';
import { ENC_LIMITS } from '../constants.js';

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
    EncryptionConfig,
    calculatePublicKey as calculatePublicKeyFromPoints,
    calculateCommitment,
    calculateTaskReference,
    generateEncryption,
    accumulateEncryption,
    getResultVector,
    bruteForceResult,
};

class RArray extends GroupDynamicArray(ENC_LIMITS.SPLIT) {}
class MArray extends GroupDynamicArray(ENC_LIMITS.SPLIT) {}
class DArray extends GroupDynamicArray(ENC_LIMITS.SPLIT) {}
class SecretVector extends StaticArray(Scalar, ENC_LIMITS.DIMENSION) {}
class RandomVector extends StaticArray(Scalar, ENC_LIMITS.DIMENSION) {}
class RequestVector extends StaticArray(Group, ENC_LIMITS.DIMENSION) {}
class ResultVector extends StaticArray(Scalar, ENC_LIMITS.DIMENSION) {}
class NullifierArray extends StaticArray(Field, ENC_LIMITS.DIMENSION) {}
class CommitmentArray extends StaticArray(Field, ENC_LIMITS.DIMENSION) {}

class EncryptionConfig extends Struct({
    n: Field,
    l: Field,
    d: Field,
}) {
    static assertCorrect(config: EncryptionConfig) {
        let { base, c, d } = config;
        d.isEven().or(d.lessThanOrEqual(3)).assertTrue();
        c.assertLessThanOrEqual(Field(ENC_LIMITS.SPLIT));
        base.assertLessThanOrEqual(
            Provable.if(
                d.equals(3),
                Field(Math.cbrt(ENC_LIMITS.RESULT)),
                Field(Math.sqrt(ENC_LIMITS.RESULT))
            )
        );
        return Bool(true);
    }

    get c(): Field {
        return Provable.if(this.d.lessThanOrEqual(3), Field(1), this.d.div(2));
    }

    get base(): Field {
        return this.n.mul(this.l);
    }

    get splitSize(): Field {
        return this.d.div(this.c);
    }
}

class SecretNote extends Struct({
    taskId: UInt32,
    index: UInt8,
    value: Scalar,
    nullifier: Field,
    commitment: Field,
}) {
    static new(taskId: UInt32, index: UInt8, value: Scalar): SecretNote {
        let nullifier = Field.random();
        let commitment = calculateCommitment(nullifier, taskId, index, value);
        return new SecretNote({ taskId, index, value, nullifier, commitment });
    }
}

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
    secret: Scalar
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
        let secret = Scalar.from(value);
        let random = Scalar.random();
        let note = SecretNote.new(UInt32.from(taskId), UInt8.from(i), secret);
        if (value > 0n) {
            notes.push(note);
            indices.push(i);
        }
        R[splitIdx] = R[splitIdx].add(Group.generator.scale(random));
        M[splitIdx] = M[splitIdx].add(
            Group.generator
                .scale(
                    secret.mul(Scalar.from(base.toBigInt() ** BigInt(localIdx)))
                )
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
            Scalar.from(0)
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
