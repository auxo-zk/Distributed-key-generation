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
  MerkleTree,
  MerkleWitness,
  fetchAccount,
  Provable,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  Committee,
  createCommitteeProof,
  GroupArray,
  RollupState,
  MyMerkleWitness,
} from '../contracts/Committee.js';

import { MockDKGContract } from '../contracts/MockDKGContract.js';
import fs from 'fs/promises';

// check command line arg
const deployAlias = process.argv[2];
if (!deployAlias)
  throw Error(`Missing <deployAlias> argument.

Usage:
node build/src/interact.js <deployAlias>
Example: 
node build/src/scripts/Committee.js committeeberkeley
`);
Error.stackTraceLimit = 1000;

// parse config and private key from file
type Config = {
  deployAliases: Record<
    string,
    {
      url: string;
      keyPath: string;
      fee: string;
      feepayerKeyPath: string;
      feepayerAlias: string;
    }
  >;
};

const EmptyMerkleMap = new MerkleMap();

const treeHeight = 6; // setting max 32 member
// const memberMerkleTree = new MerkleTree(treeHeight);
const memberMerkleMap = new MerkleMap();
const dkgAddressMerkleMap = new MerkleMap();
const settingMerkleMap = new MerkleMap();

class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {}

const isLocal = false;
// 0: deploy
// 1: set DKG ================== 
// 2: dispatch: add thành viên, dkg địa chỉ
// 3: rollup: reduce ================== sever
// 4: check ================= dựa vào check trong db
let actionn = 4;

