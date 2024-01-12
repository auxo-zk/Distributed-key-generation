import { Field, Mina, Provable, PublicKey } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import { DKGContract, KeyStatus, UpdateKey } from '../../../contracts/DKG.js';
import {
  DKGAction,
  FinalizeRound1,
  ReduceRound1,
  Round1Action,
  Round1Contract,
} from '../../../index.js';
import {
  KeyStatusStorage,
  Round1ContributionStorage,
} from '../../../contracts/DKGStorage.js';
import { KeyCounterStorage } from '../../../contracts/CommitteeStorage.js';
import axios from 'axios';
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
    'B62qiYCgNQhu1KddDQZs7HL8cLqRd683YufYX1BNceZ6BHnC1qfEcJ9';
  const dkgAddress = 'B62qr8z7cT4D5Qq2aH7SabUDbpXEb8EXMCUin26xmcJNQtVu616CNFC';
  const round1Address =
    'B62qmj3E8uH1gqtzvywLvP3aaTSaxby9z8LyvBcK7nNQJ67NQMXRXz8';
  const round1Contract = new Round1Contract(
    PublicKey.fromBase58(round1Address)
  );

  // Fetch storage trees
  const reduceStorage = new ReduceStorage();

  // Fetch state and actions
  await Promise.all([
    fetchZkAppState(committeeAddress),
    fetchZkAppState(dkgAddress),
  ]);
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
  const toState =
    Field(
      16430373379658489769673052454264952589697482648247772648883131952836196358172n
    );

  const rawActions = await fetchActions(round1Address, fromState, toState);
  const actions: Round1Action[] = rawActions.map((e) => {
    let action: Field[] = e.actions[0].map((e) => Field(e));
    return Round1Action.fromFields(action);
  });
  actions.map((e) => Provable.log(e));
  const actionHashes: Field[] = rawActions.map((e) => Field(e.hash));
  Provable.log('Action hashes:', actionHashes);

  console.log('ReduceRound1.firstStep...');
  let proof = await ReduceRound1.firstStep(
    Round1Action.empty(),
    round1State.reduceState,
    fromState
  );
  console.log('Done');

  for (let i = 0; i < actions.length; i++) {
    let action = actions[i];
    console.log('ReduceRound1.nextStep...');
    proof = await ReduceRound1.nextStep(
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
