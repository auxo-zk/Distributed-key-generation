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
  fetchAccount,
} from 'o1js';

import {
  CompleteResponse,
  DKGContract,
  DeprecateKey,
  FinalizeRound1,
  FinalizeRound2,
  GenerateKey,
  ReduceActions,
} from '../contracts/DKG.js';
import {
  BatchDecryption,
  BatchEncryption,
  Elgamal,
} from '../contracts/Encryption.js';

import fs from 'fs/promises';

// check command line arg
const deployAlias = process.argv[2];
if (!deployAlias)
  throw Error(`Missing <deployAlias> argument.
  
  Usage:
  node build/src/interact.js <deployAlias>
  `);
Error.stackTraceLimit = 10000000;

// parse config and private key from file
type Config = {
  deployAliases: Record<
    string,
    {
      url: string;
      keyPath: string;
      fee: string;
      feepayerKeyPath: string;
      feepayerAlias: string;
    }
  >;
};

// 0: deploy
let actionn = 0;

async function main() {
  let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));
  let config = configJson.deployAliases[deployAlias];
  let feepayerKeysBase58: { privateKey: string; publicKey: string } =
    JSON.parse(await fs.readFile(config.feepayerKeyPath, 'utf8'));

  let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(config.keyPath, 'utf8')
  );

  let feePayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
  let contractKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);

  // set up Mina instance and contract we interact with
  const Network = Mina.Network(config.url);
  const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
  Mina.setActiveInstance(Network);
  let feePayer = feePayerKey.toPublicKey();
  let contractAddress = contractKey.toPublicKey();
  let dkgContract = new DKGContract(contractAddress);
  // must fetch
  await fetchAccount({ publicKey: contractAddress });

  let sender = await fetchAccount({ publicKey: feePayer });
  let currentNonce = Number(sender.account?.nonce);

  // compile proof
  if (actionn == 0 || actionn == 1 || actionn == 2) {
    console.log('Compiling ReduceActions...');
    await ReduceActions.compile();
    console.log('Compiling GenerateKey...');
    await GenerateKey.compile();
    console.log('Compiling DeprecateKey...');
    await DeprecateKey.compile();
    console.log('Compiling FinalizeRound1...');
    await FinalizeRound1.compile();
    await Elgamal.compile();
    console.log('Compiling BatchEncryption...');
    await BatchEncryption.compile();
    console.log('Compiling FinalizeRound2...');
    await FinalizeRound2.compile();
    console.log('Compiling BatchDecryption...');
    await BatchDecryption.compile();
    console.log('Compiling CompleteResponse...');
    await CompleteResponse.compile();
    console.log('Compiling DKGContract...');
    await DKGContract.compile();
  }

  if (actionn == 0) {
    console.log('deploy dkgContract...');
    let tx = await Mina.transaction(
      { sender: feePayer, fee, nonce: currentNonce },
      () => {
        AccountUpdate.fundNewAccount(feePayer, 1);
        dkgContract.deploy();
      }
    );
    await tx.sign([feePayerKey, contractKey]).send();
    console.log('dkgContract deployed!');
  }
}

main();
