import { Bit255, CustomScalar } from '@auxo-dev/auxo-libs';
import { Bool, Field, Group, Poseidon, Provable, Scalar } from 'o1js';

/**
 * Encryption
 * - Input:
 *   + m: Scalar => bits => Bit255,
 *   + k: Field => bits => Bit255
 * - Xor: Bit255 ^ Bit255 = bits ^ bits
 * - Output:
 *   + c: Bit255
 *
 * Decryption
 * - Input:
 *   + c: Bit255
 *   + k: Field => bits => Bit255
 * - Xor: Bit255 ^ Bit255 = bits ^ bits
 * - Output:
 *   + m: Bit255 => bits => Scalar
 */

function scalarToBigInt(s: Scalar): bigint {
  return Field.fromBits(
    s.toFields().map((e) => Bool.fromFields([e]))
  ).toBigInt();
}

function fieldToBigInt(f: Field): bigint {
  return f.toBigInt();
}

export function encrypt(
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
  let xor = fieldToBigInt(k) ^ scalarToBigInt(m);
  let c = Bit255.fromBits(Field.fromJSON(xor.toString()).toBits());
  return { c, U };
}

export function decrypt(c: Bit255, U: Group, prvK: Scalar): { m: Scalar } {
  let V = U.add(Group.generator).scale(prvK).sub(Group.generator.scale(prvK));
  let k = Poseidon.hash(U.toFields().concat(V.toFields()));
  let xor = fieldToBigInt(k) ^ c.toBigInt();
  let m = Bit255.fromBits(Field.fromJSON(xor.toString()).toBits()).toScalar();
  return { m: m };
}
