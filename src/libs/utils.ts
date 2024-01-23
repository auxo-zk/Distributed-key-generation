import { AccountUpdate, Field } from 'o1js';
import { INDEX_SIZE } from '../constants.js';

export function updateOutOfSnark(state: Field, action: Field[][]) {
    let actionsHash = AccountUpdate.Actions.hash(action);
    return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}

export function packIndexArray(memberIds: number[]): Field {
    return Field.fromBits(
        memberIds.map((e) => Field(e).toBits(INDEX_SIZE)).flat()
    );
}
