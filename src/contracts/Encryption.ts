import {
  Bool,
  Experimental,
  Field,
  Group,
  Poseidon,
  PrivateKey,
  Provable,
  PublicKey,
  Scalar,
  Struct,
  ZkProgram,
} from 'o1js';
import { Bit255, ScalarDynamicArray } from '@auxo-dev/auxo-libs';
import {
  COMMITTEE_MAX_SIZE,
  CArray,
  cArray,
  UArray,
} from '../libs/Committee.js';
export class PlainArray extends ScalarDynamicArray(COMMITTEE_MAX_SIZE) {}
export class RandomArray extends ScalarDynamicArray(COMMITTEE_MAX_SIZE) {}

export class ElgamalInput extends Struct({
  pubKey: PublicKey,
  cipher: Bit255,
  U: Group,
}) {}

export const Elgamal = ZkProgram({
  name: 'Elgamal',
  publicInput: ElgamalInput,
  methods: {
    encrypt: {
      privateInputs: [Scalar, Scalar],
      method(input: ElgamalInput, plain: Scalar, random: Scalar) {
        input.U.assertEquals(Group.generator.scale(random));
        let V = input.pubKey.toGroup().scale(random);
        let k = Bit255.fromBigInt(
          Poseidon.hash(input.U.toFields().concat(V.toFields())).toBigInt()
        );
        let plainBits = Bit255.fromScalar(plain);
        let encrypted = Bit255.xor(plainBits, k);
        encrypted.assertEquals(input.cipher);
      },
    },
    decrypt: {
      privateInputs: [Scalar, PrivateKey],
      method(input: ElgamalInput, plain: Scalar, prvKey: PrivateKey) {
        let V = input.U.scale(Scalar.fromFields(prvKey.toFields()));
        let k = Bit255.fromBigInt(
          Poseidon.hash(input.U.toFields().concat(V.toFields())).toBigInt()
        );
        let decrypted = Bit255.xor(input.cipher, k);
        decrypted.assertEquals(Bit255.fromScalar(plain));
      },
    },
  },
});

export class BatchEncryptionInput extends Struct({
  publicKeys: CArray,
  c: cArray,
  U: UArray,
  memberId: Field,
}) {}

export const BatchEncryption = ZkProgram({
  name: 'batch-encryption',
  publicInput: BatchEncryptionInput,
  methods: {
    encrypt: {
      privateInputs: [PlainArray, RandomArray],
      method(
        input: BatchEncryptionInput,
        polynomialValues: PlainArray,
        randomValues: RandomArray
      ) {
        let length = input.publicKeys.length;
        input.c.length.assertEquals(length);
        input.U.length.assertEquals(length);

        for (let i = 0; i < 16; i++) {
          let iField = Field(i);
          let random = randomValues.get(iField).toScalar();
          let plain = polynomialValues.get(iField).toScalar();
          let pubKey = input.publicKeys.get(iField);
          let cipher = input.c.get(iField);
          let U = Provable.if(
            input.memberId.equals(iField),
            Group.zero,
            Group.generator.scale(random)
          );
          input.U.get(iField).assertEquals(U);
          // Avoid scaling zero point
          let V = pubKey
            .add(Group.generator)
            .scale(random)
            .sub(Group.generator.scale(random));
          let k = Bit255.fromBigInt(
            Poseidon.hash(input.U.toFields().concat(V.toFields())).toBigInt()
          );
          let plainBits = Bit255.fromScalar(plain);
          let encrypted = Bit255.xor(plainBits, k);
          Provable.if(
            input.memberId.equals(iField),
            Bool(true),
            encrypted.equals(cipher)
          ).assertTrue();
        }
      },
    },
  },
});

export class BatchEncryptionProof extends ZkProgram.Proof(BatchEncryption) {}

export class BatchDecryptionInput extends Struct({
  publicKey: PublicKey,
  c: cArray,
  U: UArray,
  memberId: Field,
}) {}

export const BatchDecryption = ZkProgram({
  name: 'batch-decryption',
  publicInput: BatchDecryptionInput,
  methods: {
    decrypt: {
      privateInputs: [PlainArray, Scalar],
      method(
        input: BatchDecryptionInput,
        polynomialValues: PlainArray,
        privateKey: Scalar
      ) {
        let length = input.c.length;
        input.U.length.assertEquals(length);
        new PrivateKey(privateKey).toPublicKey().assertEquals(input.publicKey);

        for (let i = 0; i < 16; i++) {
          let iField = Field(i);
          let plain = polynomialValues.get(iField).toScalar();
          let cipher = input.c.get(iField);
          // Avoid scaling zero point
          let V = input.U.get(iField).scale(privateKey);
          let k = Bit255.fromBigInt(
            Poseidon.hash(input.U.toFields().concat(V.toFields())).toBigInt()
          );
          let decrypted = Bit255.xor(cipher, k);
          Provable.if(
            input.memberId.equals(iField),
            Bool(true),
            decrypted.equals(Bit255.fromScalar(plain))
          ).assertTrue();
        }
      },
    },
  },
});

export class BatchDecryptionProof extends ZkProgram.Proof(BatchDecryption) {}
