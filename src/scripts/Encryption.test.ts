import fs from 'fs/promises';
import { Cache, Field, Group, Mina, Scalar } from 'o1js';
import { Bit255, CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import {
    BatchDecryption,
    BatchDecryptionInput,
    BatchEncryption,
    BatchEncryptionInput,
    ElgamalInput,
    PlainArray,
    RandomArray,
} from '../contracts/Encryption.js';
import { Elgamal as ElgamalLib } from '../libs/index.js';
import { Elgamal } from '../contracts/Encryption.js';
import { CArray, UArray, cArray } from '../libs/Committee.js';

describe('Encryption', () => {
    const profiling = true;
    const cache = Cache.FileSystem('./caches');
    let Local = Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    const DKGProfiler = Utils.getProfiler('Benchmark Encryption', fs);

    let prvKey: Scalar = Scalar.random();
    let pubKey: Group = Group.generator.scale(prvKey);
    let length = 3;
    let plains: Scalar[] = [...Array(length)].map(() => Scalar.random());
    let randoms: Scalar[] = [...Array(length)].map(() => Scalar.random());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let encryptions: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let decryptions: any[] = [];

    it('Should compile all ZK programs', async () => {
        // await Utils.compile(Elgamal, cache);
        await Utils.compile(BatchEncryption, cache);
        await Utils.compile(BatchDecryption, cache);
    });

    xit('Should encrypt successfully', async () => {
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
        encryptionProof.verify();
        encryptions.push(encryption);
    });

    xit('Should decrypt successfully', async () => {
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
        decryptionProof.verify();
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
                publicKeys: new CArray([...Array(length)].map(() => pubKey)),
                c: new cArray(encryptions.map((e) => e.c)),
                U: new UArray(encryptions.map((e) => e.U)),
                memberId: Field(0),
            }),
            new PlainArray(plains.map((e) => CustomScalar.fromScalar(e))),
            new RandomArray(randoms.map((e) => CustomScalar.fromScalar(e)))
        );
        encryptionProof.verify();
    });

    it('Should batch decrypt successfully', async () => {
        console.log('Batch decryption');
        decryptions = [{ m: Scalar.from(2n) }];
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
            new PlainArray(
                decryptions.map((e) => CustomScalar.fromScalar(e.m))
            ),
            prvKey
        );
        decryptionProof.verify();
    });

    afterAll(() => {
        if (profiling) DKGProfiler.store();
    });
});
