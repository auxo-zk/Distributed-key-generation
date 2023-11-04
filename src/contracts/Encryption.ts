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
} from 'o1js';
import { Utils } from '@auxo-dev/dkg-libs';

class GroupDynamicArray extends Utils.GroupDynamicArray(16) {}
class PublicKeyDynamicArray extends Utils.PublicKeyDynamicArray(16) {}
class ScalarDynamicArray extends Utils.ScalarDynamicArray(16) {}

export class Bit255 extends Utils.FieldDynamicArray(255) {
  static fromXOR(a: Scalar | Bit255, b: Scalar | Bit255): Bit255 {
    let res = [];
    let aBits = a.toFields();
    let bBits = b.toFields();
    for (let i = 0; i < 255; i++) {
      let xorRes = Provable.if(
        aBits[i].add(bBits[i]).equals(Field(1)),
        Field(1),
        Field(0)
      );
      res.push(xorRes);
    }
    return new Bit255(res);
  }

  equals(c: Bit255): Bool {
    let res = Bool(true);
    for (let i = 0; i < 255; i++) {
      res.and(this.values[i].equals(c.values[i]));
    }
    return res;
  }

  assertEquals(c: Bit255): void {
    for (let i = 0; i < 255; i++) {
      this.values[i].assertEquals(c.values[i]);
    }
  }
}

export class ElgamalInput extends Struct({
  pubKey: PublicKey,
  cipher: Bit255,
  U: Group,
}) {}

export const Elgamal = Experimental.ZkProgram({
  publicInput: ElgamalInput,
  methods: {
    encrypt: {
      privateInputs: [Scalar, Scalar],
      method(input: ElgamalInput, plain: Scalar, random: Scalar) {
        input.U.assertEquals(Group.generator.scale(random));
        let V = input.pubKey.toGroup().scale(random);
        let k = Scalar.fromFields(
          Poseidon.hash(input.U.toFields().concat(V.toFields()))
            .toBits()
            .map((e) => e.toField())
        );
        let encrypted = Bit255.fromXOR(plain, k);
        encrypted.assertEquals(input.cipher);
      },
    },
    decrypt: {
      privateInputs: [Scalar, PrivateKey],
      method(input: ElgamalInput, plain: Scalar, prvKey: PrivateKey) {
        let V = input.U.scale(Scalar.fromFields(prvKey.toFields()));
        let k = Scalar.fromFields(
          Poseidon.hash(input.U.toFields().concat(V.toFields()))
            .toBits()
            .map((e) => e.toField())
        );
        let decrypted = Bit255.fromXOR(input.cipher, k);
        decrypted.assertEquals(new Bit255(plain.toFields()));
      },
    },
  },
});

export class BatchEncryptionInput extends Struct({
  publicKeys: GroupDynamicArray,
  c: ScalarDynamicArray,
  U: GroupDynamicArray,
  memberId: Field,
}) {}

export const BatchEncryption = Experimental.ZkProgram({
  publicInput: BatchEncryptionInput,
  methods: {
    encrypt: {
      privateInputs: [ScalarDynamicArray, ScalarDynamicArray],
      method(
        input: BatchEncryptionInput,
        randomValues: ScalarDynamicArray,
        polynomialValues: ScalarDynamicArray
      ) {
        let length = input.publicKeys.length;
        input.c.length.assertEquals(length);
        input.U.length.assertEquals(length);

        for (let i = 0; i < 16; i++) {
          let iField = Field(i);
          let random = randomValues.get(iField).toScalar();
          let plain = polynomialValues.get(iField).toScalar();
          let pubKey = input.publicKeys.get(iField);
          let cipher = new Bit255(input.c.get(iField).toScalar().toFields());
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
          let k = Scalar.fromFields(
            Poseidon.hash(input.U.toFields().concat(V.toFields()))
              .toBits()
              .map((e) => e.toField())
          );
          let encrypted = Bit255.fromXOR(plain, k);
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

export class EncryptionProof extends Experimental.ZkProgram.Proof(
  BatchEncryption
) {}

export class BatchDecryptionInput extends Struct({
  publicKey: PublicKey,
  c: ScalarDynamicArray,
  U: GroupDynamicArray,
  memberId: Field,
}) {}

export const BatchDecryption = Experimental.ZkProgram({
  publicInput: BatchDecryptionInput,
  methods: {
    decrypt: {
      privateInputs: [ScalarDynamicArray, Scalar],
      method(
        input: BatchDecryptionInput,
        polynomialValues: ScalarDynamicArray,
        privateKey: Scalar
      ) {
        let length = input.c.length;
        input.U.length.assertEquals(length);
        new PrivateKey(privateKey).toPublicKey().assertEquals(input.publicKey);

        for (let i = 0; i < 16; i++) {
          let iField = Field(i);
          let plain = polynomialValues.get(iField).toScalar();
          let cipher = new Bit255(input.c.get(iField).toScalar().toFields());
          // Avoid scaling zero point
          let V = input.U.get(iField).scale(privateKey);
          let k = Scalar.fromFields(
            Poseidon.hash(input.U.toFields().concat(V.toFields()))
              .toBits()
              .map((e) => e.toField())
          );
          let decrypted = Bit255.fromXOR(cipher, k);
          Provable.if(
            input.memberId.equals(iField),
            Bool(true),
            decrypted.equals(new Bit255(plain.toFields()))
          ).assertTrue();
        }
      },
    },
  },
});

export class DecryptionProof extends Experimental.ZkProgram.Proof(
  BatchDecryption
) {}
