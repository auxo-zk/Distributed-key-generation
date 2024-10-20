import { Bool, Field, Group, Poseidon, PublicKey, Struct } from 'o1js';
import {
    FieldDynamicArray,
    GroupDynamicArray,
    PublicKeyDynamicArray,
    StaticArray,
    Utils,
} from '@auxo-dev/auxo-libs';
import {
    ENC_BIT_LIMITS,
    ENC_LIMITS,
    INST_BIT_LIMITS,
    INST_LIMITS,
} from '../constants';

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
    EncryptionIndices,
    EncryptionMode,
    EncryptionNote,
    SecretNote,
    SubVectorFieldArray,
    SubVectorGroupArray,
    ResolutionFieldArray,
    EncryptionConfig,
};

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

class MemberFieldArray extends FieldDynamicArray(INST_LIMITS.MEMBER) {}
class MemberGroupArray extends GroupDynamicArray(INST_LIMITS.MEMBER) {}
class MemberPublicKeyArray extends PublicKeyDynamicArray(INST_LIMITS.MEMBER) {}
class ThresholdFieldArray extends FieldDynamicArray(INST_LIMITS.THRESHOLD) {}
class ThresholdGroupArray extends GroupDynamicArray(INST_LIMITS.THRESHOLD) {}
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
class ResponseContribution extends GroupDynamicArray(INST_LIMITS.MEMBER) {}
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
enum EncryptionMode {
    OPTIMIZED_PRIVACY,
    OPTIMIZED_TXS,
}

class SubVectorFieldArray extends FieldDynamicArray(ENC_LIMITS.SUB_DIMENSION) {}
class SubVectorGroupArray extends GroupDynamicArray(ENC_LIMITS.SUB_DIMENSION) {}
class ResolutionFieldArray extends FieldDynamicArray(ENC_LIMITS.RESOLUTION) {}
class EncryptionConfig extends Struct({
    packedConfig: Field,
}) {
    static assertCorrect(config: EncryptionConfig) {
        let { base, d } = config;
        Utils.divExact(d, Field(ENC_LIMITS.SUB_DIMENSION)).assertTrue();
        d.assertLessThanOrEqual(ENC_LIMITS.DIMENSION);
        base.assertLessThanOrEqual(Field(ENC_LIMITS.RESULT));
    }

    assertCorrect() {
        EncryptionConfig.assertCorrect(this);
    }

    static packConfig(n: Field, l: Field, d: Field): EncryptionConfig {
        return new EncryptionConfig({
            packedConfig: Field.fromBits([
                ...n.toBits(ENC_BIT_LIMITS.RESULT),
                ...l.toBits(ENC_BIT_LIMITS.RESULT),
                ...d.toBits(ENC_BIT_LIMITS.DIMENSION),
            ]),
        });
    }

    static fromBits(bits: Bool[]): EncryptionConfig {
        return new EncryptionConfig({
            packedConfig: Field.fromBits([
                ...bits.slice(0, ENC_BIT_LIMITS.RESULT),
                ...bits.slice(ENC_BIT_LIMITS.RESULT, 2 * ENC_BIT_LIMITS.RESULT),
                ...bits.slice(
                    2 * ENC_BIT_LIMITS.RESULT,
                    2 * ENC_BIT_LIMITS.RESULT + ENC_BIT_LIMITS.DIMENSION
                ),
            ]),
        });
    }

    static sizeInBits(): number {
        return 2 * ENC_BIT_LIMITS.RESULT + ENC_BIT_LIMITS.DIMENSION;
    }

    toBits(): Bool[] {
        return [
            ...this.n.toBits(ENC_BIT_LIMITS.RESULT),
            ...this.l.toBits(ENC_BIT_LIMITS.RESULT),
            ...this.d.toBits(ENC_BIT_LIMITS.DIMENSION),
        ].flat();
    }

    hash(): Field {
        return Poseidon.hash([this.packedConfig]);
    }

    get n(): Field {
        return Field.fromBits(
            this.packedConfig.toBits().slice(0, ENC_BIT_LIMITS.RESULT)
        );
    }

    get l(): Field {
        return Field.fromBits(
            this.packedConfig
                .toBits()
                .slice(ENC_BIT_LIMITS.RESULT, 2 * ENC_BIT_LIMITS.RESULT)
        );
    }

    get d(): Field {
        return Field.fromBits(
            this.packedConfig
                .toBits()
                .slice(
                    2 * ENC_BIT_LIMITS.RESULT,
                    2 * ENC_BIT_LIMITS.RESULT + ENC_BIT_LIMITS.DIMENSION
                )
        );
    }

    get base(): Field {
        return this.n.mul(this.l);
    }
}

class EncryptionIndices extends StaticArray(Field, ENC_LIMITS.SUB_DIMENSION) {}
class EncryptionIndicesMap extends StaticArray(
    Bool,
    ENC_LIMITS.SUB_DIMENSION
) {}
class EncryptionNote extends Struct({
    indices: Field,
    R: SubVectorGroupArray,
    M: SubVectorGroupArray,
    commitments: SubVectorFieldArray,
}) {
    static packIndices(indices: EncryptionIndices): Field {
        let map = new EncryptionIndicesMap();
        let indicesBits = [];
        for (let i = 0; i < ENC_LIMITS.SUB_DIMENSION; i++) {
            let index = indices.get(Field(i));
            let isExisted = map.get(index);
            isExisted.assertFalse();
            map.set(index, Bool(true));
            indicesBits.push(...index.toBits(ENC_BIT_LIMITS.DIMENSION));
        }
        return Field.fromBits(indicesBits);
    }
    getIndex(i: number): Field {
        return Field.fromBits(
            this.indices
                .toBits()
                .slice(
                    i * ENC_BIT_LIMITS.DIMENSION,
                    (i + 1) * ENC_BIT_LIMITS.DIMENSION
                )
        );
    }
}

class SecretNote extends Struct({
    taskId: Field,
    index: Field,
    value: Field,
    nullifier: Field,
}) {
    static new(taskId: Field, index: Field, value: Field): SecretNote {
        let nullifier = Field.random();
        return new SecretNote({ taskId, index, value, nullifier });
    }
    static calculateCommitment(
        requester: PublicKey,
        nullifier: Field,
        taskId: Field,
        index: Field,
        secret: Field
    ) {
        return Poseidon.hash(
            [requester.toFields(), nullifier, taskId, index, secret].flat()
        );
    }
    commitment(requester: PublicKey): Field {
        return SecretNote.calculateCommitment(
            requester,
            this.nullifier,
            this.taskId,
            this.index,
            this.value
        );
    }
}
