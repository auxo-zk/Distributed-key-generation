import {
    Field,
    Group,
    Poseidon,
    PrivateKey,
    PublicKey,
    Scalar,
    ScalarField,
} from 'o1js';
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
    calculateSecretKey,
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

function calculateShareCommitment(secret: Scalar, memberId: Field) {
    return Poseidon.hash([secret.toFields(), memberId].flat());
}

function calculatePolynomialValue(a: Scalar[], x: number): Scalar {
    let result = a[0];
    for (let i = 1; i < a.length; i++) {
        result = result.add(a[i].mul(Scalar.from(Math.pow(x, i))));
    }
    return result;
}

function generateRandomPolynomial(T: number, N: number): SecretPolynomial {
    let repeat = true;
    let a = new Array<Field>(T);
    let C = new Array<Group>(T);
    let f = new Array<Field>(N);
    while (repeat) {
        repeat = false;
        a.fill(Field(0));
        C.fill(Group.zero);
        f.fill(Field(0));
        for (let i = 0; i < T; i++) {
            a[i] = Field.random();
            C[i] = Group.generator.scale(a[i]);
        }
        for (let i = 0; i < N; i++) {
            let value = calculatePolynomialValue(
                a.map((e) => Scalar.fromField(e)),
                i + 1
            );
            if (value.toBigInt() >= Field.ORDER) {
                repeat = true;
                i = N;
            } else f[i] = Field(value.toBigInt());
        }
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
        f[i] = Field(
            calculatePolynomialValue(
                a.map((e) => Scalar.fromField(e)),
                i + 1
            ).toBigInt()
        );
    }
    return { a, C, f };
}

function getKeyGenContribution(
    secret: SecretPolynomial,
    pubKeys: PublicKey[],
    randoms: Field[]
) {
    let C = new ThresholdGroupArray(secret.C);
    let cArr = new Array<Field>(secret.f.length);
    let UArr = new Array<Group>(secret.f.length);
    for (let i = 0; i < secret.f.length; i++) {
        let encryption = ECElGamal.Lib.encrypt(
            secret.f[i],
            pubKeys[i].toGroup(),
            randoms[i]
        );
        cArr[i] = encryption.c;
        UArr[i] = encryption.U;
    }
    let c = new MemberFieldArray(cArr);
    let U = new MemberGroupArray(UArr);
    return new KeyGenContribution({ C, c, U });
}

function getSecretShare(
    memberId: number,
    ciphers: Cipher[],
    prvKey: PrivateKey
): { share: Scalar; commitment: Field } {
    let decryptions: ScalarField[] = ciphers
        .map((data) => ECElGamal.Lib.decrypt(data.c, data.U, prvKey.s).m)
        .map((e) => ScalarField.fromScalar(Scalar.fromField(e)));
    let share: Scalar = ScalarField.toScalar(
        decryptions.reduce(
            (prev: ScalarField, curr: ScalarField) =>
                new ScalarField(prev.add(curr)),
            new ScalarField(0)
        )
    );
    let commitment = calculateShareCommitment(share, Field(memberId));
    return { share, commitment };
}

function getResponseContribution(
    share: Scalar,
    R: Group[]
): ResponseContribution {
    let D = new Array<Group>(R.length).fill(Group.zero);
    for (let i = 0; i < R.length; i++) {
        if (!R[i].equals(Group.zero).toBoolean()) D[i] = R[i].scale(share);
    }
    return new ResponseContribution(D);
}

function getLagrangeCoefficient(memberIds: number[]): ScalarField[] {
    const threshold = memberIds.length;
    let lagrangeCoefficient = new Array<ScalarField>(threshold);
    for (let i = 0; i < threshold; i++) {
        let indexI = memberIds[i] + 1;
        let coef = new ScalarField(1);
        for (let j = 0; j < threshold; j++) {
            let indexJ = memberIds[j] + 1;
            if (indexI == indexJ) continue;
            coef = new ScalarField(
                coef
                    .assertAlmostReduced()
                    .mul(
                        ScalarField.from(indexJ).div(
                            ScalarField.from(indexJ - indexI)
                        )
                    )
                    .assertCanonical()
            );
        }
        lagrangeCoefficient[i] = coef;
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
                sumD[j] = sumD[j].add(
                    D[i][j].scale(ScalarField.toScalar(lagrangeCoefficient[i]))
                );
        }
    }
    return sumD;
}

function calculateSecretKey(memberIds: number[], shares: Scalar[]): Scalar {
    let lagrangeCoefficient = getLagrangeCoefficient(memberIds);
    let threshold = memberIds.length;
    let secretKey = ScalarField.from(0);
    for (let i = 0; i < threshold; i++) {
        let share = ScalarField.fromScalar(shares[i]).assertCanonical();
        let coef = lagrangeCoefficient[i].assertCanonical();
        secretKey = secretKey.add(share.mul(coef)).assertCanonical();
    }
    return ScalarField.toScalar(secretKey);
}
