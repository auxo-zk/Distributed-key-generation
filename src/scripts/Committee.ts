import {
  Reducer,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  MerkleMap,
  MerkleTree,
  MerkleWitness,
  fetchAccount,
} from 'o1js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  CommitteeContract,
  CommitteeAction,
  CreateCommittee,
} from '../contracts/Committee.js';
import {
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE,
  LEVEL2_TREE_HEIGHT,
  Level1Witness,
  MemberStorage,
  SettingStorage,
} from '../contracts/CommitteeStorage.js';
import { MemberArray } from '../libs/Committee.js';

// check command line arg
const deployAlias = process.argv[2];
if (!deployAlias)
  throw Error(`Missing <deployAlias> argument.

Usage:
node build/src/interact.js <deployAlias>
Example: 
node build/src/scripts/Committee.js committeeberkeley
`);
Error.stackTraceLimit = 10000000;

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

let memberStorage = new MemberStorage(EMPTY_LEVEL_1_TREE());
let settingStorage = new SettingStorage(EMPTY_LEVEL_1_TREE());

class memberMerkleTreeWitness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}

const isLocal = true;
// 0: deploy
// 1: dispatch: add thành viên, dkg địa chỉ
// 2: rollup: reduce ================== sever
// 3: check ================= dựa vào check trong db
let actionn = 1;

