import { AccountUpdate, Field } from 'o1js';

export function updateOutOfSnark(state: Field, action: Field[][]) {
  if (action === undefined) return state;
  let actionsHash = AccountUpdate.Actions.hash(action);
  return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}
