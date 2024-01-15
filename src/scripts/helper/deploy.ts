/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AccountUpdate,
  Cache,
  Field,
  Mina,
  Provable,
  PublicKey,
  Reducer,
  SmartContract,
  UInt32,
  fetchAccount,
  fetchEvents as fetchEvent,
} from 'o1js';
import { Key } from './config.js';
import { Profiler } from './profiler.js';

const DEFAULT_WAIT_TIME = 6 * 60 * 1000; // 6m

export async function wait(time?: number): Promise<void> {
  let waitTime = time || DEFAULT_WAIT_TIME;
  console.log(`Wait for ${waitTime / 1000}s ...`);
  return new Promise((resolve) => setTimeout(resolve, waitTime));
}

export async function compile(
  prg: any,
  cache?: Cache,
  logMemory?: boolean,
  profiler?: Profiler
): Promise<void> {
  if (logMemory) logMemUsage();
  console.log(`Compiling ${prg.name}...`);
  if (profiler) profiler.start(`${prg.name}.compile`);
  if (cache) await prg.compile({ cache });
  else await prg.compile();
  if (profiler) profiler.stop();
  console.log('Compiling done!');
}

export type ContractList = {
  [key: string]: {
    name: string;
    key: Key;
    contract: SmartContract;
    actionStates: Field[];
  };
};

export async function deploy(
  ct: { name: string; contract: any; key: Key },
  initArgs: [string, any][],
  feePayer: Key,
  fee?: number,
  nonce?: number
): Promise<void> {
  console.log(`Deploying ${ct.name}...`);
  let sender;
  if (nonce) {
    sender = { sender: feePayer.publicKey, fee: fee, nonce: nonce };
  } else {
    sender = { sender: feePayer.publicKey, fee: fee };
  }
  let tx = await Mina.transaction(sender, () => {
    AccountUpdate.fundNewAccount(feePayer.publicKey, 1);
    ct.contract.deploy();
    for (let i = 0; i < initArgs.length; i++) {
      (ct as any)[initArgs[i][0]].set(initArgs[i][1]);
    }
  });
  await tx.sign([feePayer.privateKey, ct.key.privateKey]).send();
  console.log(`${ct.name} deployed!`);
}

export async function proveAndSend(
  tx: Mina.Transaction,
  feePayer: Key,
  contractName: string,
  methodName: string,
  logMemory?: boolean,
  profiler?: Profiler
) {
  if (logMemory) logMemUsage();
  console.log(
    `Generate proof and submit tx for ${contractName}.${methodName}()...`
  );
  let retries = 3; // Number of retries
  let res;
  while (retries > 0) {
    try {
      if (profiler) profiler.start(`${contractName}.${methodName}.prove`);
      await tx.prove();
      if (profiler) profiler.stop();
      res = await tx.sign([feePayer.privateKey]).send();
      console.log('DONE!');
      Provable.log('Transaction:', res);
      break; // Exit the loop if successful
    } catch (error) {
      console.error('Error:', error);
      retries--; // Decrement the number of retries
      if (retries === 0) {
        throw error; // Throw the error if no more retries left
      }
      console.log(`Retrying... (${retries} retries left)`);
    }
  }
  try {
    console.log('Waiting for tx to succeed...');
    if (res) await res.wait();
    console.log('Tx succeeded!');
  } catch (error) {
    console.error('Error:', error);
  }
}

export async function fetchAllContract(
  contracts: ContractList,
  selected: string[],
  maxAttempts = 10
): Promise<ContractList> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const entries = Object.entries(contracts);
      for (const [key, { contract }] of entries) {
        if (selected.length > 0 && !selected.includes(key)) continue;
        const [fetchedActions, fetchedAccount] = await Promise.all([
          Mina.fetchActions(contract.address),
          fetchAccount({ publicKey: contract.address }),
        ]);

        if (Array.isArray(fetchedActions)) {
          contracts[key].actionStates = [
            Reducer.initialActionState,
            ...fetchedActions.map((e) => Field(e.hash)),
          ];
        }
      }
      console.log('Fetch all info success');

      // If the code succeeds, break out of the loop
      break;
    } catch (error) {
      console.log('Error: ', error);
      attempts++;

      // Wait for some time before retrying (e.g., 1 second)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (attempts === maxAttempts) {
    console.log('Maximum number of attempts reached. Code failed.');
  }

  return contracts;
}

export function logMemUsage() {
  console.log(
    'Current memory usage:',
    Math.floor(process.memoryUsage().rss / 1024 / 1024),
    'MB'
  );
}

export interface FetchedActions {
  actions: string[][];
  hash: string;
}

export async function fetchActions(
  publicKey: string,
  fromActionState?: Field,
  endActionState?: Field
): Promise<FetchedActions[]> {
  return (await Mina.fetchActions(PublicKey.fromBase58(publicKey), {
    fromActionState: fromActionState,
    endActionState: endActionState,
  })) as FetchedActions[];
}

export interface FetchedEvents {
  events: {
    data: string[];
    transactionInfo: {
      hash: string;
      memo: string;
      status: string;
    };
  }[];
  blockHeight: UInt32;
  blockHash: string;
  parentBlockHash: string;
  globalSlot: UInt32;
  chainStatus: string;
}

export async function fetchEvents(
  publicKey: string,
  from?: number,
  to?: number
): Promise<FetchedEvents[]> {
  const events = await fetchEvent(
    {
      publicKey: publicKey,
    },
    undefined,
    {
      from: from == undefined ? undefined : UInt32.from(from),
      to: to == undefined ? undefined : UInt32.from(to),
    }
  );
  return events;
}

export async function fetchZkAppState(
  publicKey: string
): Promise<Field[] | undefined> {
  const result = await fetchAccount({
    publicKey: publicKey,
  });
  const account = result.account;
  return account?.zkapp?.appState;
}
