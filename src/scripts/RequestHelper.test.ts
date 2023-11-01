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
  MerkleMap,
  MerkleTree,
  MerkleWitness,
  Proof,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import { RequestHelper } from '../contracts/RequestHelper.js';

const doProofs = false;

describe('RequestHelper', () => {
  beforeAll(async () => {});

  // beforeEach(() => {});

  it('Should be able analyzeMethods', async () => {
    RequestHelper.analyzeMethods();
  });
});
