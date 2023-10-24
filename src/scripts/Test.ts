import { Field, Reducer, Mina, PrivateKey, AccountUpdate } from 'o1js';
import {
  TestZkapp,
  ActionStatesHash,
  ActionRollup,
} from '../contracts/Test.js';
import { getProfiler } from '../scripts/helper/profiler.js';
import assert from 'node:assert/strict';

async function main() {
  const ReducerProfiler = getProfiler('Reducer zkApp');
  ReducerProfiler.start('Reducer zkApp test flow');
  const doProofs = true;
  const initialNum = Field(0);

  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  Mina.setActiveInstance(Local);

  // a test account that pays all the fees, and puts additional funds into the zkapp
  let feePayerKey = Local.testAccounts[0].privateKey;
  let feePayer = Local.testAccounts[0].publicKey;

  // the zkapp account
  let zkappKey = PrivateKey.fromBase58(
    'EKEQc95PPQZnMY9d9p1vq1MWLeDJKtvKj4V75UDG3rjnf32BerWD'
  );
  let zkappAddress = zkappKey.toPublicKey();
  let zkapp = new TestZkapp(zkappAddress);
  if (doProofs) {
    console.log('compile');
    console.log('(+) ActionStatesHash...');
    await ActionStatesHash.compile();
    console.log('---> done');
    console.log('(+) ActionRollup...');
    await ActionRollup.compile();
    console.log('---> done');
    console.log('(+) TestZkapp...');
    await TestZkapp.compile();
    console.log('---> done');
  }

  console.log('deploy');
  let tx = await Mina.transaction(feePayer, () => {
    AccountUpdate.fundNewAccount(feePayer);
    zkapp.deploy();
    zkapp.num.set(initialNum);
    zkapp.actionState.set(Reducer.initialActionState);
  });
  await tx.sign([feePayerKey, zkappKey]).send();

  console.log('applying actions..');

  const isSelective = false;

  if (isSelective) {
    console.log('action 1');

    tx = await Mina.transaction(feePayer, () => {
      zkapp.add(Field(5));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('action 2');
    tx = await Mina.transaction(feePayer, () => {
      zkapp.mul(Field(2));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('action 3');
    tx = await Mina.transaction(feePayer, () => {
      zkapp.add(Field(1));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('rolling up pending actions..');

    console.log('state before: ' + zkapp.num.get());

    tx = await Mina.transaction(feePayer, () => {
      zkapp.simpleRollup();
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('state after rollup: ' + zkapp.num.get());
    assert.deepEqual(zkapp.num.get().toString(), '11');
  } else {
    console.log('action 1');

    tx = await Mina.transaction(feePayer, () => {
      zkapp.add(Field(5));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('action 2');
    tx = await Mina.transaction(feePayer, () => {
      zkapp.mul(Field(2));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('action 3');
    tx = await Mina.transaction(feePayer, () => {
      zkapp.add(Field(1));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('rolling up pending actions..');

    console.log('state before: ' + zkapp.num.get());

    tx = await Mina.transaction(feePayer, () => {
      zkapp.simpleRollup();
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('state after rollup: ' + zkapp.num.get());
    assert.deepEqual(zkapp.num.get().toString(), '11');
  }

  // console.log('applying more actions');

  // console.log('action 4 (no increment)');
  // tx = await Mina.transaction(feePayer, () => {
  //   zkapp.dispatchData(Field.random());
  // });
  // await tx.prove();
  // await tx.sign([feePayerKey]).send();

  // console.log('action 5');
  // tx = await Mina.transaction(feePayer, () => {
  //   zkapp.incrementCounter();
  // });
  // await tx.prove();
  // await tx.sign([feePayerKey]).send();

  // console.log('rolling up pending actions..');

  // console.log('state before: ' + zkapp.counter.get());

  // tx = await Mina.transaction(feePayer, () => {
  //   zkapp.rollupIncrements();
  // });
  // await tx.prove();
  // await tx.sign([feePayerKey]).send();

  // console.log('state after rollup: ' + zkapp.counter.get());
  // assert.equal(zkapp.counter.get().toString(), '4');
  ReducerProfiler.stop().store();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
