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
  Cache,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  RequestHelperContract,
  RequestHelperInput,
} from '../contracts/RequestHelper.js';

const doProofs = false;

describe('RequestHelper', () => {
  const EmptyMerkleMap = new MerkleMap();

  const statusMerkleMap = new MerkleMap();
  const requesterMerkleMap = new MerkleMap();

  let { keys, addresses } = randomAccounts('request', 'respone', 'R1', 'D1');

  const doProofs = true;
  const profiling = false;
  const logMemory = true;
  const cache = Cache.FileSystem('./caches');
  const DKGProfiler = getProfiler('Benchmark RequesterHelper');
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  Mina.setActiveInstance(Local);
  let feePayerKey = Local.testAccounts[0].privateKey;
  let feePayer = Local.testAccounts[0].publicKey;
  beforeAll(async () => {});

  // beforeEach(() => {});

  it('Should be able analyzeMethods', async () => {
    RequestHelperContract.analyzeMethods();
  });
});
