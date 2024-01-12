import fs from 'fs';
import { Cache, Mina, PrivateKey, PublicKey, fetchAccount } from 'o1js';
import { Config, JSONKey, Key } from '../helper/config.js';
import { wait } from '../helper/deploy.js';

export async function prepare() {
  // Cache folder
  const cache = Cache.FileSystem('./caches');

  // Network configuration
  const MINAURL = 'https://proxy.berkeley.minaexplorer.com/graphql';
  const ARCHIVEURL = 'https://archive.berkeley.minaexplorer.com';
  const network = Mina.Network({
    mina: MINAURL,
    archive: ARCHIVEURL,
  });
  Mina.setActiveInstance(network);
  const FEE = 0.101 * 1e9;

  // Accounts configuration
  let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  let acc1: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc1'].keyPath, 'utf8')
  );
  let acc2: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc2'].keyPath, 'utf8')
  );
  let acc3: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc3'].keyPath, 'utf8')
  );
  let acc4: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc3'].keyPath, 'utf8')
  );

  let feePayerKey: Key;
  feePayerKey = {
    privateKey: PrivateKey.fromBase58(acc1.privateKey),
    publicKey: PublicKey.fromBase58(acc1.publicKey),
  };
  let sender, feePayerNonce;
  do {
    console.log('Fetch nonce...');
    sender = await fetchAccount({ publicKey: feePayerKey.publicKey });
    feePayerNonce = Number(sender.account?.nonce);
    if (!isNaN(feePayerNonce)) break;
    await wait(1000); // 1s
  } while (true);

  return {
    feePayer: {
      key: feePayerKey,
      nonce: feePayerNonce,
      fee: FEE,
    },
    cache,
  };
}
