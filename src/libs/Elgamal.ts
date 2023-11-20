import { Bit255 } from '@auxo-dev/auxo-libs';
import { Group, Poseidon, PrivateKey, Scalar } from 'o1js';

export { encrypt, decrypt };

function encrypt(
  m: Scalar,
  pbK: Group,
  b: Scalar
): {
  c: Bit255;
  U: Group;
} {
  let U = Group.generator.scale(b);
  let V = pbK.scale(b);
  let k = Poseidon.hash(U.toFields().concat(V.toFields()));
  let c = Bit255.xor(Bit255.fromBits(k.toBits()), Bit255.fromScalar(m));
  return { c, U };
}

function decrypt(c: Bit255, U: Group, prvK: Scalar): { m: Scalar } {
  let V = U.scale(Scalar.from(prvK.toBigInt()));
  let k = Poseidon.hash(U.toFields().concat(V.toFields()));
  let kBits = Bit255.fromBits(k.toBits());
  let m = Bit255.xor(kBits, c).toScalar();
  return { m: m };
}
