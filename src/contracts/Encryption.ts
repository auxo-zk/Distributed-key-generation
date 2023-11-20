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
  methods: {
    encrypt: {
      privateInputs: [Scalar, Scalar],
      method(input: ElgamalInput, plain: Scalar, random: Scalar) {
        let U = Group.generator.scale(random);
        let V = input.pubKey
          .add(Group.generator)
          .scale(random)
          .sub(Group.generator.scale(random));
        let k = Poseidon.hash(input.U.toFields().concat(V.toFields()));
        let kBits = Bit255.fromBits(k.toBits());
        let plainBits = Bit255.fromScalar(plain);
        let encrypted = Bit255.xor(kBits, plainBits);
        encrypted.assertEquals(input.c);
      },
    },
    decrypt: {
      privateInputs: [Scalar, Scalar],
      method(input: ElgamalInput, plain: Scalar, prvKey: Scalar) {
        let V = input.U.scale(prvKey);
        let k = Poseidon.hash(input.U.toFields().concat(V.toFields()));
        let kBits = Bit255.fromBits(k.toBits());
        let decrypted = Bit255.xor(kBits, input.c).toScalar();
        CustomScalar.fromScalar(decrypted).assertEquals(
          CustomScalar.fromScalar(plain)
        );
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
          let k = Poseidon.hash(input.U.toFields().concat(V.toFields()));
          let plain = polynomialValues.get(iField);
          let kBits = Bit255.fromBits(k.toBits());
          let plainBits = Bit255.fromScalar(plain.toScalar());
          // let plainBits = new Bit255({
          //   head: plain.head,
          //   tail: plain.tail,
          // });
          let encrypted = Bit255.xor(kBits, plainBits);
          Provable.log('ZkProgram value:', encrypted);
          Provable.log('Lib value:', cipher);
          Provable.if(
            input.memberId.equals(iField).or(iField.greaterThanOrEqual(length)),
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
  publicKey: Group,
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
        Group.generator.scale(privateKey).assertEquals(input.publicKey);

        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          let iField = Field(i);
          let plain = polynomialValues.get(iField);
          let cipher = input.c.get(iField);
          let V = input.U.get(iField).scale(privateKey);
          let k = Poseidon.hash(input.U.toFields().concat(V.toFields()));
          let kBits = Bit255.fromBits(k.toBits());
          let decrypted = Bit255.xor(kBits, cipher);

          Provable.if(
            input.memberId.equals(iField),
            Bool(true),
            CustomScalar.fromScalar(decrypted.toScalar()).equals(plain)
            // new CustomScalar({
            //   head: decrypted.head,
            //   tail: decrypted.tail,
            // }).equals(plain)
          ).assertTrue();
        }
      },
    },
  },
});

export class BatchDecryptionProof extends ZkProgram.Proof(BatchDecryption) {}
