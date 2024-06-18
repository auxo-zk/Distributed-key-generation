import fs from 'fs/promises';
import { Cache, Field, Group, Mina, Scalar } from 'o1js';
import { Bit255, Utils } from '@auxo-dev/auxo-libs';
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

    beforeAll(async () => {
        let Local = await Mina.LocalBlockchain({ proofsEnabled: false });
        Mina.setActiveInstance(Local);
    });

    it('Should compile all ZK programs', async () => {
        await Utils.compile(Elgamal, { cache });
        await Utils.compile(BatchEncryption, { cache });
        await Utils.compile(BatchDecryption, { cache });
    });

    it('Should encrypt successfully', async () => {
        let encryption = ElgamalLib.encrypt(plains[0], pubKey, randoms[0]);
        let encryptionProof = await Utils.prove(
            Elgamal.name,
            'encrypt',
            async () =>
                Elgamal.encrypt(
                    new ElgamalInput({
                        pubKey: pubKey,
                        c: encryption.c,
                        U: encryption.U,
                    }),
                    plains[0],
                    randoms[0]
                ),
            { logger: { info: true, error: true } }
        );
        encryptionProof.verify();
        encryptions.push(encryption);
    });

    it('Should decrypt successfully', async () => {
        let encryption = encryptions[0];
        let decryption = ElgamalLib.decrypt(encryption.c, encryption.U, prvKey);
        let decryptionProof = await Utils.prove(
            Elgamal.name,
            'decrypt',
            async () =>
                Elgamal.decrypt(
                    new ElgamalInput({
                        pubKey: pubKey,
                        c: encryption.c,
                        U: encryption.U,
                    }),
                    decryption.m,
                    prvKey
                ),
            { logger: { info: true, error: true } }
        );
        decryptionProof.verify();
    });

    it('Should batch encrypt successfully', async () => {
        encryptions = [
            {
                c: Bit255.fromBigInt(0n),
                U: Group.zero,
            },
        ];
        for (let i = 1; i < length; i++) {
            encryptions.push(ElgamalLib.encrypt(plains[i], pubKey, randoms[i]));
        }
        let encryptionProof = await Utils.prove(
            BatchEncryption.name,
            'encrypt',
            async () =>
                BatchEncryption.encrypt(
                    new BatchEncryptionInput({
                        publicKeys: new CArray(
                            [...Array(length)].map(() => pubKey)
                        ),
                        c: new cArray(encryptions.map((e) => e.c)),
                        U: new UArray(encryptions.map((e) => e.U)),
                        memberId: Field(0),
                    }),
                    new PlainArray(plains),
                    new RandomArray(randoms)
                ),
            { logger: { info: true, error: true } }
        );
        encryptionProof.verify();
    });

    it('Should batch decrypt successfully', async () => {
        decryptions = [{ m: Scalar.from(1n) }];
        for (let i = 1; i < length; i++) {
            decryptions.push(
                ElgamalLib.decrypt(encryptions[i].c, encryptions[i].U, prvKey)
            );
        }
        let decryptionProof = await Utils.prove(
            BatchDecryption.name,
            'decrypt',
            async () =>
                BatchDecryption.decrypt(
                    new BatchDecryptionInput({
                        publicKey: pubKey,
                        c: new cArray(encryptions.map((e) => e.c)),
                        U: new UArray(encryptions.map((e) => e.U)),
                        memberId: Field(0),
                    }),
                    new PlainArray(decryptions.map((e) => e.m)),
                    prvKey
                )
        );
        decryptionProof.verify();
    });

    afterAll(() => {
        if (profiling) DKGProfiler.store();
    });
});
