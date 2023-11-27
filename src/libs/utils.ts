import { AccountUpdate, Cache, Field, Mina } from 'o1js';
import { Contract, Key } from '../scripts/helper/config.js';

export function updateOutOfSnark(state: Field, action: Field[][]) {
  let actionsHash = AccountUpdate.Actions.hash(action);
  return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}

export async function compile(
  prg: any,
  name: string,
  cache?: Cache,
  profiler?: any
) {
  console.log(`Compiling ${name}...`);
  if (profiler) profiler.start(`${name}.compile`);
  await prg.compile({ cache });
  if (profiler) profiler.stop();
  console.log('Done!');
}

export async function deploy(
  contracts: { [key: string]: Contract },
  feePayer: Key,
  name: string,
  initArgs: [string, Field][]
) {
  console.log(`Deploying ${name}...`);
  let ct = name.toLowerCase().replace('contract', '');
  let { contract, key } = contracts[ct];
  if (contract === undefined) throw new Error('Contract does not exist');
  let tx = await Mina.transaction(feePayer.publicKey, () => {
    AccountUpdate.fundNewAccount(feePayer.publicKey, 1);
    contract!.deploy();
    for (let i = 0; i < initArgs.length; i++) {
      (contract as any)[initArgs[i][0]].set(initArgs[i][1]);
    }
  });
  await tx.sign([feePayer.privateKey, key.privateKey]).send();
  console.log(`${name} deployed!`);
  Object.assign(contracts[ct], {
    contract: contract,
  });
  return contracts;
}

export async function proveAndSend(
  tx: Mina.Transaction,
  feePayer: Key,
  contractName: string,
  methodName: string,
  profiler?: any
) {
  console.log(
    `Generate proof and submit tx for ${contractName}.${methodName}()...`
  );
  if (profiler) profiler.start(`${contractName}.${methodName}.prove`);
  await tx.prove();
  if (profiler) profiler.stop();
  console.log('DONE!');
  await tx.sign([feePayer.privateKey]).send();
}
