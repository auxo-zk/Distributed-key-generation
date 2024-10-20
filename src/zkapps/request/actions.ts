import { Field, Poseidon, Struct, UInt32 } from 'o1js';
import {
    ENC_BIT_LIMITS,
    ENC_LIMITS,
    INST_BIT_LIMITS,
} from '../../constants.js';
import { ZkAppAction } from '../constants.js';
import { StaticArray } from '@auxo-dev/auxo-libs';

export { RequestStatus, ActionEnum, Action, ResolveActions };

const enum RequestStatus {
    INITIALIZED,
    RESOLVED,
    EXPIRED,
}

const enum ActionEnum {
    INITIALIZE,
    RESOLVE,
    __LENGTH,
}

const { COMMITTEE, KEY, REQUEST, REQUESTER } = INST_BIT_LIMITS;
const { DIMENSION } = ENC_BIT_LIMITS;

class Action
    extends Struct({
        packedData: Field,
        f1: Field, // Used for both initialization and resolution
        f2: Field, // Used for both initialization and resolution
        f3: Field,
        f4: Field,
    })
    implements ZkAppAction
{
    static readonly numResults = 4;
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            f1: Field(0),
            f2: Field(0),
            f3: Field(0),
            f4: Field(0),
        });
    }
    static fromFields(input: Field[]): Action {
        return super.fromFields(input) as Action;
    }
    static pack(
        deadline: UInt32,
        requestId: Field,
        committeeId: Field,
        keyId: Field,
        index1: Field,
        index2: Field,
        index3: Field,
        index4: Field
    ): Field {
        return Field.fromBits([
            ...deadline.value.toBits(32),
            ...requestId.toBits(REQUEST * REQUESTER),
            ...committeeId.toBits(COMMITTEE),
            ...keyId.toBits(KEY),
            ...index1.toBits(DIMENSION),
            ...index2.toBits(DIMENSION),
            ...index3.toBits(DIMENSION),
            ...index4.toBits(DIMENSION),
        ]);
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
    // INITIALIZE actions
    get taskRef(): Field {
        return this.f1;
    }
    get dimension(): Field {
        return this.f2;
    }
    get rAccumulationRoot(): Field {
        return this.f3;
    }
    get mAccumulationRoot(): Field {
        return this.f4;
    }
    // RESOLVE actions
    get indices(): Field[] {
        return [this.index1, this.index2, this.index3, this.index4];
    }
    get results(): Field[] {
        return [this.f1, this.f2, this.f3, this.f4];
    }
    get deadline(): UInt32 {
        return UInt32.Unsafe.fromField(
            Field.fromBits(this.packedData.toBits().slice(0, 32))
        );
    }
    get requestId(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(32, 32 + REQUEST * REQUESTER)
        );
    }
    get committeeId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + REQUEST * REQUESTER,
                    32 + REQUEST * REQUESTER + COMMITTEE
                )
        );
    }
    get keyId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + REQUEST * REQUESTER + COMMITTEE,
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY
                )
        );
    }
    get index1(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY,
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY + DIMENSION
                )
        );
    }
    get index2(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY + DIMENSION,
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY + DIMENSION * 2
                )
        );
    }
    get index3(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY + DIMENSION * 2,
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY + DIMENSION * 3
                )
        );
    }
    get index4(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY + DIMENSION * 3,
                    32 + REQUEST * REQUESTER + COMMITTEE + KEY + DIMENSION * 4
                )
        );
    }
}

class ResolveActions extends StaticArray(
    Action,
    (ENC_LIMITS.RESOLUTION / ENC_LIMITS.SUB_DIMENSION) *
        (ENC_LIMITS.SUB_DIMENSION / Action.numResults)
) {}