async function main() {
  if (isLocal) {
    // fresh account
    let { keys, addresses } = randomAccounts(
      'committee',
      'dkg1',
      'dkg2',
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
    });
    await tx.sign([feePayerKey, keys.committee]).send();
    console.log('committeeContract deployed!');

    // console.log('compile mockDKG contract... ');
    await MockDKGContract.compile();

    // set verification key
    console.log('committeeContract.createCommittee: ');
    tx = await Mina.transaction(feePayer, () => {
      committeeContract.setVkDKGHash(MockDKGContract._verificationKey!);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    console.log('committeeContract.createCommittee sent!...');

    // create commitee consist of 2 people with thresh hold 1
    let arrayAddress = [];
    arrayAddress.push(addresses.p1, addresses.p2);
    arrayAddress = arrayAddress.map((value) => {
      // console.log(`address: `, value.toBase58());
      return value.toGroup();
    });
    // console.log(`dkg: `, addresses.dkg.toBase58());
    let myGroupArray1 = new GroupArray(arrayAddress);

    console.log('committeeContract.createCommittee: ');
    tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 1);
      committeeContract.createCommittee(
        myGroupArray1,
        Field(1),
        addresses.dkg1.toGroup(),
        MockDKGContract._verificationKey!
      );
    });
    await tx.prove();
    await tx.sign([feePayerKey, keys.dkg1]).send();
    console.log('committeeContract.createCommittee sent!...');
    console.log(
      'actionState in Committee contract (account):',
      committeeContract.account.actionState.get()
    );

    // // Test MockDKG contract
    let dkgContract = new MockDKGContract(addresses.dkg1);
    console.log('Number in mockDKG contract: ', Number(dkgContract.num.get()));

    // create commitee consist of 3 people with thresh hold 2
    arrayAddress = [];
    arrayAddress.push(addresses.p3, addresses.p4, addresses.p5);
    arrayAddress = arrayAddress.map((value) => {
      // console.log(`address: `, value.toBase58());
      return value.toGroup();
    });
    let myGroupArray2 = new GroupArray(arrayAddress);

    console.log('committeeContract.createCommittee: ');
    tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 1);
      committeeContract.createCommittee(
        myGroupArray2,
        Field(2),
        addresses.dkg2.toGroup(),
        MockDKGContract._verificationKey!
      );
    });
    await tx.prove();
    await tx.sign([feePayerKey, keys.dkg2]).send();
    console.log('committeeContract.createCommittee sent!...');
    console.log(
      'actionState in Committee contract (account):',
      committeeContract.account.actionState.get()
    );

    // compile proof
    console.log('compile...');
    ActionCommitteeProfiler.start('createCommitteeProof compile');
    await createCommitteeProof.compile();
    ActionCommitteeProfiler.stop().store();

    // create first step proof
    console.log('create proof first step...');
    ActionCommitteeProfiler.start('createCommitteeProof create fist step');
    let proof = await createCommitteeProof.firstStep(
      new RollupState({
        actionHash: Reducer.initialActionState,
        memberTreeRoot: EmptyMerkleMap.getRoot(),
        settingTreeRoot: EmptyMerkleMap.getRoot(),
        dkgAddressTreeRoot: EmptyMerkleMap.getRoot(),
        currentCommitteeId: committeeContract.nextCommitteeId.get(), // 0
      })
    );
    ActionCommitteeProfiler.stop().store();

    console.log('create proof next step...');
    ActionCommitteeProfiler.start('createCommitteeProof create next step');
    proof = await createCommitteeProof.nextStep(
      proof.publicInput,
      proof,
      myGroupArray1,
      memberMerkleMap.getWitness(Field(0)),
      addresses.dkg1.toGroup(),
      settingMerkleMap.getWitness(Field(0)),
      Field(1), // threshold
      dkgAddressMerkleMap.getWitness(Field(0))
    );
    ActionCommitteeProfiler.stop();

    ////// udpate data to local

    // memberMerkleTree.set
    let tree = new MerkleTree(treeHeight);
    for (let i = 0; i < 32; i++) {
      tree.setLeaf(BigInt(i), GroupArray.hash(myGroupArray1.get(Field(i))));
    }

    memberMerkleMap.set(Field(0), tree.getRoot());
    settingMerkleMap.set(
      Field(0),
      Poseidon.hash([Field(1), myGroupArray1.length])
    );
    dkgAddressMerkleMap.set(
      Field(0),
      GroupArray.hash(addresses.dkg1.toGroup())
    );

    console.log('create proof next step again...');
    ActionCommitteeProfiler.start('createCommitteeProof create next step');
    proof = await createCommitteeProof.nextStep(
      proof.publicInput,
      proof,
      myGroupArray2,
      memberMerkleMap.getWitness(Field(1)),
      addresses.dkg2.toGroup(),
      settingMerkleMap.getWitness(Field(1)),
      Field(2), // threshold
      dkgAddressMerkleMap.getWitness(Field(1))
    );
    ActionCommitteeProfiler.stop();

    console.log('proof info: ');
    console.log('poof public input actionHash: ', proof.publicInput.actionHash);
    console.log(
      'poof public output actionHash: ',
      proof.publicOutput.actionHash
    );

    ActionCommitteeProfiler.start('committeeContract.rollupIncrements...');
    console.log('committeeContract.rollupIncrements: ');
    tx = await Mina.transaction(feePayer, () => {
      committeeContract.rollupIncrements(proof);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    console.log('committeeContract.rollupIncrements sent!...');
    ActionCommitteeProfiler.stop().store();

    ////// udpate data to local

    // memberMerkleTree.set
    let tree2 = new MerkleTree(treeHeight);
    for (let i = 0; i < 32; i++) {
      tree2.setLeaf(BigInt(i), GroupArray.hash(myGroupArray2.get(Field(i))));
    }

    memberMerkleMap.set(Field(1), tree2.getRoot());
    settingMerkleMap.set(
      Field(1),
      Poseidon.hash([Field(2), myGroupArray2.length])
    );
    dkgAddressMerkleMap.set(
      Field(1),
      GroupArray.hash(addresses.dkg2.toGroup())
    );
    console.log(
      'actionState in Committee contract (@state):',
      committeeContract.actionState.get()
    );
    console.log(
      'actionState in Committee contract (account):',
      committeeContract.account.actionState.get()
    );

    // check if memerber belong to committeeId
    console.log('committeeContract.checkMember p2: ');
    tx = await Mina.transaction(feePayer, () => {
      committeeContract.checkMember(
        addresses.p2.toGroup(),
        Field(0),
        new MyMerkleWitness(tree.getWitness(1n)),
        memberMerkleMap.getWitness(Field(0))
      );
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
  } else {
    let configJson: Config = JSON.parse(
      await fs.readFile('config.json', 'utf8')
    );
    let config = configJson.deployAliases[deployAlias];
    let feepayerKeysBase58: { privateKey: string; publicKey: string } =
      JSON.parse(await fs.readFile(config.feepayerKeyPath, 'utf8'));

    let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
      await fs.readFile(config.keyPath, 'utf8')
    );

    let feePayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
    let committeeKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);

    // set up Mina instance and contract we interact with
    const Network = Mina.Network(config.url);
    const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
    Mina.setActiveInstance(Network);
    let feePayer = feePayerKey.toPublicKey();
    let committeeAddress = committeeKey.toPublicKey();
    let committeeContract = new Committee(committeeAddress);
    // must fetch
    await fetchAccount({ publicKey: committeeAddress });

    let sender = await fetchAccount({ publicKey: feePayer });
    let currentNonce = Number(sender.account?.nonce);

    let p1Address = PublicKey.fromBase58(
      'B62qnDseoTGhRwtUkagJkYutysTVMMuigDCQ9jnU983MiNadpJGjtHP'
    );
    let p2Address = PublicKey.fromBase58(
      'B62qo2KEdpRTGDu9hQDc8gTRLJn5G37PKAoiAam7PUBhtyd9ZKGyrzv'
    );
    let dkgPrivateKey = PrivateKey.fromBase58(
      `EKF8JaLaz37toeHftZ6AGVFvdBzF5QiDZgxkmbnQxpSjEdNts7Ts`
    );
    let dkgAddress = PublicKey.fromBase58(
      `B62qrePDizNdTqLbqhzWTAQpj4MmdSNvYrj4pwdpmZ8AApLR38cuWpX`
    );

    // compile proof
    console.log('compile createCommitteeProof...');
    await createCommitteeProof.compile();
    console.log('compile Committee contract... ');
    await Committee.compile();
    if (actionn == 1 || actionn == 2) {
      console.log('compile MockDKGContract contract... ');
      await MockDKGContract.compile();
    }

    if (actionn == 0) {
      console.log('deploy committeeContract...');
      let tx = await Mina.transaction(
        { sender: feePayer, fee, nonce: currentNonce },
        () => {
          AccountUpdate.fundNewAccount(feePayer, 1);
          committeeContract.deploy();
        }
      );
      await tx.sign([feePayerKey, committeeKey]).send();
      console.log('committeeContract deployed!');
    }

    // set verification key
    if (actionn == 1) {
      console.log('committeeContract.setVkDKGHash: ');
      let tx = await Mina.transaction(
        { sender: feePayer, fee, nonce: currentNonce },
        () => {
          committeeContract.setVkDKGHash(MockDKGContract._verificationKey!);
        }
      );
      await tx.prove();
      await tx.sign([feePayerKey]).send();
      console.log('committeeContract.setVkDKGHash sent!...');
    }

    // create commitee consist of 2 people with thresh hold 1
    let arrayAddress = [];
    arrayAddress.push(p1Address, p2Address);
    arrayAddress = arrayAddress.map((value) => {
      return value.toGroup();
    });
    let myGroupArray1 = new GroupArray(arrayAddress);

    // memberMerkleTree.set
    let tree = new MerkleTree(treeHeight);
    for (let i = 0; i < 32; i++) {
      tree.setLeaf(BigInt(i), GroupArray.hash(myGroupArray1.get(Field(i))));
    }

    memberMerkleMap.set(Field(0), tree.getRoot());
    settingMerkleMap.set(
      Field(0),
      Poseidon.hash([Field(1), myGroupArray1.length])
    );
    dkgAddressMerkleMap.set(Field(0), GroupArray.hash(dkgAddress.toGroup()));

    if (actionn == 2) {
      console.log('committeeContract.createCommittee: ');
      let tx = await Mina.transaction(
        { sender: feePayer, fee, nonce: currentNonce },
        () => {
          AccountUpdate.fundNewAccount(feePayer, 1);
          committeeContract.createCommittee(
            myGroupArray1,
            Field(1),
            dkgAddress.toGroup(),
            MockDKGContract._verificationKey!
          );
        }
      );
      await tx.prove();
      await tx.sign([feePayerKey, dkgPrivateKey]).send();
      console.log('committeeContract.createCommittee sent!...');
    }

    if (actionn == 3) {
      // create first step proof
      console.log('create proof first step...');
      let proof = await createCommitteeProof.firstStep(
        new RollupState({
          actionHash: Reducer.initialActionState,
          memberTreeRoot: EmptyMerkleMap.getRoot(),
          settingTreeRoot: EmptyMerkleMap.getRoot(),
          dkgAddressTreeRoot: EmptyMerkleMap.getRoot(),
          currentCommitteeId: committeeContract.nextCommitteeId.get(), // 0
        })
      );
      console.log('create proof next step...');
      proof = await createCommitteeProof.nextStep(
        proof.publicInput,
        proof,
        myGroupArray1,
        memberMerkleMap.getWitness(Field(0)),
        dkgAddress.toGroup(),
        settingMerkleMap.getWitness(Field(0)),
        Field(1), // threshold
        dkgAddressMerkleMap.getWitness(Field(0))
      );
      console.log('committeeContract.rollupIncrements: ');
      let tx = await Mina.transaction(
        { sender: feePayer, fee, nonce: currentNonce },
        () => {
          committeeContract.rollupIncrements(proof);
        }
      );
      await tx.prove();
      await tx.sign([feePayerKey]).send();
      console.log('committeeContract.rollupIncrements sent!...');
    }

    if (actionn == 4) {
      // check if memerber belong to committeeId
      console.log('committeeContract.checkMember p2: ');
      let tx = await Mina.transaction(
        { sender: feePayer, fee, nonce: currentNonce },
        () => {
          committeeContract.checkMember(
            p2Address.toGroup(),
            Field(0),
            new MyMerkleWitness(tree.getWitness(1n)),
            memberMerkleMap.getWitness(Field(0))
          );
        }
      );
      console.log('tx.prove: ');
      await tx.prove();
      console.log('tx.sign and send');
      await tx.sign([feePayerKey]).send();
    }
  }
}

main();
