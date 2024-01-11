import { Field, Mina, Provable, PublicKey } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import { DKGContract, KeyStatus, UpdateKey } from '../../../contracts/DKG.js';
import { DKGAction } from '../../../index.js';
import { KeyStatusStorage } from '../../../contracts/DKGStorage.js';
import { KeyCounterStorage } from '../../../contracts/CommitteeStorage.js';

async function main() {
  const { cache, feePayer } = await prepare();

  // Compile programs
  await compile(UpdateKey, cache);
  await compile(DKGContract, cache);
  const dkgAddress = 'B62qr8z7cT4D5Qq2aH7SabUDbpXEb8EXMCUin26xmcJNQtVu616CNFC';
  const dkgContract = new DKGContract(PublicKey.fromBase58(dkgAddress));

  // Fetch storage trees
  const keyStatusStorage = new KeyStatusStorage();
  const keyCounterStorage = new KeyCounterStorage();

  const rawState = (await fetchZkAppState(dkgAddress)) || [];
  const dkgState = {
    zkApps: rawState[0],
    keyCounter: rawState[1],
    keyStatus: rawState[2],
  };

  const fromState =
    Field(
      25079927036070901246064867767436987657692091363973573142121686150614948079097n
    );
  const toState =
    Field(
      28329272341530795225244483153462207600984423987978417118928482319863638929445n
    );

  const rawActions = await fetchActions(dkgAddress, fromState, toState);
  const actions: DKGAction[] = rawActions.map((e) => {
    let action: Field[] = e.actions[0].map((e) => Field(e));
    return DKGAction.fromFields(action);
  });
  actions.map((e) => Provable.log(e));

  console.log('UpdateKey.firstStep...');
  let proof = await UpdateKey.firstStep(
    DKGAction.empty(),
    dkgState.keyCounter,
    dkgState.keyStatus,
    fromState
  );
  console.log('Done');

  const keyCounters = [0, 0, 0, 1];

  for (let i = 0; i < actions.length; i++) {
    let action = actions[i];
    if (action.keyId.equals(Field(-1))) {
      console.log('UpdateKey.nextStepGeneration...');
      proof = await UpdateKey.nextStepGeneration(
        action,
        proof,
        Field(keyCounters[Number(action.committeeId)]),
        keyCounterStorage.getWitness(
          KeyCounterStorage.calculateLevel1Index(action.committeeId)
        ),
        keyStatusStorage.getWitness(
          KeyStatusStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: Field(i),
          })
        )
      );
      console.log('Done');

      keyStatusStorage.updateLeaf(
        Provable.switch(action.mask.values, Field, [
          Field(KeyStatus.ROUND_1_CONTRIBUTION),
          Field(KeyStatus.ROUND_2_CONTRIBUTION),
          Field(KeyStatus.ACTIVE),
          Field(KeyStatus.DEPRECATED),
        ]),
        KeyStatusStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: Field(keyCounters[Number(action.committeeId)]),
        })
      );

      keyCounterStorage.updateLeaf(
        KeyCounterStorage.calculateLeaf(
          Field(++keyCounters[Number(action.committeeId)])
        ),
        KeyCounterStorage.calculateLevel1Index(action.committeeId)
      );
    } else {
      console.log('UpdateKey.nextStep...');
      proof = await UpdateKey.nextStep(
        action,
        proof,
        keyStatusStorage.getWitness(
          keyStatusStorage.calculateLevel1Index({
            committeeId: action.committeeId,
            keyId: Field(i),
          })
        )
      );

      keyStatusStorage.updateLeaf(
        Provable.switch(action.mask.values, Field, [
          Field(KeyStatus.ROUND_1_CONTRIBUTION),
          Field(KeyStatus.ROUND_2_CONTRIBUTION),
          Field(KeyStatus.ACTIVE),
          Field(KeyStatus.DEPRECATED),
        ]),
        KeyStatusStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: Field(keyCounters[Number(action.committeeId)]),
        })
      );
      console.log('Done');
    }
  }

  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      dkgContract.updateKeys(proof);
    }
  );
  await proveAndSend(tx, feePayer.key, 'DKGContract', 'updateKeys');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
