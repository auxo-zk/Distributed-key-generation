import { Field, Group, PrivateKey, Scalar } from 'o1js';
import {
    accumulateResponses,
    calculatePublicKey,
    generateRandomPolynomial,
    getResponseContribution,
    getKeyGenContribution,
    getSecretShare,
    calculateSecretKey,
} from '../libs/Committee.js';
import {
    accumulateEncryption,
    bruteForceResult,
    generateEncryption,
    getResultVector,
} from '../libs/Requester.js';
import {
    EncryptionConfig,
    EncryptionMode,
    KeyGenContribution,
    ResponseContribution,
    SecretPolynomial,
} from '../libs/types.js';
import { ENC_BIT_LIMITS, ENC_LIMITS } from '../constants.js';
import { Utils } from '@auxo-dev/auxo-libs';

describe('Libs', () => {
    let T = 3;
    let N = 5;
    let members: {
        privateKey: PrivateKey;
        memberId: number;
        secretPolynomial: SecretPolynomial;
        share: Scalar;
        contribution?: KeyGenContribution;
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
    let respondedMembers = [1, 0, 2];
    const encryptionConfig = EncryptionConfig.packConfig(
        Field(10 ** 4), // n
        Field(10 ** 4), // l
        Field(ENC_LIMITS.DIMENSION)
    );
    const NUM_ENCRYPTIONS = 10;
    const submissionVectors = [...Array(NUM_ENCRYPTIONS)].map(() => {
        let randomIndices: number[] = [];
        while (randomIndices.length < ENC_LIMITS.SUB_DIMENSION / 2) {
            let index = Math.floor(Math.random() * ENC_LIMITS.DIMENSION);
            if (index in randomIndices || index == ENC_LIMITS.DIMENSION)
                continue;
            randomIndices.push(index);
        }
        let plain: { [key: number]: bigint } = {};
        randomIndices.map((e) => {
            plain[e] = BigInt(
                Math.floor(Math.random() * Number(encryptionConfig.n))
            );
        });
        return plain;
    });

    // const submissionVectors = [
    //     {
    //         0: encryptionConfig.n.toBigInt(),
    //         10: encryptionConfig.n.toBigInt(),
    //         120: encryptionConfig.n.toBigInt(),
    //     },
    //     { 33: encryptionConfig.n.toBigInt() },
    //     {
    //         18: encryptionConfig.n.toBigInt(),
    //         66: encryptionConfig.n.toBigInt(),
    //     },
    //     {
    //         52: encryptionConfig.n.toBigInt(),
    //         45: encryptionConfig.n.toBigInt(),
    //     },
    //     {
    //         7: encryptionConfig.n.toBigInt(),
    //         155: encryptionConfig.n.toBigInt(),
    //     },
    //     { 15: encryptionConfig.n.toBigInt() },
    //     {
    //         22: encryptionConfig.n.toBigInt(),
    //         17: encryptionConfig.n.toBigInt(),
    //     },
    //     { [Number(encryptionConfig.d) - 1]: encryptionConfig.n.toBigInt() },
    //     {
    //         198: encryptionConfig.n.toBigInt(),
    //         1: encryptionConfig.n.toBigInt(),
    //     },
    //     {
    //         62: encryptionConfig.n.toBigInt(),
    //         133: encryptionConfig.n.toBigInt(),
    //     },
    //     {
    //         102: encryptionConfig.n.toBigInt(),
    //         99: encryptionConfig.n.toBigInt(),
    //     },
    //     { 56: encryptionConfig.n.toBigInt() },
    // ];
    let result: { [key: number]: bigint } = {};
    let resultVector: Group[];

    beforeAll(async () => {
        for (let i = 0; i < N; i++) {
            let privateKey = PrivateKey.random();
            let secretPolynomial = generateRandomPolynomial(T, N);
            members.push({
                privateKey,
                memberId: i,
                secretPolynomial,
                share: Scalar.from(0),
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
                members[i].memberId,
                contributions.map((e) => ({
                    c: e.c.get(Field(i)),
                    U: e.U.get(Field(i)),
                })),
                members[i].privateKey
            );
            members[i].share = share;
            members[i].commitment = commitment;
        }
        let shares = respondedMembers.map((id) => members[id].share);
        let secretKey = calculateSecretKey(respondedMembers, shares);
        expect(
            Group.generator.scale(secretKey).equals(publicKey).toBoolean()
        ).toEqual(true);
    });

    it('Should accumulate encryption', async () => {
        encryptionConfig.assertCorrect();
        let { d } = encryptionConfig;
        for (let i = 0; i < submissionVectors.length; i++) {
            let encryptions = generateEncryption(
                0,
                calculatePublicKey(contributions.map((e) => e.C)),
                submissionVectors[i],
                encryptionConfig,
                EncryptionMode.OPTIMIZED_PRIVACY
            );
            // Provable.log(encryptedVector);
            let Ri = new Array<Group>(Number(d)).fill(Group.zero);
            let Mi = new Array<Group>(Number(d)).fill(Group.zero);
            console.log('Number of Txs:', encryptions.notes.length);
            for (let i = 0; i < encryptions.notes.length; i++) {
                let note = encryptions.notes[i];
                let indices = Utils.unpackNumberArray(
                    note.indices,
                    ENC_BIT_LIMITS.DIMENSION
                ).slice(0, ENC_LIMITS.SUB_DIMENSION);
                for (let j = 0; j < indices.length; j++) {
                    Ri[indices[j]] = note.R.get(Field(j));
                    Mi[indices[j]] = note.M.get(Field(j));
                }
            }

            // let count = 0;
            // for (let i = 0; i < MAX_TXS; i++) {
            //     if (
            //         encryptions.notes[count] &&
            //         Number(encryptions.notes[count].startIndex) ==
            //             i * ENC_LIMITS.SUB_DIMENSION
            //     ) {
            //         let note = encryptions.notes[count];
            //         Ri = Ri.concat(
            //             note.R.values.slice(0, ENC_LIMITS.SUB_DIMENSION)
            //         );
            //         Mi = Mi.concat(
            //             note.M.values.slice(0, ENC_LIMITS.SUB_DIMENSION)
            //         );
            //         count++;
            //         // Provable.log('Note:', note);
            //     } else {
            //         let emptyArr = new SubVectorGroupArray().values.slice(
            //             0,
            //             SPLITS_PER_TX
            //         );
            //         // Provable.log('Empty:', emptyArr);
            //         Ri = Ri.concat(emptyArr);
            //         Mi = Mi.concat(emptyArr);
            //     }
            // }
            R.push(Ri);
            M.push(Mi);

            for (let j = 0; j < encryptions.secretNotes.length; j++) {
                let index = Number(encryptions.secretNotes[j].index);
                if (!result[index]) result[index] = 0n;
                result[index] += encryptions.secretNotes[j].value.toBigInt();
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
            D.push(contribution.values);
        }
    });

    it('Should calculate result point', async () => {
        sumD = accumulateResponses(respondedMembers, D);
        resultVector = getResultVector(sumD, sumM);
    });

    it('Should brute force raw result correctly', async () => {
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
