import { Field, Group, PrivateKey, Scalar } from 'o1js';
import {
    Cipher,
    KeyGenContribution,
    SecretPolynomial,
    accumulateResponses,
    calculatePublicKey,
    generateRandomPolynomial,
    getResponseContribution,
    getKeyGenContribution,
    getSecretShare,
    ResponseContribution,
} from './Committee.js';
import {
    accumulateEncryption,
    bruteForceResult,
    EncryptionConfig,
    generateEncryption,
    getResultVector,
} from './Requester.js';

describe('DKG', () => {
    let T = 1;
    let N = 3;
    let members: {
        privateKey: PrivateKey;
        memberId: number;
        secretPolynomial: SecretPolynomial;
        contribution?: KeyGenContribution;
        share?: Scalar;
        commitment?: Field;
        responseContribution?: ResponseContribution;
    }[] = [];
    let contributions: KeyGenContribution[] = [];
    let responseContributions: ResponseContribution[] = [];
    let publicKey: Group;
    let R: Group[][] = [];
    let M: Group[][] = [];
    let D: Group[][] = [];
    let sumR: Group[] = [];
    let sumM: Group[] = [];
    let sumD: Group[] = [];
    let respondedMembers = [1];
    const encryptionConfig = new EncryptionConfig({
        n: Field(10 ** 2),
        l: Field(10 ** 2),
        d: Field(32),
    });
    const submissionVectors = [
        { 0: 100n, 12: 100n },
        { 3: 100n },
        { 8: 100n, 6: 100n },
        { 5: 100n, 3: 100n },
        { 7: 100n, 1: 100n },
    ];
    let result: { [key: number]: bigint } = {};
    let resultVector: Group[];

    beforeAll(async () => {
        for (let i = 0; i < N; i++) {
            let privateKey = PrivateKey.random();
            let secretPolynomial = generateRandomPolynomial(T, N);
            members.push({
                privateKey: privateKey,
                memberId: i,
                secretPolynomial: secretPolynomial,
                contribution: undefined,
            });
        }
    });

    it('Should generate contribution', async () => {
        const pubKeys = members.map((member) =>
            member.privateKey.toPublicKey()
        );
        for (let i = 0; i < N; i++) {
            let contribution = getKeyGenContribution(
                members[i].secretPolynomial,
                i,
                pubKeys,
                [...Array(N).keys()].map(() => Scalar.random())
            );
            members[i].contribution = contribution;
            contributions.push(contribution);
        }
        publicKey = calculatePublicKey(contributions.map((e) => e.C));
        expect(publicKey.isZero().toBoolean()).toEqual(false);
    });

    it('Should compute and commit secret share', async () => {
        for (let i = 0; i < N; i++) {
            let { share, commitment } = getSecretShare(
                members[i].secretPolynomial,
                members[i].memberId,
                contributions.map(
                    (e) =>
                        ({
                            c: e.c.get(Field(i)),
                            U: e.U.get(Field(i)),
                        } as Cipher)
                ),
                members[i].privateKey
            );
            members[i].share = share;
            members[i].commitment = commitment;
        }
        let secretKey = members.slice(0, T).reduce(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-explicit-any
            (prev: Scalar, curr: any) => prev.add(curr.share!),
            Scalar.from(0n)
        );
        expect(
            Group.generator.scale(secretKey).equals(publicKey).toBoolean()
        ).toEqual(true);
    });

    it('Should accumulate encryption', async () => {
        for (let i = 0; i < submissionVectors.length; i++) {
            let encryptedVector = generateEncryption(
                0,
                calculatePublicKey(contributions.map((e) => e.C)),
                submissionVectors[i],
                encryptionConfig
            );
            R.push(encryptedVector.R);
            M.push(encryptedVector.M);
            for (let j = 0; j < encryptedVector.notes.length; j++) {
                let index = Number(encryptedVector.notes[j].index);
                if (!result[index]) result[index] = 0n;
                result[index] += encryptedVector.notes[j].value.toBigInt();
            }
        }
        let accumulatedEncryption = accumulateEncryption(R, M);
        sumR = accumulatedEncryption.sumR;
        sumM = accumulatedEncryption.sumM;
    });

    it('Should generate response contribution', async () => {
        for (let i = 0; i < T; i++) {
            let member = members[respondedMembers[i]];
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            let contribution = getResponseContribution(member.share!, sumR);
            members[respondedMembers[i]].responseContribution = contribution;
            responseContributions.push(contribution);
            D.push(contribution.values.slice(0, Number(encryptionConfig.c)));
        }
    });

    it('Should calculate result point', async () => {
        sumD = accumulateResponses(respondedMembers, D);
        resultVector = getResultVector(sumD, sumM);
    });

    it('Should brute force raw result correctly', async () => {
        let { base, c, d } = encryptionConfig;
        let splitSize = Number(d) / Number(c);
        for (let k = 0; k < Number(c); k++) {
            let correctResult = Scalar.from(0n);
            for (let i = 0; i < splitSize; i++) {
                correctResult = correctResult.add(
                    Scalar.from(
                        result[i + k * splitSize]
                            ? result[i + k * splitSize] *
                                  base.toBigInt() ** BigInt(i)
                            : 0n
                    )
                );
            }
        }
        let rawResult = bruteForceResult(resultVector, encryptionConfig);

        for (let i = 0; i < rawResult.length; i++) {
            if (
                Object.keys(result)
                    .map((e) => Number(e))
                    .includes(i)
            ) {
                expect(rawResult[i].toBigInt()).toEqual(result[i]);
            } else {
                expect(rawResult[i].toBigInt()).toEqual(0n);
            }
        }
    });
});
