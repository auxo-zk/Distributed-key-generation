import {
    Bool,
    Field,
    Group,
    Poseidon,
    Provable,
    Struct,
    UInt32,
    UInt8,
} from 'o1js';
import {
    FieldDynamicArray,
    GroupDynamicArray,
    PublicKeyDynamicArray,
    Utils,
} from '@auxo-dev/auxo-libs';
import { ENC_LIMITS, INST_BIT_LIMITS, INST_LIMITS } from '../constants';

export {
    SecretPolynomial,
    Cipher,
    KeyGenContribution,
    ResponseContribution,
    PackedMemberId,
    MemberFieldArray,
    MemberGroupArray,
    MemberPublicKeyArray,
    ThresholdFieldArray,
    ThresholdGroupArray,
};
export {
    SecretNote,
    EncryptionConfig,
    DimensionFieldArray,
    DimensionGroupArray,
    SplitFieldArray,
    SplitGroupArray,
};

const { MEMBER, THRESHOLD } = INST_LIMITS;
const { DIMENSION, RESULT, SPLIT, SPLIT_SIZE } = ENC_LIMITS;

// Committee Types
type SecretPolynomial = {
    a: Field[];
    C: Group[];
    f: Field[];
};
type Cipher = {
    c: Field;
    U: Group;
};

class MemberFieldArray extends FieldDynamicArray(MEMBER) {}
class MemberGroupArray extends GroupDynamicArray(MEMBER) {}
class MemberPublicKeyArray extends PublicKeyDynamicArray(MEMBER) {}
class ThresholdFieldArray extends FieldDynamicArray(THRESHOLD) {}
class ThresholdGroupArray extends GroupDynamicArray(THRESHOLD) {}
class KeyGenContribution extends Struct({
    C: ThresholdGroupArray,
    c: MemberFieldArray,
    U: MemberGroupArray,
}) {
    static empty(): KeyGenContribution {
        return new KeyGenContribution({
            C: new ThresholdGroupArray(),
            c: new MemberFieldArray(),
            U: new MemberGroupArray(),
        });
    }

    toFields(): Field[] {
        return KeyGenContribution.toFields(this);
    }

    hash(): Field {
        return Poseidon.hash(this.toFields());
    }
}
class ResponseContribution extends GroupDynamicArray(ENC_LIMITS.SPLIT) {}
class PackedMemberId extends Struct({
    packedId: Field,
}) {
    static getId(packedId: Field, idx: Field): Field {
        let idBitLength = INST_BIT_LIMITS.MEMBER;
        return Field.fromBits(
            packedId
                .toBits()
                .slice(
                    Number(idx) * idBitLength,
                    (Number(idx) + 1) * idBitLength
                )
        );
    }

    getId(idx: Field): Field {
        return PackedMemberId.getId(this.packedId, idx);
    }
}

// Requester Types
class DimensionFieldArray extends FieldDynamicArray(DIMENSION) {}
class DimensionGroupArray extends GroupDynamicArray(DIMENSION) {}
class SplitFieldArray extends FieldDynamicArray(SPLIT) {}
class SplitGroupArray extends GroupDynamicArray(SPLIT) {}
class EncryptionConfig extends Struct({
    n: UInt32,
    l: UInt32,
    d: UInt8,
    c: UInt8,
}) {
    static assertCorrect(config: EncryptionConfig) {
        let { base, c, d } = config;
        Utils.divExact(d.value, c.value).assertTrue();
        d.assertLessThanOrEqual(DIMENSION);
        c.assertLessThanOrEqual(SPLIT);
        let splitSize = d.div(c);
        splitSize.assertLessThanOrEqual(SPLIT_SIZE);
        base.assertLessThanOrEqual(
            Provable.switch(
                [
                    splitSize.value.equals(1),
                    splitSize.value.equals(2),
                    splitSize.value.equals(3),
                    splitSize.value.equals(4),
                ],
                Field,
                [
                    Field(RESULT),
                    Field(Math.floor(Math.sqrt(RESULT))),
                    Field(Math.floor(Math.cbrt(RESULT))),
                    Field(Math.floor(Math.sqrt(Math.sqrt(RESULT)))),
                ]
            )
        );
    }

    assertCorrect() {
        EncryptionConfig.assertCorrect(this);
    }

    static fromBits(bits: Bool[]): EncryptionConfig {
        return new EncryptionConfig({
            n: UInt32.Unsafe.fromField(Field.fromBits(bits.slice(0, 32))),
            l: UInt32.Unsafe.fromField(Field.fromBits(bits.slice(32, 64))),
            d: UInt8.Unsafe.fromField(Field.fromBits(bits.slice(64, 72))),
            c: UInt8.Unsafe.fromField(Field.fromBits(bits.slice(72, 80))),
        });
    }

    static sizeInBits(): number {
        return 80;
    }

    toBits(): Bool[] {
        return [
            ...this.n.value.toBits(32),
            ...this.l.value.toBits(32),
            ...this.d.value.toBits(8),
            ...this.c.value.toBits(8),
        ].flat();
    }

    get base(): Field {
        return this.n.value.mul(this.l.value);
    }

    get splitSize(): Field {
        return this.d.div(this.c).value;
    }
}

class SecretNote extends Struct({
    taskId: UInt32,
    index: UInt8,
    value: Field,
    nullifier: Field,
}) {
    static new(taskId: UInt32, index: UInt8, value: Field): SecretNote {
        let nullifier = Field.random();
        return new SecretNote({ taskId, index, value, nullifier });
    }
    static calculateCommitment(
        nullifier: Field,
        taskId: UInt32,
        index: UInt8,
        secret: Field
    ) {
        return Poseidon.hash([nullifier, taskId.value, index.value, secret]);
    }
    get commitment(): Field {
        return SecretNote.calculateCommitment(
            this.nullifier,
            this.taskId,
            this.index,
            this.value
        );
    }
}
