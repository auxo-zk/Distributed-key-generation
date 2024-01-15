import { Field, Mina, Provable, PublicKey, Reducer } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import {
  BatchEncryption,
  FinalizeRound1,
  FinalizeRound2,
  ReduceRound1,
  ReduceRound2,
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
  await compile(ReduceRound1, cache);
  await compile(FinalizeRound1, cache);
  await compile(Round1Contract, cache);
  await compile(ReduceRound2, cache);
  await compile(BatchEncryption, cache);
  await compile(FinalizeRound2, cache);
  await compile(Round2Contract, cache);
  const round2Address =
    'B62qpvKFv8ey9FhsGAdcXxkg8yg1vZJQGoB2EySqJDZdANwP6Mh8SZ7';
  const round2Contract = new Round2Contract(
    PublicKey.fromBase58(round2Address)
  );

  // Fetch storage trees
  const reduceStorage = new ReduceStorage();

  // Fetch state and actions
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

  let nextActionId = 0;
  const reducedActions = actions.slice(0, nextActionId);
  const notReducedActions = actions.slice(nextActionId);

  reducedActions.map((action, i) => {
    Provable.log(`Reduced Action ${i}:`, action);
    console.log('Adding to storage tree...');
    reduceStorage.updateLeaf(
      ReduceStorage.calculateIndex(actionHashes[i]),
      ReduceStorage.calculateLeaf(ActionStatus.REDUCED)
    );
    console.log('Done');
  });

  console.log('ReduceRound2.firstStep...');
  let proof = await ReduceRound2.firstStep(
    Round2Action.empty(),
    round2State.reduceState,
    nextActionId == 0
      ? Reducer.initialActionState
      : actionHashes[nextActionId - 1]
  );
  console.log('Done');

  for (let i = 0; i < notReducedActions.length; i++) {
    let action = notReducedActions[i];
    Provable.log(`Reducing Action ${nextActionId + i}:`, action);
    console.log('ReduceRound2.nextStep...');
    proof = await ReduceRound2.nextStep(
      action,
      proof,
      reduceStorage.getWitness(actionHashes[nextActionId + i])
    );
    console.log('Done');

    reduceStorage.updateLeaf(
      ReduceStorage.calculateIndex(actionHashes[nextActionId + i]),
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
