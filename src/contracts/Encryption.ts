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
import { Bit255, ScalarDynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { CArray, cArray, UArray } from '../libs/Committee.js';
import { INSTANCE_LIMITS } from '../constants.js';
import { ErrorEnum, ZkProgramEnum } from './constants.js';

export {
    PlainArray,
    RandomArray,
    ElgamalInput,
    Elgamal,
    BatchEncryptionInput,
    BatchEncryption,
    BatchEncryptionProof,
    BatchDecryptionInput,
    BatchDecryption,
    BatchDecryptionProof,
};

class PlainArray extends ScalarDynamicArray(INSTANCE_LIMITS.MEMBER) {}
class RandomArray extends ScalarDynamicArray(INSTANCE_LIMITS.MEMBER) {}
class ElgamalInput extends Struct({
    pubKey: Group,
    c: Bit255,
    U: Group,
}) {}

const Elgamal = ZkProgram({
    name: ZkProgramEnum.Elgamal,
    publicInput: ElgamalInput,
    publicOutput: Bit255,
    methods: {
        encrypt: {
            privateInputs: [Scalar, Scalar],
            async method(input: ElgamalInput, plain: Scalar, random: Scalar) {
                let U = Group.generator.scale(random);
                let V = input.pubKey
                    .add(Group.generator)
                    .scale(random)
                    .sub(Group.generator.scale(random));
                let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
                let kBits = Bit255.fromBits([...k.toBits(), Bool(false)]);
                let plainBits = Bit255.fromScalar(plain);
                let encrypted = Bit255.xor(kBits, plainBits);
                encrypted.assertEquals(
                    input.c,
                    Utils.buildAssertMessage(
                        Elgamal.name,
                        'encrypt',
                        ErrorEnum.ELGAMAL_ENCRYPTION
                    )
                );
                return encrypted;
            },
        },
        decrypt: {
            privateInputs: [Scalar, Scalar],
            async method(input: ElgamalInput, plain: Scalar, prvKey: Scalar) {
                let V = input.U.add(Group.generator)
                    .scale(prvKey)
                    .sub(Group.generator.scale(prvKey));
                let k = Poseidon.hash(input.U.toFields().concat(V.toFields()));
                let kBits = Bit255.fromBits([...k.toBits(), Bool(false)]);
                let decrypted = Bit255.xor(kBits, input.c);
                decrypted.assertEquals(
                    Bit255.fromScalar(plain),
                    Utils.buildAssertMessage(
                        Elgamal.name,
                        'decrypt',
                        ErrorEnum.ELGAMAL_DECRYPTION
                    )
                );
                return decrypted;
            },
        },
    },
});

class BatchEncryptionInput extends Struct({
    publicKeys: CArray,
    c: cArray,
    U: UArray,
    memberId: Field,
}) {}

const BatchEncryption = ZkProgram({
    name: ZkProgramEnum.BatchEncryption,
    publicInput: BatchEncryptionInput,
    methods: {
        encrypt: {
            privateInputs: [PlainArray, RandomArray],
            async method(
                input: BatchEncryptionInput,
                polynomialValues: PlainArray,
                randomValues: RandomArray
            ) {
                let length = input.publicKeys.length;
                input.c.length.assertEquals(
                    length,
                    Utils.buildAssertMessage(
                        Elgamal.name,
                        'encrypt',
                        ErrorEnum.ELGAMAL_BATCH_SIZE
                    )
                );
                input.U.length.assertEquals(
                    length,
                    Utils.buildAssertMessage(
                        Elgamal.name,
                        'encrypt',
                        ErrorEnum.ELGAMAL_BATCH_SIZE
                    )
                );

                for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
                    let iField = Field(i);
                    let random = randomValues.get(iField);
                    let pubKey = input.publicKeys.get(iField);
                    let cipher = input.c.get(iField) as Bit255;
                    let U = Group.generator.scale(random);
                    // Avoid scaling zero point
                    let V = pubKey
                        .add(Group.generator)
                        .scale(random)
                        .sub(Group.generator.scale(random));
                    let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
                    let plain = polynomialValues.get(iField);
                    let kBits = k.toBits();
                    kBits.push(Bool(false));
                    let kBitsPadded = Bit255.fromBits(kBits);
                    let plainBits = Bit255.fromScalar(plain);
                    let encrypted = Bit255.xor(kBitsPadded, plainBits);
                    Provable.if(
                        input.memberId
                            .equals(iField)
                            .or(iField.greaterThanOrEqual(length)),
                        Bool(true),
                        input.U.get(iField)
                            .equals(U)
                            .and(encrypted.equals(cipher))
                    ).assertTrue(
                        Utils.buildAssertMessage(
                            Elgamal.name,
                            'encrypt',
                            ErrorEnum.ELGAMAL_ENCRYPTION
                        )
                    );
                }
            },
        },
    },
});

class BatchEncryptionProof extends ZkProgram.Proof(BatchEncryption) {}

class BatchDecryptionInput extends Struct({
    publicKey: Group,
    c: cArray,
    U: UArray,
    memberId: Field,
}) {}

const BatchDecryption = ZkProgram({
    name: ZkProgramEnum.BatchDecryption,
    publicInput: BatchDecryptionInput,
    publicOutput: Group,
    methods: {
        decrypt: {
            privateInputs: [PlainArray, Scalar],
            async method(
                input: BatchDecryptionInput,
                polynomialValues: PlainArray,
                privateKey: Scalar
            ) {
                let length = input.c.length;
                input.U.length.assertEquals(
                    length,
                    Utils.buildAssertMessage(
                        Elgamal.name,
                        'decrypt',
                        ErrorEnum.ELGAMAL_BATCH_SIZE
                    )
                );
                Group.generator
                    .scale(privateKey)
                    .assertEquals(
                        input.publicKey,
                        Utils.buildAssertMessage(
                            Elgamal.name,
                            'decrypt',
                            ErrorEnum.ELGAMAL_KEY
                        )
                    );
                let ski = Group.generator.scale(Scalar.from(0n));

                for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
                    let iField = Field(i);
                    let plain = polynomialValues.get(iField);
                    let cipher = input.c.get(iField) as Bit255;
                    let U = input.U.get(iField);
                    // Avoid scaling zero point
                    let V = U.add(Group.generator)
                        .scale(privateKey)
                        .sub(Group.generator.scale(privateKey));
                    let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
                    let kBits = Bit255.fromBits([...k.toBits(), Bool(false)]);
                    let decrypted = Bit255.xor(kBits, cipher);
                    Provable.if(
                        input.memberId
                            .equals(iField)
                            .or(iField.greaterThanOrEqual(length)),
                        Bool(true),
                        decrypted.equals(Bit255.fromScalar(plain))
                    ).assertTrue(
                        Utils.buildAssertMessage(
                            Elgamal.name,
                            'decrypt',
                            ErrorEnum.ELGAMAL_DECRYPTION
                        )
                    );
                    ski = ski.add(Group.generator.scale(plain));
                }
                return ski;
            },
        },
    },
});

class BatchDecryptionProof extends ZkProgram.Proof(BatchDecryption) {}
