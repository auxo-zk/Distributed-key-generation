import fs from 'fs';
import {
  Cache,
  Field,
  Mina,
  PrivateKey,
  Provable,
  PublicKey,
  Reducer,
  fetchAccount,
} from 'o1js';
import { Config, JSONKey, Key } from '../../helper/config.js';
import { ContractList, compile, wait } from '../../helper/deploy.js';
import { fetchActions, fetchZkAppState } from '../../helper/deploy.js';
import {
  CommitteeAction,
  CommitteeContract,
  CreateCommittee,
} from '../../../contracts/Committee.js';
import axios from 'axios';
import { MemberArray } from '../../../libs/Committee.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import {
  EMPTY_LEVEL_2_TREE,
  MemberStorage,
  SettingStorage,
} from '../../../contracts/CommitteeStorage.js';
import { COMMITTEE_MAX_SIZE } from '../../../constants.js';
import { prepare } from '../prepare.js';
import { DKGContract } from '../../../contracts/DKG.js';

async function main() {
  const { cache, feePayer } = await prepare();

  // Compile programs
  // await compile(CreateCommittee, cache);
  // await compile(CommitteeContract, cache);
  const dkgAddress = 'B62qiYCgNQhu1KddDQZs7HL8cLqRd683YufYX1BNceZ6BHnC1qfEcJ9';
  const dkgContract = new DKGContract(PublicKey.fromBase58(dkgAddress));

  // Fetch storage trees

  const rawState = (await fetchZkAppState(dkgAddress)) || [];
  const dkgState = {
    zkApps: rawState[0],
    keyCounter: rawState[1],
    keyStatus: rawState[2],
  };
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
