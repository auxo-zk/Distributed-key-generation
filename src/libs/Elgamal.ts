import {
  Bool,
  Encryption,
  Field,
  Group,
  MerkleWitness,
  Poseidon,
  PrivateKey,
  Provable,
  PublicKey,
  Scalar,
  Struct,
  UInt32,
} from 'o1js';

export { encrypt, decrypt };

function encrypt(
  m: bigint,
  pbK: PublicKey
): {
  b: bigint;
  c: bigint;
  U: Group;
} {
  let b = Scalar.random();
  let U = Group.generator.scale(b);
  let V = pbK.toGroup().scale(b);
  let k = Poseidon.hash(U.toFields().concat(V.toFields())).toBigInt();
  let c = k ^ m;
  return { b: b.toBigInt(), c, U };
}

function decrypt(c: bigint, U: Group, prvK: PrivateKey): { m: bigint } {
  let V = U.scale(Scalar.from(prvK.toBigInt()));
  let k = Poseidon.hash(U.toFields().concat(V.toFields())).toBigInt();
  let m = k ^ c;
  return { m };
}
