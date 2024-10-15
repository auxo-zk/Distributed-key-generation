import fs from 'fs/promises';
import { Cache, Field, Group, PrivateKey } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import {
    BatchDecryption,
    BatchEncryption,
    BatchEncryptionInput,
    BatchPolyCommitment,
} from '../contracts/ContributionProgram.js';
import {
    Cipher,
    MemberGroupArray,
    MemberFieldArray,
    MemberPublicKeyArray,
    SecretPolynomial,
} from '../libs/types.js';
import { ECElGamal } from '@auxo-dev/o1js-encrypt';
import { generateRandomPolynomial } from '../libs/Committee.js';
import {
    ContributionContract,
    RollupContribution,
} from '../contracts/Contribution.js';
import { Network } from './helper/config.js';
import { prepare } from './helper/prepare.js';

describe('Contribution', () => {
    const doProofs = true;
    const analyzing = false;
    const profiler = Utils.getProfiler('contribution', fs);
    const logger = {
        info: true,
        error: true,
    };
    let cache: Cache;
    let _: any;
    let users: Utils.Key[] = [];
    let T = 2,
        N = 3;
    let members: {
        key: Utils.Key;
        secret: SecretPolynomial;
        encryptions: Cipher[];
        randoms: Field[];
        share: Field;
    }[] = [...Array(N)].map(() => {
        return {
            key: PrivateKey.randomKeypair(),
            secret: generateRandomPolynomial(2, 3),
            encryptions: [],
            randoms: [],
            share: Field(0),
        };
    });

    beforeAll(async () => {
        _ = await prepare(
            './caches',
            { type: Network.Local, doProofs },
            {
                aliases: ['committee'],
            }
        );
        cache = _.cache;
        users = [_.accounts[0], _.accounts[1], _.accounts[2], _.accounts[3]];
    });

    it('Should compile all ZK programs', async () => {
        await Utils.compile(BatchPolyCommitment, { cache, logger, profiler });
        await Utils.compile(BatchEncryption, { cache, logger, profiler });
        await Utils.compile(BatchDecryption, { cache, logger, profiler });
        await Utils.compile(RollupContribution, { cache, logger, profiler });
        if (doProofs) {
            await Utils.compile(ContributionContract, {
                cache,
                logger,
                profiler,
            });
        }
        // console.log(await BatchPolyCommitment.analyzeMethods());
        // console.log(await BatchEncryption.analyzeMethods());
        // console.log(await BatchDecryption.analyzeMethods());
        console.log(await RollupContribution.analyzeMethods());
        console.log(await ContributionContract.analyzeMethods());
    });

    xit('Should batch encrypt successfully', async () => {
        let publicKeys = new MemberPublicKeyArray(
            members.map((member) => member.key.publicKey.toGroup())
        );
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                let random = Field.random();
                members[i].randoms.push(random);
                members[i].encryptions.push(
                    ECElGamal.Lib.encrypt(
                        members[i].secret.f[j],
                        members[j].key.publicKey.toGroup(),
                        random
                    )
                );
            }
            let P = new MemberGroupArray(
                members[i].secret.f.map((e) => Group.generator.scale(e))
            );
            let c = new MemberFieldArray(
                members[i].encryptions.map((e) => e.c)
            );
            let U = new MemberGroupArray(
                members[i].encryptions.map((e) => e.U)
            );
            let memberId = Field(i);
            let encryptionProof = await Utils.prove(
                BatchEncryption.name,
                'encrypt',
                async () =>
                    BatchEncryption.encrypt(
                        new BatchEncryptionInput({
                            publicKeys,
                            P,
                            c,
                            U,
                        }),
                        new MemberFieldArray(members[i].secret.f),
                        new MemberFieldArray(members[i].randoms)
                    ),
                { logger }
            );
            encryptionProof.verify();
        }
    });

    // xit('Should batch decrypt successfully', async () => {
    //     decryptions = [{ m: Scalar.from(1n) }];
    //     for (let i = 1; i < length; i++) {
    //         decryptions.push(
    //             ECElGamal.Lib.decrypt(
    //                 encryptions[i].c,
    //                 encryptions[i].U,
    //                 prvKey
    //             )
    //         );
    //     }
    //     let decryptionProof = await Utils.prove(
    //         BatchDecryption.name,
    //         'decrypt',
    //         async () =>
    //             BatchDecryption.decrypt(
    //                 new BatchDecryptionInput({
    //                     publicKey: pubKey,
    //                     c: new MemberFieldArray(encryptions.map((e) => e.c)),
    //                     U: new MemberGroupArray(encryptions.map((e) => e.U)),
    //                     memberId: Field(0),
    //                 }),
    //                 new PlainArray(decryptions.map((e) => e.m)),
    //                 prvKey
    //             )
    //     );
    //     decryptionProof.verify();
    // });

    afterAll(() => {
        if (profiler) profiler.store();
    });
});
