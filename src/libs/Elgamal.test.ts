import { PrivateKey, Scalar } from 'o1js';
import * as ElgamalECC from './Elgamal';

describe('ElgamalECC', () => {
  it('Should decrypt successfully', async () => {
    let msg = Scalar.random();
    let privateKey = PrivateKey.random();
    let publicKey = privateKey.toPublicKey();
    let encrypted = ElgamalECC.encrypt(msg.toBigInt(), publicKey);
    let decrypted = ElgamalECC.decrypt(encrypted.c, encrypted.U, privateKey);
    expect(msg.toBigInt()).toEqual(decrypted.m);
  });
});
