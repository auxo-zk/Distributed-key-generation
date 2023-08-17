import {
  Field,
  Poseidon,
  Struct,
  UInt32,
  PublicKey,
  Group,
  Scalar,
  Encryption,
} from 'snarkyjs';
import { MerkleWitnessKey, MerkleWitnessCommittee } from './Committee';
import { OffchainStorage } from './offchainStorage';

export const ContributionStage: { [key: string]: Field } = {
  ROUND_1: Field(0),
  ROUND_2: Field(1),
  DECRYPTION: Field(2),
};

export class SecretPolynomial extends Struct({
  C: [Group],
  a0: Field,
  f: [Field],
}) {}

export class ContributionBundle extends Struct({
  root: Field,
  witness: MerkleWitnessKey,
}) {
  getHash(): Field {
    return Poseidon.hash(this.root.toFields());
  }
}
export class Round1Contribution extends Struct({
  C: [Group],
  witnessCommittee: MerkleWitnessCommittee,
  bundleRoot: Field,
  witnessKey: MerkleWitnessKey,
  keyId: Field,
}) {
  getHash(): Field {
    let packed: Field[] = [];
    for (let i = 0; i < this.C.length; i++) {
      packed.concat(this.C[i].toFields());
    }
    return Poseidon.hash(packed);
  }
}

export class Round2Contribution extends Struct({
  encF: [Field],
  witnessCommittee: MerkleWitnessCommittee,
  bundleRoot: Field,
  witnessKey: MerkleWitnessKey,
  keyId: Field,
}) {
  getHash(): Field {
    let packed: Field[] = [];
    for (let i = 0; i < this.encF.length; i++) {
      packed.concat(this.encF);
    }
    return Poseidon.hash(packed);
  }
}

export class DecryptionContribution extends Struct({
  Dx: [Field],
  Dy: [Field],
  witnessCommittee: MerkleWitnessCommittee,
  witnessKey: MerkleWitnessKey,
}) {
  getHash(): Field {
    return Field(0);
  }
}

export class CommitteeMember extends Struct({
  publicKey: PublicKey,
  index: UInt32,
  witness: MerkleWitnessCommittee,
  T: Number,
  N: Number,
}) {
  static getPublicKey(round1Contributions: Round1Contribution[]): PublicKey {
    let result = Group.zero;
    for (let i = 0; i < round1Contributions.length; i++) {
      result = result.add(round1Contributions[i].C[0]);
    }
    return PublicKey.fromGroup(result);
  }

  getHash(): Field {
    return Poseidon.hash(this.publicKey.toFields());
  }

  calculatePolynomialValue(a: Field[], x: number): Field {
    let result = Field(0);
    for (let i = 0; i < this.T; i++) {
      result = result.add(a[i].mul(Math.pow(x, i)));
    }
    return result;
  }

  getRandomPolynomial(): SecretPolynomial {
    let a = new Array<Field>(this.T);
    let C = new Array<Group>(this.T);
    for (let i = 0; i < this.T; i++) {
      a[i] = Field.random();
      C[i] = Group.generator.scale(Scalar.fromFields(a[i].toFields()));
    }

    let f = new Array<Field>(this.N);
    for (let i = 0; i < this.N; i++) {
      f[i] = this.calculatePolynomialValue(a, i + 1);
    }
    return { C: C, a0: a[0], f: f };
  }

  getRound1Contribution(
    secret: SecretPolynomial,
    contributionStorage: OffchainStorage<Round1Contribution>,
    bundleStorage: OffchainStorage<ContributionBundle>,
    keyId: Field
  ): Round1Contribution {
    return new Round1Contribution({
      C: secret.C,
      witnessCommittee: new MerkleWitnessCommittee(
        contributionStorage.getWitness(this.index.toBigint() - 1n)
      ),
      bundleRoot: bundleStorage.getRoot(),
      witnessKey: new MerkleWitnessKey(
        bundleStorage.getWitness(keyId.toBigInt())
      ),
      keyId: keyId,
    });
  }

  getRound2Contribution(
    secret: SecretPolynomial,
    publicKeys: Group[],
    contributionStorage: OffchainStorage<Round1Contribution>,
    bundleStorage: OffchainStorage<ContributionBundle>,
    keyId: Field
  ): Round2Contribution {
    let encryptions = new Array<Field>(this.N);
    for (let i = 0; i < this.N; i++) {
      if (i + 1 == Number(this.index)) {
        encryptions[i] = Field(0);
      } else {
        encryptions[i] = Field.fromFields(
          Encryption.encrypt(
            secret.f[i].toFields(),
            PublicKey.fromGroup(publicKeys[i])
          ).cipherText
        );
      }
    }
    return new Round2Contribution({
      encF: encryptions,
      witnessCommittee: new MerkleWitnessCommittee(
        contributionStorage.getWitness(this.index.toBigint() - 1n)
      ),
      bundleRoot: bundleStorage.getRoot(),
      witnessKey: new MerkleWitnessKey(
        bundleStorage.getWitness(keyId.toBigInt())
      ),
      keyId: keyId,
    });
  }

  calculatePublicKey(publicKeys: Group[]): PublicKey {
    let result = Group.zero;
    for (let i = 0; i < publicKeys.length; i++) {
      result = result.add(publicKeys[i]);
    }
    return PublicKey.fromGroup(result);
  }

  calculateShare() {
    return;
  }

  getDecryptionContribution() {
    return;
  }

  submitDecryptionContribution() {
    return;
  }
}
