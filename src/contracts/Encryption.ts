import { Experimental, Field, Group, Poseidon, PrivateKey, Provable, PublicKey, Scalar, Struct } from "o1js";
import { Utils } from "@auxo-dev/dkg-libs";

export class GroupDynamicArray extends Utils.GroupDynamicArray(32) { }
export class PublicKeyDynamicArray extends Utils.PublicKeyDynamicArray(32) { }
export class ScalarDynamicArray extends Utils.PublicKeyDynamicArray(32) { }

export class Bit255 extends Utils.FieldDynamicArray(255) {
  static fromXOR(a: Scalar | Bit255, b: Scalar | Bit255): Bit255 {
    let res: Bit255 = new Bit255;
    let aBits = a.toFields();
    let bBits = b.toFields();
    for (let i = 0; i < 255; i++) {
      let xorRes = Provable.if(
        aBits[i].add(bBits[i]).equals(Field(1)),
        Field, Field(1), Field(0)
      );
      res.push(xorRes);
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
}) { }

export const Elgamal = Experimental.ZkProgram({
  publicInput: ElgamalInput,
  methods: {
    encrypt: {
      privateInputs: [Scalar, Scalar],
      method(input: ElgamalInput, plain: Scalar, random: Scalar) {
        input.U.assertEquals(Group.generator.scale(random));
        let V = input.pubKey.toGroup().scale(random);
        let k = Scalar.fromFields(Poseidon.hash(input.U.toFields().concat(V.toFields())).toFields());
        let encrypted = Bit255.fromXOR(plain, k);
        encrypted.assertEquals(input.cipher);
      },
    },
    decrypt: {
      privateInputs: [Scalar, PrivateKey],
      method(
        input: ElgamalInput,
        plain: Scalar,
        prvKey: PrivateKey,
      ) {
        let V = input.U.scale(Scalar.fromFields(prvKey.toFields()));
        let k = Scalar.fromFields(Poseidon.hash(input.U.toFields().concat(V.toFields())).toFields());
        let decrypted = Bit255.fromXOR(input.cipher, k);
        decrypted.assertEquals(new Bit255(plain.toFields()));
      },
    },
    empty: {
      privateInputs: [],
      method(input: ElgamalInput) { }
    }
  }
})

export class ElgamalInputBatch extends Struct({
  publicKeys: PublicKeyDynamicArray,
  c: ScalarDynamicArray,
  U: GroupDynamicArray,
}) { }