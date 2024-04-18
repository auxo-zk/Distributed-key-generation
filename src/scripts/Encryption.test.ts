import fs from 'fs/promises';
import {
    AccountUpdate,
    Cache,
    Field,
    Group,
    Mina,
    PrivateKey,
    Provable,
    Scalar,
} from 'o1js';
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
import { Round2Contract } from '../contracts/Round2.js';
import { Contract } from './helper/config.js';

describe('Encryption', () => {
    const profiling = true;
    const cache = Cache.FileSystem('./caches');
    let Local = Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    const DKGProfiler = Utils.getProfiler('Benchmark Encryption', fs);

    let prvKey: Scalar = Scalar.random();
    let pubKey: Group = Group.generator.scale(prvKey);
    let length = 2;
    let plains: Scalar[] = [...Array(length).keys()].map((e) =>
        Scalar.random()
    );
    let randoms: Scalar[] = [...Array(length).keys()].map((e) =>
        Scalar.random()
    );
    let encryptions: any[] = [];
    let decryptions: any[] = [];

    it('Should compile all ZK programs', async () => {
        // await compile(Elgamal, 'Elgamal', profiling);
        await Utils.compile(BatchEncryption, cache);
        // await compile(BatchDecryption, 'BatchDecryption', profiling);
    });

    xit('Should encrypt sucessfully', async () => {
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

    xit('Should decrypt sucessfully', async () => {
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
                publicKeys: new CArray(
                    [...Array(length).keys()].map((e) => pubKey)
                ),
                c: new cArray(encryptions.map((e) => e.c)),
                U: new UArray(encryptions.map((e) => e.U)),
                memberId: Field(0),
            }),
            new PlainArray(plains.map((e) => CustomScalar.fromScalar(e))),
            new RandomArray(randoms.map((e) => CustomScalar.fromScalar(e)))
        );

        let privateKey = PrivateKey.random();
        let publicKey = privateKey.toPublicKey();
        let contracts: { [key: string]: Contract } = {
            round2: {
                key: {
                    privateKey: privateKey,
                    publicKey: publicKey,
                },
                contract: new Round2Contract(publicKey),
                actionStates: [],
            },
        };
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
            new PlainArray(
                decryptions.map((e) => CustomScalar.fromScalar(e.m))
            ),
            prvKey
        );
    });

    afterAll(() => {
        if (profiling) DKGProfiler.store();
    });
});
