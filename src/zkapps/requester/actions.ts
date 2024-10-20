import { Field, Group, Poseidon, Struct, UInt32 } from 'o1js';
import {
    ENC_BIT_LIMITS,
    ENC_LIMITS,
    INST_BIT_LIMITS,
} from '../../constants.js';
import { ZkAppAction } from '../constants.js';
import { EncryptionConfig } from '../../libs/types.js';
import { DynamicArray } from '@auxo-dev/auxo-libs';

const { COMMITTEE, KEY, TASK } = INST_BIT_LIMITS;
const { DIMENSION } = ENC_BIT_LIMITS;

export { Action, EncryptActions };

class Action
    extends Struct({
        packedData: Field,
        commitment: Field,
        R: Group,
        M: Group,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            commitment: Field(0),
            R: Group.zero,
            M: Group.zero,
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static packData(
        blocknumber: UInt32,
        index: Field,
        taskId: Field,
        committeeId: Field,
        keyId: Field,
        config: EncryptionConfig
    ): Field {
        return Field.fromBits([
            ...blocknumber.value.toBits(32),
            ...index.toBits(DIMENSION),
            ...taskId.toBits(TASK),
            ...committeeId.toBits(COMMITTEE),
            ...keyId.toBits(KEY),
            ...config.toBits(),
        ]);
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
    get blocknumber(): UInt32 {
        return UInt32.Unsafe.fromField(
            Field.fromBits(this.packedData.toBits().slice(0, 32))
        );
    }
    get index(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(32, 32 + DIMENSION)
        );
    }
    get taskId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(32 + DIMENSION, 32 + DIMENSION + TASK)
        );
    }
    get committeeId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(32 + DIMENSION + TASK, 32 + DIMENSION + TASK + COMMITTEE)
        );
    }
    get keyId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + DIMENSION + TASK + COMMITTEE,
                    32 + DIMENSION + TASK + COMMITTEE + KEY
                )
        );
    }
    get config(): EncryptionConfig {
        return EncryptionConfig.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + DIMENSION + TASK + COMMITTEE + KEY,
                    32 +
                        DIMENSION +
                        TASK +
                        COMMITTEE +
                        KEY +
                        EncryptionConfig.sizeInBits()
                )
        );
    }
}

class EncryptActions extends DynamicArray(Action, ENC_LIMITS.SUB_DIMENSION) {}
