import { Field, Mina, Provable, PublicKey } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import {
  FinalizeRound1,
  FinalizeRound2,
  ReduceRound1,
  ReduceRound2,
  Round1Action,
  Round1Contract,
  Round2Action,
  Round2Contract,
} from '../../../index.js';
import {
  ActionStatus,
  ReduceStorage,
} from '../../../contracts/SharedStorage.js';

async function main() {
  const { cache, feePayer } = await prepare();

  // Compile programs
  await compile(ReduceRound2, cache);
  await compile(FinalizeRound2, cache);
  await compile(Round1Contract, cache);
  const committeeAddress =
    'B62qiYCgNQhu1KddDQZs7HL8cLqRd683YufYX1BNceZ6BHnC1qfEcJ9';
  const dkgAddress = 'B62qr8z7cT4D5Qq2aH7SabUDbpXEb8EXMCUin26xmcJNQtVu616CNFC';
  const round1Address =
    'B62qmj3E8uH1gqtzvywLvP3aaTSaxby9z8LyvBcK7nNQJ67NQMXRXz8';
  const round2Address =
    'B62qmZrJai7AG7pffzP4MdufR9ejPesn9ZdZkvJQXisMDUSTJZ846LE';
  const round2Contract = new Round2Contract(
    PublicKey.fromBase58(round2Address)
  );

  // Fetch storage trees
  const reduceStorage = new ReduceStorage();

  // Fetch state and actions
  await Promise.all([
    fetchZkAppState(committeeAddress),
    fetchZkAppState(dkgAddress),
    fetchZkAppState(round1Address),
  ]);
  const rawState = (await fetchZkAppState(round2Address)) || [];
  const round2State = {
    zkApps: rawState[0],
    reduceState: rawState[1],
    contributions: rawState[2],
    encryptions: rawState[3],
  };
  console.log(round2State);

  const fromState =
    Field(
      25079927036070901246064867767436987657692091363973573142121686150614948079097n
    );
  const toState = undefined;

  const rawActions = await fetchActions(round2Address, fromState, toState);
  const actions: Round2Action[] = rawActions.map((e) => {
    let action: Field[] = e.actions[0].map((e) => Field(e));
    return Round2Action.fromFields(action);
  });
  actions.map((e) => Provable.log(e));
  const actionHashes: Field[] = rawActions.map((e) => Field(e.hash));
  Provable.log('Action hashes:', actionHashes);

  console.log('ReduceRound2.firstStep...');
  let proof = await ReduceRound2.firstStep(
    Round2Action.empty(),
    round2State.reduceState,
    fromState
  );
  console.log('Done');

  for (let i = 0; i < actions.length; i++) {
    let action = actions[i];
    console.log('ReduceRound1.nextStep...');
    proof = await ReduceRound2.nextStep(
      action,
      proof,
      reduceStorage.getWitness(actionHashes[i])
    );
    console.log('Done');

    reduceStorage.updateLeaf(
      ReduceStorage.calculateIndex(actionHashes[i]),
      ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
    );
  }

  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      round2Contract.reduce(proof);
    }
  );
  await proveAndSend(tx, feePayer.key, 'Round2Contract', 'reduce');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