async function main() {
  if (isLocal) {
    // fresh account
    let { keys, addresses } = randomAccounts(
      'committee',
      'p1',
      'p2',
      'p3',
      'p4',
      'p5'
    );
    const ActionCommitteeProfiler = getProfiler('Testing committee');
    const doProofs = true;
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    // a test account that pays all the fees, and puts committeeitional funds into the committeeContract
    let feePayerKey = Local.testAccounts[0].privateKey;
    let feePayer = Local.testAccounts[0].publicKey;
    // the committeeContract account
    let committeeContract = new CommitteeContract(addresses.committee);
    if (doProofs) {
      console.time('CreateCommittee.compile');
      await CreateCommittee.compile();
      console.timeEnd('CreateCommittee.compile');
      await CommitteeContract.compile();
    } else {
      console.time('CreateCommittee.compile');
      await CreateCommittee.compile();
      console.timeEnd('CreateCommittee.compile');
      console.log('analyzeMethods...');
      CommitteeContract.analyzeMethods();
    }

    console.log('deploy committeeContract...');
    let tx = await Mina.transaction(feePayer, () => {
      AccountUpdate.fundNewAccount(feePayer, 1);
      committeeContract.deploy();
    });
    await tx.sign([feePayerKey, keys.committee]).send();
    console.log('committeeContract deployed!');

    // create commitee consist of 2 people with thresh hold 1
    let arrayAddress = [];
    arrayAddress.push(addresses.p1, addresses.p2);
    let myMemberArray1 = new MemberArray(arrayAddress);

    console.log('committeeContract.createCommittee: ');
    let action = new CommitteeAction({
      addresses: myMemberArray1,
      threshold: Field(1),
      ipfsHash: IPFSHash.fromString('testing'),
    });
    tx = await Mina.transaction(feePayer, () => {
      committeeContract.createCommittee(action);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('committeeContract.createCommittee sent!...');
    console.log(
      'actionState in Committee contract (account):',
      committeeContract.account.actionState.get()
    );

    // create commitee consist of 3 people with thresh hold 2
    arrayAddress = [];
    arrayAddress.push(addresses.p3, addresses.p4, addresses.p5);
    arrayAddress = arrayAddress.map((value) => {
      // console.log(`address: `, value.toBase58());
      return value;
    });
    let myMemberArray2 = new MemberArray(arrayAddress);

    console.log('committeeContract.createCommittee: ');
    action = new CommitteeAction({
      addresses: myMemberArray2,
      threshold: Field(2),
      ipfsHash: IPFSHash.fromString('testing'),
    });
    tx = await Mina.transaction(feePayer, () => {
      committeeContract.createCommittee(action);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
    console.log('committeeContract.createCommittee sent!...');
    console.log(
      'actionState in Committee contract (account):',
      committeeContract.account.actionState.get()
    );

    // create first step proof
    console.log('create proof first step...');
    ActionCommitteeProfiler.start('CreateCommittee create fist step');
    let proof = await CreateCommittee.firstStep(
      Reducer.initialActionState,
      memberStorage.level1.getRoot(),
      settingStorage.level1.getRoot(),
      committeeContract.nextCommitteeId.get()
    );
    ActionCommitteeProfiler.stop().store();

    console.log('create proof next step...');
    ActionCommitteeProfiler.start('CreateCommittee create next step');
    proof = await CreateCommittee.nextStep(
      proof,
      new CommitteeAction({
        addresses: myMemberArray1,
        threshold: Field(1),
        ipfsHash: IPFSHash.fromString('testing'),
      }),
      new Level1Witness(memberStorage.level1.getWitness(Field(0).toBigInt())),
      settingStorage.getWitness(Field(0))
    );
    ActionCommitteeProfiler.stop();

    ////// udpate data to local

    // memberMerkleTree.set
    let tree = EMPTY_LEVEL_2_TREE();
    for (let i = 0; i < Number(myMemberArray1.length); i++) {
      tree.setLeaf(BigInt(i), MemberArray.hash(myMemberArray1.get(Field(i))));
    }

    memberStorage.updateInternal(Field(0), tree);
    settingStorage.updateLeaf(
      Poseidon.hash([Field(1), myMemberArray1.length]),
      Field(0)
    );

    console.log('create proof next step again...');
    ActionCommitteeProfiler.start('CreateCommittee create next step');
    proof = await CreateCommittee.nextStep(
      proof,
      new CommitteeAction({
        addresses: myMemberArray2,
        threshold: Field(2),
        ipfsHash: IPFSHash.fromString('testing'),
      }),
      new Level1Witness(memberStorage.level1.getWitness(Field(1).toBigInt())),
      settingStorage.getWitness(Field(1))
    );
    ActionCommitteeProfiler.stop();

    // ActionCommitteeProfiler.start('committeeContract.rollupIncrements...');
    // console.log('committeeContract.rollupIncrements: ');
    // tx = await Mina.transaction(feePayer, () => {
    //   committeeContract.rollupIncrements(proof);
    // });
    // await tx.prove();
    // await tx.sign([feePayerKey]).send();
    // console.log('committeeContract.rollupIncrements sent!...');
    // ActionCommitteeProfiler.stop().store();

    // ////// udpate data to local

    // // memberMerkleTree.set
    // let tree2 = new MerkleTree(LEVEL2_TREE_HEIGHT);
    // for (let i = 0; i < Number(myMemberArray2.length); i++) {
    //   tree2.setLeaf(BigInt(i), MemberArray.hash(myMemberArray2.get(Field(i))));
    // }

    // memberMerkleMap.set(Field(1), tree2.getRoot());
    // settingMerkleMap.set(
    //   Field(1),
    //   Poseidon.hash([Field(2), myMemberArray2.length])
    // );

    // console.log(
    //   'actionState in Committee contract (@state):',
    //   committeeContract.actionState.get()
    // );
    // console.log(
    //   'actionState in Committee contract (account):',
    //   committeeContract.account.actionState.get()
    // );

    // // check if memerber belong to committeeId
    // console.log('committeeContract.checkMember p2: ');
    // let checkInput = new CheckMemberInput({
    //   address: addresses.p2,
    //   commiteeId: Field(0),
    //   memberMerkleTreeWitness: new CommitteeMerkleWitness(tree.getWitness(1n)),
    //   memberMerkleMapWitness: memberMerkleMap.getWitness(Field(0)),
    // });
    // tx = await Mina.transaction(feePayer, () => {
    //   committeeContract.checkMember(checkInput);
    // });
    // await tx.prove();
    // await tx.sign([feePayerKey]).send();
  }
  // else {
  //   let configJson: Config = JSON.parse(
  //     await fs.readFile('config.json', 'utf8')
  //   );
  //   let config = configJson.deployAliases[deployAlias];
  //   let feepayerKeysBase58: { privateKey: string; publicKey: string } =
  //     JSON.parse(await fs.readFile(config.feepayerKeyPath, 'utf8'));

  //   let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
  //     await fs.readFile(config.keyPath, 'utf8')
  //   );

  //   let feePayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
  //   let committeeKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);

  //   // set up Mina instance and contract we interact with
  //   const Network = Mina.Network(config.url);
  //   const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
  //   Mina.setActiveInstance(Network);
  //   let feePayer = feePayerKey.toPublicKey();
  //   let committeeAddress = committeeKey.toPublicKey();
  //   let committeeContract = new CommitteeContract(committeeAddress);
  //   // must fetch
  //   await fetchAccount({ publicKey: committeeAddress });

  //   let sender = await fetchAccount({ publicKey: feePayer });
  //   let currentNonce = Number(sender.account?.nonce);

  //   let p1Address = PublicKey.fromBase58(
  //     'B62qnDseoTGhRwtUkagJkYutysTVMMuigDCQ9jnU983MiNadpJGjtHP'
  //   );
  //   let p2Address = PublicKey.fromBase58(
  //     'B62qo2KEdpRTGDu9hQDc8gTRLJn5G37PKAoiAam7PUBhtyd9ZKGyrzv'
  //   );

  //   // compile proof
  //   if (actionn == 0 || actionn == 1 || actionn == 2) {
  //     console.log('compile CreateCommittee...');
  //     await CreateCommittee.compile();
  //     console.log('compile Committee contract... ');
  //     await CommitteeContract.compile();
  //   }

  //   if (actionn == 0) {
  //     console.log('deploy committeeContract...');
  //     let tx = await Mina.transaction(
  //       { sender: feePayer, fee, nonce: currentNonce },
  //       () => {
  //         AccountUpdate.fundNewAccount(feePayer, 1);
  //         committeeContract.deploy();
  //       }
  //     );
  //     await tx.sign([feePayerKey, committeeKey]).send();
  //     console.log('committeeContract deployed!');
  //   }

  //   // create commitee consist of 2 people with thresh hold 1
  //   let arrayAddress = [];
  //   arrayAddress.push(p1Address, p2Address);
  //   let myMemberArray1 = new MemberArray(arrayAddress);

  //   // memberMerkleTree.set
  //   let tree = new MerkleTree(LEVEL2_TREE_HEIGHT);
  //   for (let i = 0; i < Number(myMemberArray1.length); i++) {
  //     tree.setLeaf(BigInt(i), MemberArray.hash(myMemberArray1.get(Field(i))));
  //   }

  //   memberMerkleMap.set(Field(0), tree.getRoot());
  //   settingMerkleMap.set(
  //     Field(0),
  //     Poseidon.hash([Field(1), myMemberArray1.length])
  //   );

  //   if (actionn == 1) {
  //     console.log('committeeContract.createCommittee: ');
  //     let action = new CommitteeAction({
  //       addresses: myMemberArray1,
  //       threshold: Field(1),
  //       ipfsHash: IPFSHash.fromString(
  //         'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
  //       ),
  //     });
  //     let tx = await Mina.transaction(
  //       { sender: feePayer, fee, nonce: currentNonce },
  //       () => {
  //         committeeContract.createCommittee(action);
  //       }
  //     );
  //     await tx.prove();
  //     await tx.sign([feePayerKey]).send();
  //     console.log('committeeContract.createCommittee sent!...');
  //   }

  //   if (actionn == 2) {
  //     // create first step proof
  //     console.log('create proof first step...');
  //     let proof = await CreateCommittee.firstStep(
  //       Reducer.initialActionState,
  //       EmptyMerkleMap.getRoot(),
  //       EmptyMerkleMap.getRoot(),
  //       committeeContract.nextCommitteeId.get()
  //     );
  //     console.log('create proof next step...');
  //     proof = await CreateCommittee.nextStep(
  //       proof,
  //       new CommitteeAction({
  //         addresses: myMemberArray1,
  //         threshold: Field(1),
  //         ipfsHash: IPFSHash.fromString(
  //           'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
  //         ),
  //       }),
  //       memberMerkleMap.getWitness(Field(0)),
  //       settingMerkleMap.getWitness(Field(0))
  //     );
  //     console.log('committeeContract.rollupIncrements: ');
  //     let tx = await Mina.transaction(
  //       { sender: feePayer, fee, nonce: currentNonce },
  //       () => {
  //         committeeContract.rollupIncrements(proof);
  //       }
  //     );
  //     await tx.prove();
  //     await tx.sign([feePayerKey]).send();
  //     console.log('committeeContract.rollupIncrements sent!...');
  //   }

  //   if (actionn == 3) {
  //     // check if memerber belong to committeeId
  //     console.log('committeeContract.checkMember p2: ');
  //     let checkInput = new CheckMemberInput({
  //       address: p2Address,
  //       commiteeId: Field(0),
  //       memberMerkleTreeWitness: new CommitteeMerkleWitness(
  //         tree.getWitness(1n)
  //       ),
  //       memberMerkleMapWitness: memberMerkleMap.getWitness(Field(0)),
  //     });
  //     let tx = await Mina.transaction(
  //       { sender: feePayer, fee, nonce: currentNonce },
  //       () => {
  //         committeeContract.checkMember(checkInput);
  //       }
  //     );
  //     console.log('tx.prove: ');
  //     await tx.prove();
  //     console.log('tx.sign and send');
  //     await tx.sign([feePayerKey]).send();
  //   }
  // }
}

main();
