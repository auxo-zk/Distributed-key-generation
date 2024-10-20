import { Field, Group, Poseidon, Struct } from 'o1js';
import { DynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { INST_BIT_LIMITS, INST_LIMITS } from '../../constants.js';
import { ZkAppAction } from '../constants.js';

export {
    ActionEnum,
    Action,
    CommitPolynomialActions,
    ContributeActions,
    CommitShareActions,
};

const { COMMITTEE, KEY, MEMBER, THRESHOLD } = INST_BIT_LIMITS;

const enum ActionEnum {
    COMMIT_POLY,
    CONTRIBUTE,
    COMMIT_SHARE,
    __LENGTH,
}

class Action
    extends Struct({
        packedData: Field, // Pack = [committeeId, keyId, memberId, targetId, N, T, actionType]
        G: Group, // Used for both polynomial commitments and contribution encryptions
        c: Field,
        f: Field, // Used for both polynomial commitments and share commitments
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            G: Group.zero,
            c: Field(0),
            f: Field(0),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static pack(
        committeeId: Field,
        keyId: Field,
        memberId: Field,
        targetId: Field,
        N: Field,
        T: Field,
        actionType: Field
    ): Field {
        return Field.fromBits([
            ...committeeId.toBits(COMMITTEE),
            ...keyId.toBits(KEY),
            ...memberId.toBits(MEMBER),
            ...targetId.toBits(MEMBER),
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
    get keyId(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(COMMITTEE, COMMITTEE + KEY)
        );
    }
    get memberId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(COMMITTEE + KEY, COMMITTEE + KEY + MEMBER)
        );
    }
    get targetId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(COMMITTEE + KEY + MEMBER, COMMITTEE + KEY + 2 * MEMBER)
        );
    }
    get N(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY + 2 * MEMBER,
                    COMMITTEE + KEY + 3 * MEMBER
                )
        );
    }
    get T(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY + 3 * MEMBER,
                    COMMITTEE + KEY + 3 * MEMBER + THRESHOLD
                )
        );
    }
    get actionType(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    COMMITTEE + KEY + 3 * MEMBER + THRESHOLD,
                    COMMITTEE +
                        KEY +
                        3 * MEMBER +
                        THRESHOLD +
                        Utils.getBitLength(ActionEnum.__LENGTH)
                )
        );
    }
}

class CommitPolynomialActions extends DynamicArray(
    Action,
    INST_LIMITS.THRESHOLD
) {}
class ContributeActions extends DynamicArray(Action, INST_LIMITS.MEMBER) {}
class CommitShareActions extends DynamicArray(Action, INST_LIMITS.MEMBER) {}
