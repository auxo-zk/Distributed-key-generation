import { Field, Group, Poseidon, Struct } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { INST_BIT_LIMITS } from '../../constants.js';
import { ZkAppAction } from '../constants.js';

export { Action, ActionEnum, KeyStatus };

const enum KeyStatus {
    EMPTY,
    CONTRIBUTION,
    ACTIVE,
    DEPRECATED,
}

const enum ActionEnum {
    GENERATE,
    FINALIZE,
    DEPRECATE,
    __LENGTH,
}

const { COMMITTEE, KEY } = INST_BIT_LIMITS;

/**
 * Class of action dispatched by users
 * @param committeeId Incremental committee index
 * @param keyId Incremental key index of a committee
 * @param mask Specify action type (defined with ActionEnum)
 * @function hash Return the action's hash to append in the action state hash chain
 * @function toFields Return the action in the form of Fields[]
 */
class Action
    extends Struct({
        packedData: Field, // Pack = [committeeId, keyId, actionType]
        fee: Field,
        key: Group,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            fee: Field(0),
            key: Group.zero,
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static pack(committeeId: Field, keyId: Field, actionType: Field): Field {
        return Field.fromBits([
            ...committeeId.toBits(COMMITTEE),
            ...keyId.toBits(KEY),
            ...actionType.toBits(Utils.getBitLength(ActionEnum.__LENGTH)),
        ]);
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
    get committeeId(): Field {
        return Field.fromBits(this.packedData.toBits().slice(0, COMMITTEE));
    }
    get keyId(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(COMMITTEE, COMMITTEE + KEY)
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY,
                    COMMITTEE + KEY + Utils.getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}
