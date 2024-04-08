import { Bit255 } from '@auxo-dev/auxo-libs';
import { Group, Poseidon, Scalar } from 'o1js';

export { encrypt, decrypt };

/**
 * Encryption
 * - Input:
 *   + m: Scalar => Field[] => bits => Bit255,
 *   + k: Field => bigint => Bit255
 * - Xor: Bit255 ^ Bit255
 * - Output:
 *   + c: Bit255
 *
 * Decryption
 * - Input:
 *   + c: Bit255
 *   + k: Field => bigint => Bit255
 * - Xor: Bit255 ^ Bit255
 * - Output:
 *   + m: Bit255 => => Scalar
 */

function encrypt(
    m: Scalar,
    pbK: Group,
    b: Scalar
): {
    c: Bit255;
    U: Group;
} {
    let U = Group.generator.scale(b);
    let V = pbK.add(Group.generator).scale(b).sub(Group.generator.scale(b));
    let k = Poseidon.hash(U.toFields().concat(V.toFields()));
    let c = Bit255.fromBigInt(k.toBigInt()).xor(Bit255.fromScalar(m));
    return { c, U };
}

function decrypt(c: Bit255, U: Group, prvK: Scalar): { m: Scalar } {
    let V = U.add(Group.generator).scale(prvK).sub(Group.generator.scale(prvK));
    let k = Poseidon.hash(U.toFields().concat(V.toFields()));
    let m = Bit255.fromBigInt(k.toBigInt()).xor(c).toScalar();
    return { m: m };
}
