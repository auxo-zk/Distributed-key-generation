import {
  Bool,
  Field,
  Group,
  Poseidon,
  Provable,
  Scalar,
  Struct,
  ZkProgram,
} from 'o1js';
import { Bit255, CustomScalar, ScalarDynamicArray } from '@auxo-dev/auxo-libs';
import { CArray, cArray, UArray } from '../libs/Committee.js';
import { COMMITTEE_MAX_SIZE } from '../constants.js';

export class PlainArray extends ScalarDynamicArray(COMMITTEE_MAX_SIZE) {}
export class RandomArray extends ScalarDynamicArray(COMMITTEE_MAX_SIZE) {}

export class ElgamalInput extends Struct({
  pubKey: Group,
  c: Bit255,
  U: Group,
}) {}

export const Elgamal = ZkProgram({
  name: 'elgamal',
  publicInput: ElgamalInput,
  publicOutput: Bit255,
  methods: {
    encrypt: {
      privateInputs: [Scalar, Scalar],
      method(input: ElgamalInput, plain: Scalar, random: Scalar) {
        let U = Group.generator.scale(random);
        let V = input.pubKey
          .add(Group.generator)
          .scale(random)
          .sub(Group.generator.scale(random));
        let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
        let kBits = Bit255.fromBits(k.toBits());
        let plainBits = Bit255.fromScalar(plain);
        let encrypted = Bit255.xor(kBits, plainBits);
        encrypted.assertEquals(input.c);
        return encrypted;
      },
    },
    decrypt: {
      privateInputs: [Scalar, Scalar],
      method(input: ElgamalInput, plain: Scalar, prvKey: Scalar) {
        let V = input.U.scale(prvKey);
        let k = Poseidon.hash(input.U.toFields().concat(V.toFields()));
        let kBits = Bit255.fromBits(k.toBits());
        let decrypted = Bit255.xor(kBits, input.c);
        CustomScalar.fromScalar(decrypted.toScalar()).assertEquals(
          CustomScalar.fromScalar(plain)
        );
        return decrypted;
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

        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          let iField = Field(i);
          let random = randomValues.get(iField).toScalar();
          let pubKey = input.publicKeys.get(iField);
          let cipher = input.c.get(iField);
          let U = Group.generator.scale(random);
          // Avoid scaling zero point
          let V = pubKey
            .add(Group.generator)
            .scale(random)
            .sub(Group.generator.scale(random));
          let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
          let plain = polynomialValues.get(iField);
          let kBits = Bit255.fromBits(k.toBits());
          let plainBits = new Bit255({
            head: plain.head,
            tail: plain.tail,
          });
          let encrypted = Bit255.xor(kBits, plainBits);
          Provable.if(
            input.memberId.equals(iField).or(iField.greaterThanOrEqual(length)),
            Bool(true),
            input.U.get(iField).equals(U).and(encrypted.equals(cipher))
          ).assertTrue();
        }
      },
    },
  },
});

export class BatchEncryptionProof extends ZkProgram.Proof(BatchEncryption) {}

export class BatchDecryptionInput extends Struct({
  publicKey: Group,
  c: cArray,
  U: UArray,
  memberId: Field,
}) {}

export const BatchDecryption = ZkProgram({
  name: 'batch-decryption',
  publicInput: BatchDecryptionInput,
  publicOutput: Group,
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
        Group.generator.scale(privateKey).assertEquals(input.publicKey);
        let ski = Group.generator.scale(Scalar.from(0n));

        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          let iField = Field(i);
          let plain = polynomialValues.get(iField);
          let cipher = input.c.get(iField);
          let U = input.U.get(iField);
          // Avoid scaling zero point
          let V = U.add(Group.generator)
            .scale(privateKey)
            .sub(Group.generator.scale(privateKey));
          let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
          let kBits = Bit255.fromBits(k.toBits());
          let decrypted = Bit255.xor(kBits, cipher);

          Provable.if(
            input.memberId.equals(iField).or(iField.greaterThanOrEqual(length)),
            Bool(true),
            new CustomScalar({
              head: decrypted.head,
              tail: decrypted.tail,
            }).equals(plain)
          ).assertTrue();

          ski.add(Group.generator.scale(decrypted.toScalar()));
        }
        return ski;
      },
    },
  },
});

export class BatchDecryptionProof extends ZkProgram.Proof(BatchDecryption) {}
