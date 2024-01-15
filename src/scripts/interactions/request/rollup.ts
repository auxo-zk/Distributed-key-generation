import { Field, Mina, PublicKey, Group, Scalar } from 'o1js';
import { compile, fetchZkAppState, proveAndSend } from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import { KeyStatusStorage } from '../../../contracts/DKGStorage.js';
import { KeyCounterStorage } from '../../../contracts/CommitteeStorage.js';
import {
  RequestContract,
  RequestInput,
  CreateRequest,
  RequestVector,
} from '../../../contracts/Request.js';
import {
  generateEncryptionWithRandomInput,
  accumulateEncryption,
  generateEncryption,
} from '../../../libs/Requestor.js';

import axios from 'axios';

async function main() {
  const { cache, feePayer } = await prepare();
  const committeeId = Field(0);
  const keyId = Field(0);

  // Compile programs
  await compile(CreateRequest, cache);
  await compile(RequestContract, cache);
  const requestAddress =
    'B62qnDCCc8iHuXu7systFTc2EuipJQQcbA5DwYGXkJgrviv7dkcSnPi';
  const requestContract = new RequestContract(
    PublicKey.fromBase58(requestAddress)
  );

  const key = (
    await axios.get(
      `https://api.auxo.fund/v0/committees/${Number(committeeId)}/keys/${Number(
        keyId
      )}`
    )
  ).data;

  // Create request value
  let publicKey: Group = PublicKey.fromBase58(key.publicKey).toGroup();
  let MINA = BigInt(1e7); // 0.01 MINA
  // let random: Scalar[] = [
  //   Scalar.from(100n),
  //   Scalar.from(200n),
  //   Scalar.from(300n),
  // ];

  let investInputs = [
    [MINA, 2n * MINA, 3n * MINA],
    [4n * MINA, 5n * MINA, 6n * MINA],
    [7n * MINA, 8n * MINA, 9n * MINA],
  ];

  let R: Group[][] = [];
  let M: Group[][] = [];

  for (let i = 0; i < investInputs.length; i++) {
    let encryptedVector = generateEncryption(publicKey, investInputs[i]);
    R.push(encryptedVector.R);
    M.push(encryptedVector.M);
  }

  let totalValue = accumulateEncryption(R, M);

  let input: RequestInput = new RequestInput({
    committeeId,
    keyId,
    R: RequestVector.from(totalValue.sumR),
  });

  // Fetch state and state
  await fetchZkAppState(requestAddress);

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
