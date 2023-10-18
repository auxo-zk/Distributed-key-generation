import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
  MerkleMap,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  Committee,
  // createCommitteeProof,
  GroupArray,
} from '../contracts/Committee.js';

const EmptyMerkleMap = new MerkleMap();

function updateOutOfSnark(state: Field, action: Field[][]) {
  if (action === undefined) return state;
  let actionsHash = AccountUpdate.Actions.hash(action);
  return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}

async function main() {
  // fresh account
  let { keys, addresses } = randomAccounts(
    'committee',
    'dkg',
    'p1',
    'p2',
    'p3',
    'p4',
    'p5'
  );
  const ActionCommitteeProfiler = getProfiler('Testing committee');
  const doProofs = false;
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  Mina.setActiveInstance(Local);
  // a test account that pays all the fees, and puts committeeitional funds into the committeeContract
  let feePayerKey = Local.testAccounts[0].privateKey;
  let feePayer = Local.testAccounts[0].publicKey;
  // the committeeContract account
  let committeeContract = new Committee(addresses.committee);
  if (doProofs) {
    console.log('compile');
    await Committee.compile();
  } else {
    console.log('analyzeMethods...');
    // createCommitteeProof.analyzeMethods();
    Committee.analyzeMethods();
  }
  console.log('deploy committeeContract...');
  let tx = await Mina.transaction(feePayer, () => {
    AccountUpdate.fundNewAccount(feePayer, 1);
    committeeContract.deploy();
    committeeContract.memberTreeRoot.set(EmptyMerkleMap.getRoot());
    committeeContract.settingTreeRoot.set(EmptyMerkleMap.getRoot());
    committeeContract.dkgAddressTreeRoot.set(EmptyMerkleMap.getRoot());
  });
  await tx.sign([feePayerKey, keys.committee]).send();
  console.log('committeeContract deployed!');

  // create commitee consist of 5 people
  let arrayAddress = [];
  arrayAddress.push(
    addresses.p1,
    addresses.p2,
    addresses.p3,
    addresses.p4,
    addresses.p5
  );
  arrayAddress = arrayAddress.map((value) => {
    console.log(`address: `, value.toBase58());
    return value.toGroup();
  });
  let myGroupArray = new GroupArray(arrayAddress);

  for (let i = 1; i <= 1; i++) {
    console.log('committeeContract.createCommittee: ', i);
    tx = await Mina.transaction(feePayer, () => {
      committeeContract.createCommittee(
        myGroupArray,
        addresses.dkg.toGroup(),
        Field(2)
      );
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    console.log('committeeContract.createCommittee sent!...');
  }

  let myActionArray: Field[] = [];
  let actions = await Mina.fetchActions(addresses.committee);
  if (Array.isArray(actions)) {
    console.log(actions[0].actions);
    for (let action of actions) {
      // let temp: string[] = [];
      // if (action) temp = action.actions[0];
      // let newAction = temp.map((value) => Field(value));
      myActionArray.push(Field(action.actions[0][0]));
    }
  }

  // create proof
  // console.log('compile...');
  // ActionCommitteeProfiler.start('createCommitteeProof compile');
  // await createCommitteeProof.compile();
  // ActionCommitteeProfiler.stop();

  // console.log('create proof...');
  // ActionCommitteeProfiler.start(
  //   'createCommitteeProof create proof with 5 memeber'
  // );
  // let proof = await createCommitteeProof.createProve(myGroupArray);
  // ActionCommitteeProfiler.stop().store();
  // console.log('proof input: ', proof.publicInput);
  // console.log('proof input: ', proof.publicOutput);
}

main();
