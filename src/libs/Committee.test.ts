import {
  Field,
  Group,
  method,
  PrivateKey,
  Scalar,
  SmartContract,
  state,
  State,
  Reducer,
} from 'o1js';
import * as Committee from './Committee.js';
import * as Requestor from './Requestor.js';
import { Bit255 } from '@auxo-dev/auxo-libs';

describe('Committee', () => {
  let T = 3;
  let N = 5;
  let committees: {
    privateKey: PrivateKey;
    memberId: number;
    secretPolynomial: Committee.SecretPolynomial;
    round1Contribution?: Committee.Round1Contribution;
    round2Contribution?: Committee.Round2Contribution;
    responseContribution?: Committee.ResponseContribution;
  }[] = [];
  let round1Contributions: Committee.Round1Contribution[] = [];
  let round2Contributions: Committee.Round2Contribution[] = [];
  let responseContributions: Committee.ResponseContribution[] = [];
  let publicKey: Group;
  let R: Group[][] = [];
  let M: Group[][] = [];
  let sumR: Group[] = [];
  let sumM: Group[] = [];
  let D: Group[][] = [];
  let responsedMembers = [0, 2, 4];
  const plainVectors = [
    [1000n, 1000n, 1000n],
    [4000n, 3000n, 2000n],
  ];
  let result = [5000n, 4000n, 3000n];

  beforeAll(async () => {
    for (let i = 0; i < N; i++) {
      let privateKey = PrivateKey.random();
      let secretPolynomial = Committee.generateRandomPolynomial(T, N);
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
      let round1Contribution = Committee.getRound1Contribution(
        committees[i].secretPolynomial
      );
      committees[i].round1Contribution = round1Contribution;
      round1Contributions.push(round1Contribution);
    }
    publicKey = Committee.calculatePublicKey(round1Contributions);
  });

  it('Should generate round 2 contribution', async () => {
    for (let i = 0; i < N; i++) {
      let round2Contribution = Committee.getRound2Contribution(
        committees[i].secretPolynomial,
        committees[i].memberId,
        round1Contributions,
        [...Array(N).keys()].map((e) => Scalar.random())
      );
      committees[i].round2Contribution = round2Contribution;
      round2Contributions.push(round2Contribution);
    }
  });

  it('Should accumulate encryption', async () => {
    for (let i = 0; i < plainVectors.length; i++) {
      let encryptedVector = Requestor.generateEncryption(
        Committee.calculatePublicKey(round1Contributions),
        plainVectors[i]
      );
      R.push(encryptedVector.R);
      M.push(encryptedVector.M);
    }

    let accumulatedEncryption = Requestor.accumulateEncryption(R, M);
    sumR = accumulatedEncryption.sumR;
    sumM = accumulatedEncryption.sumM;
  });

  it('Should generate response contribution', async () => {
    for (let i = 0; i < T; i++) {
      let member = committees[responsedMembers[i]];
      let round2Data: Committee.Round2Data[] = round2Contributions.map(
        (contribution, index) =>
          index == committees[responsedMembers[i]].memberId
            ? { c: Bit255.fromBigInt(0n), U: Group.zero }
            : {
                c: contribution.c.values[member.memberId],
                U: contribution.U.values[member.memberId],
              },
        {}
      );
      let responseContribution = Committee.getResponseContribution(
        committees[responsedMembers[i]].secretPolynomial,
        committees[responsedMembers[i]].memberId,
        round2Data,
        sumR
      )[0];
      committees[responsedMembers[i]].responseContribution =
        responseContribution;
      responseContributions.push(responseContribution);
      D.push(responseContribution.D.values);
    }
  });

  it('Should calculate result vector', async () => {
    let resultVector = Committee.getResultVector(responsedMembers, D, sumM);
    for (let i = 0; i < result.length; i++) {
      let point = Group.generator.scale(Scalar.from(result[i]));
      expect(resultVector[i].x).toEqual(point.x);
      expect(resultVector[i].y).toEqual(point.y);
    }
  });

  xit('Should be used in Smart Contract', async () => {
    class TestRound1Contribution extends SmartContract {
      reducer = Reducer({ actionType: Committee.Round1Contribution });
      @state(Field) keyId = State<Field>();
      @method test(): Field {
        return Field(0);
      }
    }

    class TestRound2Contribution extends SmartContract {
      reducer = Reducer({ actionType: Committee.Round2Contribution });
      @state(Field) keyId = State<Field>();
      @method test(): Field {
        return Field(0);
      }
    }

    class TestResponseContribution extends SmartContract {
      reducer = Reducer({ actionType: Committee.ResponseContribution });
      @state(Field) keyId = State<Field>();
      @method test(): Field {
        return Field(0);
      }
    }

    console.log('Compile test round 1...');
    await TestRound1Contribution.compile();
    console.log('DONE!');
    console.log('Compile test round 2...');
    await TestRound2Contribution.compile();
    console.log('DONE!');
    console.log('Compile test response...');
    await TestResponseContribution.compile();
    console.log('DONE!');
  });
});
