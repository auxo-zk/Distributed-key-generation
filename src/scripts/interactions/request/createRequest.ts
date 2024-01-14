import { Field, Mina, Provable, PublicKey, Group, Scalar } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import { DKGContract, KeyStatus, UpdateKey } from '../../../contracts/DKG.js';
import { KeyStatusStorage } from '../../../contracts/DKGStorage.js';
import { KeyCounterStorage } from '../../../contracts/CommitteeStorage.js';
import {
  RequestContract,
  RequestInput,
  UnRequestInput,
  ResolveInput,
  CreateRequest,
  RequestVector,
  RequestFee,
  RollupStateOutput,
  ActionEnum,
  createActionMask,
  RequestAction,
  RequestStatusEnum,
  RequestProof,
  MockResponeContract,
} from '../../../contracts/Request.js';
import {
  generateEncryptionWithRandomInput,
  accumulateEncryption,
} from '../../../libs/Requestor.js';

import axios from 'axios';

async function main() {
  const { cache, feePayer } = await prepare();

  // Compile programs
  await compile(CreateRequest, cache);
  await compile(RequestContract, cache);
  const requestAddress =
    'B62qnDCCc8iHuXu7systFTc2EuipJQQcbA5DwYGXkJgrviv7dkcSnPi';
  const requestContract = new RequestContract(
    PublicKey.fromBase58(requestAddress)
  );

  // Fetch storage trees
  let keyCounterStorage = new KeyCounterStorage();
  let keyStatusStorage = new KeyStatusStorage();

  const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
    .data;

  const keys = await Promise.all(
    [...Array(committees.length).keys()].map(
      async (e) =>
        (
          await axios.get(`https://api.auxo.fund/v0/committees/${e}/keys`)
        ).data
    )
  );

  const keyCounters = keys.map((e) => e.length);
  keys.map((e, id) => {
    if (e.length == 0) return;
    keyCounterStorage.updateLeaf(
      KeyCounterStorage.calculateLeaf(Field(keyCounters[id])),
      KeyCounterStorage.calculateLevel1Index(Field(id))
    );
    e.map((key: any) => {
      keyStatusStorage.updateLeaf(
        Field(key.status),
        KeyStatusStorage.calculateLevel1Index({
          committeeId: Field(key.committeeId),
          keyId: Field(key.keyId),
        })
      );
    });
  });

  console.log('Keys: ', keys);

  // Create request value
  let committeeId = Field(0);
  let keyId = Field(0);
  let publicKey: Group;
  let MINA = BigInt(1e7); // 0.01 MINA
  let random: Scalar[] = [
    Scalar.from(100n),
    Scalar.from(200n),
    Scalar.from(300n),
  ];

  let investInputs = [
    [MINA, 2n * MINA, 3n * MINA],
    [4n * MINA, 5n * MINA, 6n * MINA],
    [7n * MINA, 8n * MINA, 9n * MINA],
  ];

  let R: Group[][] = [];
  let M: Group[][] = [];

  for (let i = 0; i < investInputs.length; i++) {
    let temp = generateEncryptionWithRandomInput(
      random,
      publicKey,
      investInputs[i]
    );
    R.push(temp.R);
    R.push(temp.M);
  }

  let totalValue = accumulateEncryption(R, M);

  let input: RequestInput = new RequestInput({
    committeeId,
    keyId,
    R: RequestVector.from(totalValue.sumR),
  });

  // Fetch state and state
  const rawState = (await fetchZkAppState(requestAddress)) || [];

  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      requestContract.request(input);
    }
  );
  await proveAndSend(tx, feePayer.key, 'RequestContract', 'request');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
