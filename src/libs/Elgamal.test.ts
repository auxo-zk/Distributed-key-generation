import { Group, Scalar } from 'o1js';
import * as ElgamalECC from './Elgamal';

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
