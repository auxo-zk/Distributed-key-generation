import {
  Field,
  Reducer,
  Mina,
  PrivateKey,
  AccountUpdate,
  MerkleMap,
  Provable,
} from 'o1js';
import {
  TestZkapp,
  ReduceActions,
  RollupActions,
  Action,
  ActionEnum,
  ACTIONS,
  ReduceInput,
  RollupInput,
} from '../contracts/Test.js';
import { getProfiler } from '../scripts/helper/profiler.js';
import assert from 'node:assert/strict';

async function main() {
  const TestProfiler = getProfiler('DKG zkApp');
  TestProfiler.start('Reducer zkApp test flow');
  const doProofs = true;
  const initialNum = Field(0);
  const rollupMerkleMap = new MerkleMap();

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
    console.log('(+) ReduceActions...');
    await ReduceActions.compile();
    console.log('---> done');
    console.log('(+) RollupActions...');
    await RollupActions.compile();
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
  const actions = [
    new Action({
      mask: ACTIONS[ActionEnum.ADDITION],
      data: Field(5),
    }),
    new Action({
      mask: ACTIONS[ActionEnum.MULTIPLICATION],
      data: Field(2),
    }),
    new Action({
      mask: ACTIONS[ActionEnum.ADDITION],
      data: Field(1),
    }),
    new Action({
      mask: ACTIONS[ActionEnum.MULTIPLICATION],
      data: Field(3),
    }),
    new Action({
      mask: ACTIONS[ActionEnum.ADDITION],
      data: Field(1),
    }),
    new Action({
      mask: ACTIONS[ActionEnum.MULTIPLICATION],
      data: Field(3),
    }),
  ];
  const isRecursive = true;

  if (!isRecursive) {
    for (let i = 0; i < actions.length - 2; i++) {
      tx = await Mina.transaction(feePayer, () => {
        actions[i].mask.values[0]
          ? zkapp.add(actions[i].data)
          : zkapp.mul(actions[i].data);
      });
      await tx.prove();
      await tx.sign([feePayerKey]).send();
    }
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
    console.log('create proof first step...');
    let initialActionState = Reducer.initialActionState;
    let initialRollupState = rollupMerkleMap.getRoot();
    Provable.log(initialActionState);
    let reduceProof = await ReduceActions.firstStep(
      new ReduceInput({
        initialActionState: initialActionState,
        initialRollupState: initialRollupState,
        action: actions[0],
      })
    );
    for (let i = 0; i < 4; i++) {
      tx = await Mina.transaction(feePayer, () => {
        actions[i].mask.values[0]
          ? zkapp.add(actions[i].data)
          : zkapp.mul(actions[i].data);
      });
      await tx.prove();
      await tx.sign([feePayerKey]).send();
      Provable.log(zkapp.account.actionState.get());

      let actionHash = actions[i].hash();
      let notReducedWitness = rollupMerkleMap.getWitness(actionHash);
      rollupMerkleMap.set(actionHash, Field(1));
      let reducedWitness = rollupMerkleMap.getWitness(actionHash);

      console.log('create proof next step...');
      reduceProof = await ReduceActions.nextStep(
        new ReduceInput({
          initialActionState: initialActionState,
          initialRollupState: initialRollupState,
          action: actions[i],
        }),
        reduceProof,
        notReducedWitness,
        reducedWitness
      );
      Provable.log(reduceProof.publicOutput);
    }
    console.log('reduce pending actions..');

    tx = await Mina.transaction(feePayer, () => {
      zkapp.reduceActions(reduceProof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    assert.deepEqual(zkapp.num.get().toString(), '0');

    console.log('create proof first step...');
    let initialValue = initialNum;
    initialRollupState = rollupMerkleMap.getRoot();
    let rollupProof = await RollupActions.firstStep(
      new RollupInput({
        initialValue: initialValue,
        initialRollupState: initialRollupState,
        action: actions[0],
      })
    );
    for (let i = 0; i < 4; i++) {
      if (i % 2 > 0) continue;
      let actionHash = actions[i].hash();
      let notRollupedWitness = rollupMerkleMap.getWitness(actionHash);
      rollupMerkleMap.set(actionHash, Field(2));
      let rollupedWitness = rollupMerkleMap.getWitness(actionHash);

      console.log('create proof next step...');
      rollupProof = await RollupActions.nextStep(
        new RollupInput({
          initialValue: initialValue,
          initialRollupState: initialRollupState,
          action: actions[i],
        }),
        rollupProof,
        notRollupedWitness,
        rollupedWitness
      );
    }

    tx = await Mina.transaction(feePayer, () => {
      zkapp.rollupActionsWithoutReduce(rollupProof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    assert.deepEqual(zkapp.num.get().toString(), '6');

    console.log('create proof first step...');
    initialValue = zkapp.num.get();
    initialRollupState = rollupMerkleMap.getRoot();
    rollupProof = await RollupActions.firstStep(
      new RollupInput({
        initialValue: initialValue,
        initialRollupState: initialRollupState,
        action: actions[0],
      })
    );
    for (let i = 0; i < 4; i++) {
      if (i % 2 == 0) continue;
      let actionHash = actions[i].hash();
      let notRollupedWitness = rollupMerkleMap.getWitness(actionHash);
      rollupMerkleMap.set(actionHash, Field(2));
      let rollupedWitness = rollupMerkleMap.getWitness(actionHash);

      console.log('create proof next step...');
      rollupProof = await RollupActions.nextStep(
        new RollupInput({
          initialValue: initialValue,
          initialRollupState: initialRollupState,
          action: actions[i],
        }),
        rollupProof,
        notRollupedWitness,
        rollupedWitness
      );
    }

    tx = await Mina.transaction(feePayer, () => {
      zkapp.rollupActionsWithoutReduce(rollupProof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    assert.deepEqual(zkapp.num.get().toString(), '36');

    initialActionState = zkapp.account.actionState.get();
    initialRollupState = rollupMerkleMap.getRoot();
    reduceProof = await ReduceActions.firstStep(
      new ReduceInput({
        initialActionState: initialActionState,
        initialRollupState: initialRollupState,
        action: actions[0],
      })
    );
    for (let i = 4; i < 6; i++) {
      tx = await Mina.transaction(feePayer, () => {
        actions[i].mask.values[0]
          ? zkapp.add(actions[i].data)
          : zkapp.mul(actions[i].data);
      });
      await tx.prove();
      await tx.sign([feePayerKey]).send();

      let actionHash = actions[i].hash();
      let notReducedWitness = rollupMerkleMap.getWitness(actionHash);
      rollupMerkleMap.set(actionHash, Field(1));
      let reducedWitness = rollupMerkleMap.getWitness(actionHash);

      reduceProof = await ReduceActions.nextStep(
        new ReduceInput({
          initialActionState: initialActionState,
          initialRollupState: initialRollupState,
          action: actions[i],
        }),
        reduceProof,
        notReducedWitness,
        reducedWitness
      );
    }

    initialValue = zkapp.num.get();
    initialRollupState = rollupMerkleMap.getRoot();
    rollupProof = await RollupActions.firstStep(
      new RollupInput({
        initialValue: initialValue,
        initialRollupState: initialRollupState,
        action: actions[0],
      })
    );
    for (let i = 4; i < 6; i++) {
      let actionHash = actions[i].hash();
      let notRollupedWitness = rollupMerkleMap.getWitness(actionHash);
      rollupMerkleMap.set(actionHash, Field(2));
      let rollupedWitness = rollupMerkleMap.getWitness(actionHash);

      rollupProof = await RollupActions.nextStep(
        new RollupInput({
          initialValue: initialValue,
          initialRollupState: initialRollupState,
          action: actions[i],
        }),
        rollupProof,
        notRollupedWitness,
        rollupedWitness
      );
    }

    tx = await Mina.transaction(feePayer, () => {
      zkapp.rollupActionsWithReduce(reduceProof, rollupProof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    assert.deepEqual(zkapp.num.get().toString(), '99');
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
  TestProfiler.stop().store();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
