import { Field, Group, PrivateKey, UInt32, UInt8 } from 'o1js';
import {
    accumulateResponses,
    calculatePublicKey,
    generateRandomPolynomial,
    getResponseContribution,
    getKeyGenContribution,
    getSecretShare,
} from './Committee.js';
import {
    accumulateEncryption,
    bruteForceResult,
    generateEncryption,
    getResultVector,
} from './Requester.js';
import {
    Cipher,
    EncryptionConfig,
    KeyGenContribution,
    ResponseContribution,
    SecretPolynomial,
} from './types.js';
import { ENC_LIMITS } from '../constants.js';

describe('DKG', () => {
    let T = 1;
    let N = 3;
    let members: {
        privateKey: PrivateKey;
        memberId: number;
        secretPolynomial: SecretPolynomial;
        contribution?: KeyGenContribution;
        share?: Field;
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
        n: UInt32.from(10 ** 4),
        l: UInt32.from(10 ** 4),
        d: UInt8.from(ENC_LIMITS.SPLIT),
        c: UInt8.from(ENC_LIMITS.SPLIT),
    });
    const submissionVectors = [
        { 0: encryptionConfig.n.toBigint(), 12: encryptionConfig.n.toBigint() },
        { 3: encryptionConfig.n.toBigint() },
        { 8: encryptionConfig.n.toBigint(), 6: encryptionConfig.n.toBigint() },
        { 5: encryptionConfig.n.toBigint(), 3: encryptionConfig.n.toBigint() },
        { 7: encryptionConfig.n.toBigint(), 1: encryptionConfig.n.toBigint() },
        { 15: encryptionConfig.n.toBigint() },
        { 2: encryptionConfig.n.toBigint(), 17: encryptionConfig.n.toBigint() },
        { 0: encryptionConfig.n.toBigint() },
        { 8: encryptionConfig.n.toBigint(), 1: encryptionConfig.n.toBigint() },
        { 6: encryptionConfig.n.toBigint(), 13: encryptionConfig.n.toBigint() },
        { 2: encryptionConfig.n.toBigint(), 9: encryptionConfig.n.toBigint() },
        { 5: encryptionConfig.n.toBigint() },
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
                [...Array(N).keys()].map(() => Field.random())
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
            (prev: Field, curr: any) => prev.add(curr.share!),
            Field.from(0n)
        );
        expect(
            Group.generator.scale(secretKey).equals(publicKey).toBoolean()
        ).toEqual(true);
    });

    it('Should accumulate encryption', async () => {
        encryptionConfig.assertCorrect();
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
            let correctResult = Field(0n);
            for (let i = 0; i < splitSize; i++) {
                correctResult = correctResult.add(
                    Field(
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
