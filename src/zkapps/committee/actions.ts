import { Field, Poseidon, PublicKey, Struct } from 'o1js';
import { DynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { ZkAppAction } from '../constants.js';
import { INST_BIT_LIMITS, INST_LIMITS } from '../../constants.js';

export { ActionEnum, Action, CreateActions };

const enum ActionEnum {
    CREATE,
    JOIN,
    LEAVE,
    __LENGTH,
}

const { COMMITTEE, MEMBER, THRESHOLD } = INST_BIT_LIMITS;

class Action
    extends Struct({
        packedData: Field, // Pack = [committeeId, N, T, actionType]
        address: PublicKey,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            address: PublicKey.empty(),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static pack(
        committeeId: Field,
        N: Field,
        T: Field,
        actionType: Field
    ): Field {
        return Field.fromBits([
            ...committeeId.toBits(COMMITTEE),
            ...N.toBits(MEMBER),
            ...T.toBits(THRESHOLD),
            ...actionType.toBits(Utils.getBitLength(ActionEnum.__LENGTH)),
        ]);
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
    get committeeId(): Field {
        return Field.fromBits(this.packedData.toBits().slice(0, COMMITTEE));
    }
    get N(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(COMMITTEE, COMMITTEE + MEMBER)
        );
    }
    get T(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(COMMITTEE + MEMBER, COMMITTEE + MEMBER + THRESHOLD)
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + MEMBER + THRESHOLD,
                    COMMITTEE +
                        MEMBER +
                        THRESHOLD +
                        Utils.getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}

class CreateActions extends DynamicArray(Action, INST_LIMITS.MEMBER) {}
