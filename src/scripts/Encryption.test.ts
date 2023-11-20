import { Field, Group, Provable, Scalar } from 'o1js';
import {
  BatchDecryption,
  BatchDecryptionInput,
  BatchEncryption,
  BatchEncryptionInput,
  ElgamalInput,
  PlainArray,
  RandomArray,
} from '../contracts/Encryption.js';
import { getProfiler } from './helper/profiler.js';
import { Bit255, CustomScalar } from '@auxo-dev/auxo-libs';
import { Elgamal as ElgamalLib } from '../libs/index.js';
import { Elgamal } from '../contracts/Encryption.js';
import { CArray, UArray, cArray } from '../libs/Committee.js';

describe('Encryption', () => {
  const profiling = true;
  const DKGProfiler = getProfiler('Benchmark Encryption');

  let prvKey: Scalar = Scalar.random();
  let pubKey: Group = Group.generator.scale(prvKey);
  let length = 2;
  let plains: Scalar[] = [...Array(length).keys()].map((e) => Scalar.random());
  let randoms: Scalar[] = [...Array(length).keys()].map((e) => Scalar.random());
  let encryptions: any[] = [];
  let decryptions: any[] = [];

  const compile = async (
    prg: any,
    name: string,
    profiling: boolean = false
  ) => {
    console.log(`Compiling ${name}...`);
    if (profiling) DKGProfiler.start(`${name}.compile`);
    await prg.compile();
    if (profiling) DKGProfiler.stop();
    console.log('Done!');
  };

  it('Should compile all ZK programs', async () => {
    await compile(Elgamal, 'Elgamal', profiling);
    await compile(BatchEncryption, 'BatchEncryption', profiling);
    await compile(BatchDecryption, 'BatchDecryption', profiling);
  });

  it('Should encrypt sucessfully', async () => {
    console.log('Single encryption');
    let encryption = ElgamalLib.encrypt(plains[0], pubKey, randoms[0]);
    let encryptionProof = await Elgamal.encrypt(
      new ElgamalInput({
        pubKey: pubKey,
        c: encryption.c,
        U: encryption.U,
      }),
      plains[0],
      randoms[0]
    );
    encryptions.push(encryption);
  });

  it('Should decrypt sucessfully', async () => {
    console.log('Single decryption');
    let encryption = encryptions[0];
    let decryption = ElgamalLib.decrypt(encryption.c, encryption.U, prvKey);
    let decryptionProof = await Elgamal.decrypt(
      new ElgamalInput({
        pubKey: pubKey,
        c: encryption.c,
        U: encryption.U,
      }),
      decryption.m,
      prvKey
    );
  });

  it('Should batch encrypt successfully', async () => {
    console.log('Batch encryption');
    encryptions = [
      {
        c: Bit255.fromBigInt(0n),
        U: Group.zero,
      },
    ];
    for (let i = 1; i < length; i++) {
      encryptions.push(ElgamalLib.encrypt(plains[i], pubKey, randoms[i]));
    }
    let encryptionProof = await BatchEncryption.encrypt(
      new BatchEncryptionInput({
        publicKeys: new CArray([...Array(length).keys()].map((e) => pubKey)),
        c: new cArray(encryptions.map((e) => e.c)),
        U: new UArray(encryptions.map((e) => e.U)),
        memberId: Field(0),
      }),
      new PlainArray(plains.map((e) => CustomScalar.fromScalar(e))),
      new RandomArray(randoms.map((e) => CustomScalar.fromScalar(e)))
    );
  });

  it('Should batch decrypt successfully', async () => {
    console.log('Batch decryption');
    decryptions = [{ m: Scalar.from(0n) }];
    for (let i = 1; i < length; i++) {
      decryptions.push(
        ElgamalLib.decrypt(encryptions[i].c, encryptions[i].U, prvKey)
      );
    }
    let decryptionProof = await BatchDecryption.decrypt(
      new BatchDecryptionInput({
        publicKey: pubKey,
        c: new cArray(encryptions.map((e) => e.c)),
        U: new UArray(encryptions.map((e) => e.U)),
        memberId: Field(0),
      }),
      new PlainArray(decryptions.map((e) => CustomScalar.fromScalar(e.m))),
      prvKey
    );
  });

  afterAll(() => {
    if (profiling) DKGProfiler.store();
  });
});
