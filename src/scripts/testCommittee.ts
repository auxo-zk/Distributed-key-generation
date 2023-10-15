import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
} from 'o1js';

import { getProfiler } from './helper/profiler';
import randomAccounts from './helper/randomAccounts';
import { Committee } from '../contracts/Committee';

function updateOutOfSnark(state: Field, action: Field[][]) {
  if (action === undefined) return state;
  let actionsHash = AccountUpdate.Actions.hash(action);
  return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}

async function main() {
  // fresh account
  let { keys, addresses } = randomAccounts('committee', 'dkg');
  const ActionCommitteeProfiler = getProfiler('Testing committee');
}

main();
