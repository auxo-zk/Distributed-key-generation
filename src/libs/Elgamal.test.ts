import { PrivateKey, Provable, Scalar } from 'o1js';
import * as ElgamalECC from './Elgamal';

describe('ElgamalECC', () => {
    it('Should decrypt successfully', async () => {
        let msg = Scalar.random();
        // console.log('Plain:', msg);
        let privateKey = PrivateKey.random();
        let publicKey = privateKey.toPublicKey();
        let encrypted = ElgamalECC.encrypt(msg.toBigInt(), publicKey);
        // console.log('Cipher:', encrypted);
        let decrypted = ElgamalECC.decrypt(
            encrypted.c,
            encrypted.U,
            privateKey
        );
        // console.log('Plain:', decrypted);
        expect(msg.toBigInt()).toEqual(decrypted.m);
    });
});
