import { Field, Group, MerkleTree, Poseidon, Scalar, Struct } from 'o1js';
import {
    Bit255,
    Bit255DynamicArray,
    FieldDynamicArray,
    GroupDynamicArray,
    PublicKeyDynamicArray,
} from '@auxo-dev/auxo-libs';
import * as ElgamalECC from './Elgamal.js';
import { ENCRYPTION_LIMITS, INSTANCE_LIMITS } from '../constants.js';

/* ========== CONSTANTS, TYPES, & STRUCTS ========== */

export class MemberArray extends PublicKeyDynamicArray(
    INSTANCE_LIMITS.MEMBER
) {}
export class CArray extends GroupDynamicArray(INSTANCE_LIMITS.MEMBER) {}
export class cArray extends Bit255DynamicArray(INSTANCE_LIMITS.MEMBER) {}
export class UArray extends GroupDynamicArray(INSTANCE_LIMITS.MEMBER) {}
export class PublicKeyArray extends GroupDynamicArray(INSTANCE_LIMITS.MEMBER) {}
export class EncryptionHashArray extends FieldDynamicArray(
    INSTANCE_LIMITS.MEMBER
) {}

export type SecretPolynomial = {
    a: Scalar[];
    C: Group[];
    f: Scalar[];
};

export type Round2Data = {
    c: Bit255;
    U: Group;
};

export class Round1Contribution extends Struct({
    C: CArray,
}) {
    static empty(): Round1Contribution {
        return new Round1Contribution({
            C: new CArray(),
        });
    }

    toFields(): Field[] {
        return this.C.toFields();
    }

    hash(): Field {
        return Poseidon.hash(this.toFields());
    }
}

export class Round2Contribution extends Struct({
    c: cArray,
    U: UArray,
}) {
    static empty(): Round2Contribution {
        return new Round2Contribution({
            c: new cArray(),
            U: new UArray(),
        });
    }

    toFields(): Field[] {
        return this.c.toFields().concat(this.U.toFields());
    }

    hash(): Field {
        return Poseidon.hash(this.toFields());
    }
}

export class ResponseContribution extends Struct({
    responseRootD: Field,
}) {
    static empty(): ResponseContribution {
        return new ResponseContribution({
            responseRootD: Field(0),
        });
    }

    toFields(): Field[] {
        return [this.responseRootD];
    }

    hash(): Field {
        return Poseidon.hash(this.toFields());
    }
}

/* ========== FUNCTIONS ========== */

export function calculatePublicKey(
    round1Contributions: Round1Contribution[]
): Group {
    let result = Group.zero;
    for (let i = 0; i < round1Contributions.length; i++) {
        result = result.add(round1Contributions[i].C.values[0]);
    }
    return result;
}

export function calculatePolynomialValue(a: Scalar[], x: number): Scalar {
    let result = Scalar.from(a[0]);
    for (let i = 1; i < a.length; i++) {
        result = result.add(a[i].mul(Scalar.from(Math.pow(x, i))));
    }
    return result;
}

export function generateRandomPolynomial(
    T: number,
    N: number
): SecretPolynomial {
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

export function getSecretPolynomial(
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

export function getRound1Contribution(
    secret: SecretPolynomial
): Round1Contribution {
    let provableC = CArray.from(secret.C);
    return new Round1Contribution({ C: provableC });
}

export function getRound2Contribution(
    secret: SecretPolynomial,
    memberId: number,
    round1Contributions: Round1Contribution[],
    randoms: Scalar[]
): Round2Contribution {
    let data = new Array<Round2Data>(secret.f.length);
    let c = new Array<Bit255>(secret.f.length);
    let U = new Array<Group>(secret.f.length);
    for (let i = 0; i < data.length; i++) {
        if (i == memberId) {
            c[i] = Bit255.fromBigInt(0n);
            U[i] = Group.zero;
        } else {
            let encryption = ElgamalECC.encrypt(
                secret.f[i],
                round1Contributions[i].C.values[0],
                randoms[i]
            );
            c[i] = encryption.c;
            U[i] = encryption.U;
        }
    }
    let provablec = cArray.from(c);
    let provableU = UArray.from(U);
    return new Round2Contribution({ c: provablec, U: provableU });
}

export function getResponseContribution(
    secret: SecretPolynomial,
    memberId: number,
    round2Data: Round2Data[],
    R: Group[]
): [ResponseContribution, Scalar] {
    let decryptions: Scalar[] = round2Data.map((data, id) =>
        id == memberId
            ? secret.f[memberId]
            : Scalar.from(ElgamalECC.decrypt(data.c, data.U, secret.a[0]).m)
    );
    let ski: Scalar = decryptions.reduce(
        (prev: Scalar, curr: Scalar) => prev.add(curr),
        Scalar.from(0n)
    );

    let merkleTree = new MerkleTree(ENCRYPTION_LIMITS.FULL_DIMENSION);
    let D = new Array<Group>(R.length);
    for (let i = 0; i < R.length; i++) {
        D[i] = R[i].scale(ski);
        merkleTree.setLeaf(BigInt(i), Poseidon.hash(D[i].toFields()));
    }

    return [
        new ResponseContribution({ responseRootD: merkleTree.getRoot() }),
        ski,
    ];
}

export function getLagrangeCoefficient(memberIds: number[]): Scalar[] {
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

export function accumulateResponses(
    memberIds: number[],
    D: Group[][]
): Group[] {
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
