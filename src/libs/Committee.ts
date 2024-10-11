import {
    Field,
    Group,
    Poseidon,
    PrivateKey,
    PublicKey,
    Scalar,
    Struct,
} from 'o1js';
import {
    Bit255,
    Bit255DynamicArray,
    FieldDynamicArray,
    GroupDynamicArray,
    PublicKeyDynamicArray,
} from '@auxo-dev/auxo-libs';
import { ECElGamal } from '@auxo-dev/o1js-encrypt';
import { ENC_LIMITS, INSTANCE_LIMITS } from '../constants.js';

export {
    MemberArray,
    CArray,
    cArray,
    UArray,
    PublicKeyArray,
    EncryptionHashArray,
    SecretPolynomial,
    Cipher,
    KeyGenContribution,
    ResponseContribution,
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
type SecretPolynomial = {
    a: Scalar[];
    C: Group[];
    f: Scalar[];
};
type Cipher = {
    c: Bit255;
    U: Group;
};
class MemberArray extends PublicKeyDynamicArray(INSTANCE_LIMITS.MEMBER) {}
class CArray extends GroupDynamicArray(INSTANCE_LIMITS.MEMBER) {}
class cArray extends Bit255DynamicArray(INSTANCE_LIMITS.MEMBER) {}
class UArray extends GroupDynamicArray(INSTANCE_LIMITS.MEMBER) {}
class PublicKeyArray extends GroupDynamicArray(INSTANCE_LIMITS.MEMBER) {}
class EncryptionHashArray extends FieldDynamicArray(INSTANCE_LIMITS.MEMBER) {}

class KeyGenContribution extends Struct({
    C: CArray,
    c: cArray,
    U: UArray,
}) {
    static empty(): KeyGenContribution {
        return new KeyGenContribution({
            C: new CArray(),
            c: new cArray(),
            U: new UArray(),
        });
    }

    toFields(): Field[] {
        return KeyGenContribution.toFields(this);
    }

    hash(): Field {
        return Poseidon.hash(this.toFields());
    }
}

class ResponseContribution extends GroupDynamicArray(ENC_LIMITS.SPLIT) {}

function calculatePublicKey(arr: CArray[]): Group {
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

function recoverSecretPolynomial(
    a: Scalar[],
    T: number,
    N: number
): SecretPolynomial {
    let C = new Array<Group>(T);
    for (let i = 0; i < T; i++) {
        C[i] = Group.generator.scale(a[i]);
    }
    let f = new Array<Scalar>(N);
    for (let i = 0; i < N; i++) {
        f[i] = calculatePolynomialValue(a, i + 1);
    }
    return { a, C, f };
}

function getKeyGenContribution(
    secret: SecretPolynomial,
    memberId: number,
    pubKeys: PublicKey[],
    randoms: Scalar[]
) {
    let C = CArray.from(secret.C);
    let cArr = new Array<Bit255>(secret.f.length);
    let UArr = new Array<Group>(secret.f.length);
    for (let i = 0; i < secret.f.length; i++) {
        if (i == memberId) {
            cArr[i] = Bit255.fromBigInt(0n);
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
    let c = cArray.from(cArr);
    let U = UArray.from(UArr);
    return new KeyGenContribution({ C, c, U });
}

function getSecretShare(
    secret: SecretPolynomial,
    memberId: number,
    ciphers: Cipher[],
    prvKey: PrivateKey
): { share: Scalar; commitment: Field } {
    let decryptions: Scalar[] = ciphers.map((data, id) =>
        id == memberId
            ? secret.f[memberId]
            : Scalar.from(ECElGamal.Lib.decrypt(data.c, data.U, prvKey.s).m)
    );
    let share: Scalar = decryptions.reduce(
        (prev: Scalar, curr: Scalar) => prev.add(curr),
        Scalar.from(0n)
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
