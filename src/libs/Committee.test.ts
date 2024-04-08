import { Group, PrivateKey, Scalar } from 'o1js';
import { Bit255 } from '@auxo-dev/auxo-libs';
import { SECRET_UNIT } from '../constants.js';
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

describe('Committee', () => {
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
    const plainVectors = [
        [10000n, 10000n, 10000n].map((e) => e * BigInt(SECRET_UNIT)),
        [40000n, 30000n, 20000n].map((e) => e * BigInt(SECRET_UNIT)),
    ];
    let result = [50000n, 40000n, 30000n].map((e) => e * BigInt(SECRET_UNIT));
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
        for (let i = 0; i < plainVectors.length; i++) {
            let encryptedVector = generateEncryption(
                calculatePublicKey(round1Contributions),
                plainVectors[i]
            );
            R.push(encryptedVector.R);
            M.push(encryptedVector.M);
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
                              c: contribution.c.values[member.memberId],
                              U: contribution.U.values[member.memberId],
                          },
                {}
            );
            let responseContribution = getResponseContribution(
                committees[respondedMembers[i]].secretPolynomial,
                committees[respondedMembers[i]].memberId,
                round2Data,
                sumR
            )[0];
            committees[respondedMembers[i]].responseContribution =
                responseContribution;
            responseContributions.push(responseContribution);
            D.push(responseContribution.D.values);
        }
    });

    it('Should calculate result vector', async () => {
        sumD = accumulateResponses(respondedMembers, D);
        resultVector = getResultVector(sumD, sumM);

        for (let i = 0; i < result.length; i++) {
            let point = Group.generator.scale(Scalar.from(result[i]));
            expect(resultVector[i].x).toEqual(point.x);
            expect(resultVector[i].y).toEqual(point.y);
        }
    });

    it('Should brute force raw result correctly', async () => {
        let rawResult = bruteForceResultVector(resultVector);
        for (let i = 0; i < result.length; i++) {
            expect(rawResult[i].toBigInt()).toEqual(result[i]);
        }
    });
});
