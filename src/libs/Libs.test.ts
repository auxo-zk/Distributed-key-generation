import { Field, Group, PrivateKey, Provable, Scalar } from 'o1js';
import { Bit255 } from '@auxo-dev/auxo-libs';
import * as ElgamalECC from './Elgamal.js';
import { ENCRYPTION_LIMITS, SECRET_UNIT } from '../constants.js';
import {
    ResponseContribution,
    Round1Contribution,
    Round2Contribution,
    Round2Data,
    SecretPolynomial,
    accumulateResponses,
    calculatePublicKey,
    generateRandomPolynomial,
    getResponseContribution,
    getRound1Contribution,
    getRound2Contribution,
} from './Committee.js';
import {
    accumulateEncryption,
    bruteForceResultVector,
    generateEncryption,
    getResultVector,
} from './Requester.js';

describe('DKG', () => {
    let T = 1;
    let N = 3;
    let committees: {
        privateKey: PrivateKey;
        memberId: number;
        secretPolynomial: SecretPolynomial;
        round1Contribution?: Round1Contribution;
        round2Contribution?: Round2Contribution;
        responseContribution?: ResponseContribution;
    }[] = [];
    let round1Contributions: Round1Contribution[] = [];
    let round2Contributions: Round2Contribution[] = [];
    let responseContributions: ResponseContribution[] = [];
    let publicKey: Group;
    let R: Group[][] = [];
    let M: Group[][] = [];
    let D: Group[][] = [];
    let sumR: Group[] = [];
    let sumM: Group[] = [];
    let sumD: Group[] = [];
    let respondedMembers = [1];
    const submissionVectors = [
        {
            0: 10000n * BigInt(SECRET_UNIT),
            2: 10000n * BigInt(SECRET_UNIT),
        },
        {
            3: 10000n * BigInt(SECRET_UNIT),
        },
        {
            2: 10000n * BigInt(SECRET_UNIT),
            5: 10000n * BigInt(SECRET_UNIT),
        },
    ];
    let result: { [key: number]: bigint } = {};
    let resultVector: Group[];

    beforeAll(async () => {
        for (let i = 0; i < N; i++) {
            let privateKey = PrivateKey.random();
            let secretPolynomial = generateRandomPolynomial(T, N);
            committees.push({
                privateKey: privateKey,
                memberId: i,
                secretPolynomial: secretPolynomial,
                round1Contribution: undefined,
                round2Contribution: undefined,
            });
        }
    });

    it('Should generate round 1 contribution', async () => {
        for (let i = 0; i < N; i++) {
            let round1Contribution = getRound1Contribution(
                committees[i].secretPolynomial
            );
            committees[i].round1Contribution = round1Contribution;
            round1Contributions.push(round1Contribution);
        }
        publicKey = calculatePublicKey(round1Contributions);
        expect(publicKey.isZero().toBoolean()).toEqual(false);
    });

    it('Should generate round 2 contribution', async () => {
        for (let i = 0; i < N; i++) {
            let round2Contribution = getRound2Contribution(
                committees[i].secretPolynomial,
                committees[i].memberId,
                round1Contributions,
                [...Array(N).keys()].map(() => Scalar.random())
            );
            committees[i].round2Contribution = round2Contribution;
            round2Contributions.push(round2Contribution);
        }
    });

    it('Should accumulate encryption', async () => {
        for (let i = 0; i < submissionVectors.length; i++) {
            let encryptedVector = generateEncryption(
                0,
                calculatePublicKey(round1Contributions),
                submissionVectors[i]
            );
            R.push(encryptedVector.R);
            M.push(encryptedVector.M);
            for (let j = 0; j < ENCRYPTION_LIMITS.DIMENSION; j++) {
                let index = encryptedVector.indices[j];
                if (!result[index]) result[index] = 0n;
                result[index] += encryptedVector.secrets
                    .get(Field(j))
                    .toBigInt();
            }
        }
        let accumulatedEncryption = accumulateEncryption(R, M);
        sumR = accumulatedEncryption.sumR;
        sumM = accumulatedEncryption.sumM;
    });

    it('Should generate response contribution', async () => {
        for (let i = 0; i < T; i++) {
            let member = committees[respondedMembers[i]];
            let round2Data: Round2Data[] = round2Contributions.map(
                (contribution, index) =>
                    index == committees[respondedMembers[i]].memberId
                        ? { c: Bit255.fromBigInt(0n), U: Group.zero }
                        : {
                              c: new Bit255(
                                  contribution.c.values[member.memberId]
                              ),
                              U: contribution.U.values[member.memberId],
                          },
                {}
            );
            let [responseContribution, ski] = getResponseContribution(
                committees[respondedMembers[i]].secretPolynomial,
                committees[respondedMembers[i]].memberId,
                round2Data,
                sumR
            );
            let skiCommitment = Group.zero;
            for (let i = 0; i < N; i++) {
                skiCommitment = skiCommitment.add(
                    Group.generator.scale(committees[i].secretPolynomial.f[0])
                );
            }
            skiCommitment.assertEquals(Group.generator.scale(ski));
            committees[respondedMembers[i]].responseContribution =
                responseContribution;
            responseContributions.push(responseContribution);
            D.push(responseContribution.D.values);
        }
    });

    it('Should calculate result vector', async () => {
        sumD = accumulateResponses(respondedMembers, D);
        resultVector = getResultVector(sumD, sumM);
        Object.entries(result).map(([key, value]) => {
            let point = Group.generator.scale(Scalar.from(value));
            expect(resultVector[Number(key)].x).toEqual(point.x);
            expect(resultVector[Number(key)].y).toEqual(point.y);
        });
    });

    it('Should brute force raw result correctly', async () => {
        let rawResult = bruteForceResultVector(resultVector);
        for (let i = 0; i < ENCRYPTION_LIMITS.FULL_DIMENSION; i++) {
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

describe('ElgamalECC', () => {
    it('Should decrypt successfully', async () => {
        let msg = Scalar.random();
        let privateKey = Scalar.random();
        let publicKey = Group.generator.scale(privateKey);
        let encrypted = ElgamalECC.encrypt(msg, publicKey, Scalar.random());
        let decrypted = ElgamalECC.decrypt(
            encrypted.c,
            encrypted.U,
            privateKey
        );
        expect(msg.toBigInt()).toEqual(decrypted.m.toBigInt());
    });
});
