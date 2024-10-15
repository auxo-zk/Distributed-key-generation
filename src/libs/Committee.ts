import { Field, Group, Poseidon, PrivateKey, PublicKey, Scalar } from 'o1js';
import { ECElGamal } from '@auxo-dev/o1js-encrypt';
import {
    Cipher,
    KeyGenContribution,
    MemberFieldArray,
    MemberGroupArray,
    ResponseContribution,
    SecretPolynomial,
    ThresholdGroupArray,
} from './types.js';

export {
    calculatePublicKey,
    calculatePublicKey as calculatePublicKeyFromContribution,
    calculatePolynomialValue,
    calculateShareCommitment,
    generateRandomPolynomial,
    recoverSecretPolynomial,
    getKeyGenContribution,
    getSecretShare,
    getResponseContribution,
    getLagrangeCoefficient,
    accumulateResponses,
};

function calculatePublicKey(arr: ThresholdGroupArray[]): Group {
    let result = Group.zero;
    for (let i = 0; i < Number(arr.length); i++) {
        result = result.add(arr[i].get(Field(0)));
    }
    return result;
}

function calculateShareCommitment(secret: Field, memberId: Field) {
    return Poseidon.hash([secret, memberId]);
}

function calculatePolynomialValue(a: Field[], x: number): Field {
    let result = a[0];
    for (let i = 1; i < a.length; i++) {
        result = result.add(a[i].mul(Field(Math.pow(x, i))));
    }
    return result;
}

function generateRandomPolynomial(T: number, N: number): SecretPolynomial {
    let a = new Array<Field>(T);
    let C = new Array<Group>(T);
    for (let i = 0; i < T; i++) {
        a[i] = Field.random();
        C[i] = Group.generator.scale(a[i]);
    }
    let f = new Array<Field>(N);
    for (let i = 0; i < N; i++) {
        f[i] = calculatePolynomialValue(a, i + 1);
    }
    return { a, C, f };
}

function recoverSecretPolynomial(
    a: Field[],
    T: number,
    N: number
): SecretPolynomial {
    let C = new Array<Group>(T);
    for (let i = 0; i < T; i++) {
        C[i] = Group.generator.scale(a[i]);
    }
    let f = new Array<Field>(N);
    for (let i = 0; i < N; i++) {
        f[i] = calculatePolynomialValue(a, i + 1);
    }
    return { a, C, f };
}

function getKeyGenContribution(
    secret: SecretPolynomial,
    memberId: number,
    pubKeys: PublicKey[],
    randoms: Field[]
) {
    let C = ThresholdGroupArray.from(secret.C);
    let cArr = new Array<Field>(secret.f.length);
    let UArr = new Array<Group>(secret.f.length);
    for (let i = 0; i < secret.f.length; i++) {
        if (i == memberId) {
            cArr[i] = Field(0n);
            UArr[i] = Group.zero;
        } else {
            let encryption = ECElGamal.Lib.encrypt(
                secret.f[i],
                pubKeys[i].toGroup(),
                randoms[i]
            );
            cArr[i] = encryption.c;
            UArr[i] = encryption.U;
        }
    }
    let c = MemberFieldArray.from(cArr);
    let U = MemberGroupArray.from(UArr);
    return new KeyGenContribution({ C, c, U });
}

function getSecretShare(
    secret: SecretPolynomial,
    memberId: number,
    ciphers: Cipher[],
    prvKey: PrivateKey
): { share: Field; commitment: Field } {
    let decryptions: Field[] = ciphers.map((data, id) =>
        id == memberId
            ? secret.f[memberId]
            : ECElGamal.Lib.decrypt(data.c, data.U, prvKey.s).m
    );
    let share: Field = decryptions.reduce(
        (prev: Field, curr: Field) => prev.add(curr),
        Field(0n)
    );
    let commitment = calculateShareCommitment(share, Field(memberId));
    return { share, commitment };
}

function getResponseContribution(
    share: Field,
    R: Group[]
): ResponseContribution {
    let D = new Array<Group>(R.length).fill(Group.zero);
    for (let i = 0; i < R.length; i++) {
        if (!R[i].equals(Group.zero).toBoolean()) D[i] = R[i].scale(share);
    }
    return new ResponseContribution(D);
}

function getLagrangeCoefficient(memberIds: number[]): Scalar[] {
    const threshold = memberIds.length;
    let lagrangeCoefficient = new Array<Scalar>(threshold);
    for (let i = 0; i < threshold; i++) {
        let indexI = memberIds[i] + 1;
        let numerator = Scalar.from(1);
        let denominator = Scalar.from(1);
        for (let j = 0; j < threshold; j++) {
            let indexJ = memberIds[j] + 1;
            if (indexI == indexJ) continue;
            numerator = numerator.mul(Scalar.from(indexJ));
            denominator = denominator.mul(Scalar.from(indexJ - indexI));
        }
        lagrangeCoefficient[i] = numerator.div(denominator);
    }
    return lagrangeCoefficient;
}

function accumulateResponses(memberIds: number[], D: Group[][]): Group[] {
    let lagrangeCoefficient = getLagrangeCoefficient(memberIds);
    let threshold = memberIds.length;
    let sumD = Array<Group>(D[0].length);
    sumD.fill(Group.zero);
    for (let i = 0; i < threshold; i++) {
        for (let j = 0; j < sumD.length; j++) {
            if (!D[i][j].isZero().toBoolean())
                sumD[j] = sumD[j].add(D[i][j].scale(lagrangeCoefficient[i]));
        }
    }
    return sumD;
}
