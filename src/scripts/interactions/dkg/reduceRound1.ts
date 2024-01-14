import { Field, Mina, Provable, PublicKey, Reducer } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import {
  FinalizeRound1,
  ReduceRound1,
  Round1Action,
  Round1Contract,
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
  const committeeAddress =
    'B62qmpvE5LFDgC5ocRiCMEFWhigtJ88FRniCpPPou2MMQqBLancqB7f';
  const dkgAddress = 'B62qqW6Zparz1cdzjTtwX6ytWtq58bbraBr15FLHGMTm6pGqtNHF6ZJ';
  const round1Address =
    'B62qnBrR7nnKt3rVLbBYKzseJNYvZzirqLKMgD4cTuNRqi86GccZKfV';
  const round1Contract = new Round1Contract(
    PublicKey.fromBase58(round1Address)
  );

  // Fetch storage trees
  const reduceStorage = new ReduceStorage();

  // Fetch state and actions
  const rawState = (await fetchZkAppState(round1Address)) || [];
  const round1State = {
    zkApps: rawState[0],
    reduceState: rawState[1],
    contributions: rawState[2],
    publicKeys: rawState[3],
  };

  const fromState =
    Field(
      25079927036070901246064867767436987657692091363973573142121686150614948079097n
    );
  const toState = undefined;

  const rawActions = await fetchActions(round1Address, fromState, toState);
  const actions: Round1Action[] = rawActions.map((e) => {
    let action: Field[] = e.actions[0].map((e) => Field(e));
    return Round1Action.fromFields(action);
  });
  actions.map((e) => Provable.log(e));
  const actionHashes: Field[] = rawActions.map((e) => Field(e.hash));
  Provable.log('Action hashes:', actionHashes);

  let nextActionId = 2;
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

  console.log('ReduceRound1.firstStep...');
  let proof = await ReduceRound1.firstStep(
    Round1Action.empty(),
    round1State.reduceState,
    nextActionId == 0
      ? Reducer.initialActionState
      : actionHashes[nextActionId - 1]
  );
  console.log('Done');

  for (let i = 0; i < notReducedActions.length; i++) {
    let action = notReducedActions[i];
    Provable.log(`Reducing Action ${nextActionId + i}:`, action);
    console.log('ReduceRound1.nextStep...');
    proof = await ReduceRound1.nextStep(
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
      round1Contract.reduce(proof);
    }
  );
  await proveAndSend(tx, feePayer.key, 'Round1Contract', 'reduce');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
