import { Field, Reducer, Mina, AccountUpdate, Poseidon, MerkleMap, MerkleTree, MerkleWitness, } from 'o1js';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import { Committee, createCommitteeProof, GroupArray, RollupState, MyMerkleWitness, MockDKGContract, } from '../contracts/Committee.js';
const EmptyMerkleMap = new MerkleMap();
const treeHeight = 6; // setting max 32 member
// const memberMerkleTree = new MerkleTree(treeHeight);
const memberMerkleMap = new MerkleMap();
const dkgAddressMerkleMap = new MerkleMap();
const settingMerkleMap = new MerkleMap();
class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {
}
async function main() {
    // fresh account
    let { keys, addresses } = randomAccounts('committee', 'dkg1', 'dkg2', 'p1', 'p2', 'p3', 'p4', 'p5');
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
    }
    else {
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
    console.log('compile mockDKG contract... ');
    await MockDKGContract.compile();
    // set verification key
    console.log('committeeContract.createCommittee: ');
    tx = await Mina.transaction(feePayer, () => {
        committeeContract.setVkDKGHash(MockDKGContract._verificationKey);
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
        committeeContract.createCommittee(myGroupArray1, Field(1), addresses.dkg1.toGroup(), MockDKGContract._verificationKey);
    });
    await tx.prove();
    await tx.sign([feePayerKey, keys.dkg1]).send();
    console.log('committeeContract.createCommittee sent!...');
    // Test MockDKG contract
    let mockDKGContract = new MockDKGContract(addresses.dkg1);
    console.log('Number in mockDKG contract: ', Number(mockDKGContract.num.get()));
    // create commitee consist of 3 people with thresh hold 2
    arrayAddress = [];
    arrayAddress.push(addresses.p3, addresses.p4, addresses.p5);
    arrayAddress = arrayAddress.map((value) => {
        // console.log(`address: `, value.toBase58());
        return value.toGroup();
    });
    // console.log(`dkg: `, addresses.dkg.toBase58());
    let myGroupArray2 = new GroupArray(arrayAddress);
    console.log('committeeContract.createCommittee: ');
    tx = await Mina.transaction(feePayer, () => {
        AccountUpdate.fundNewAccount(feePayer, 1);
        committeeContract.createCommittee(myGroupArray2, Field(2), addresses.dkg2.toGroup(), MockDKGContract._verificationKey);
    });
    await tx.prove();
    await tx.sign([feePayerKey, keys.dkg2]).send();
    console.log('committeeContract.createCommittee sent!...');
    // compile proof
    console.log('compile...');
    ActionCommitteeProfiler.start('createCommitteeProof compile');
    await createCommitteeProof.compile();
    ActionCommitteeProfiler.stop().store();
    // create first step proof
    console.log('create proof first step...');
    ActionCommitteeProfiler.start('createCommitteeProof create fist step');
    let proof = await createCommitteeProof.firstStep(new RollupState({
        actionHash: Reducer.initialActionState,
        memberTreeRoot: EmptyMerkleMap.getRoot(),
        settingTreeRoot: EmptyMerkleMap.getRoot(),
        dkgAddressTreeRoot: EmptyMerkleMap.getRoot(),
        currentCommitteeId: committeeContract.nextCommitteeId.get(), // 0
    }));
    ActionCommitteeProfiler.stop().store();
    console.log('create proof next step...');
    ActionCommitteeProfiler.start('createCommitteeProof create next step');
    proof = await createCommitteeProof.nextStep(proof.publicInput, proof, myGroupArray1, memberMerkleMap.getWitness(Field(0)), addresses.dkg1.toGroup(), settingMerkleMap.getWitness(Field(0)), Field(1), // threshold
    dkgAddressMerkleMap.getWitness(Field(0)));
    ActionCommitteeProfiler.stop();
    ////// udpate data to local
    // memberMerkleTree.set
    let tree = new MerkleTree(treeHeight);
    for (let i = 0; i < 32; i++) {
        tree.setLeaf(BigInt(i), GroupArray.hash(myGroupArray1.get(Field(i))));
    }
    memberMerkleMap.set(Field(0), tree.getRoot());
    settingMerkleMap.set(Field(0), Poseidon.hash([Field(1), myGroupArray1.length]));
    dkgAddressMerkleMap.set(Field(0), GroupArray.hash(addresses.dkg1.toGroup()));
    console.log('create proof next step again...');
    ActionCommitteeProfiler.start('createCommitteeProof create next step');
    proof = await createCommitteeProof.nextStep(proof.publicInput, proof, myGroupArray2, memberMerkleMap.getWitness(Field(1)), addresses.dkg2.toGroup(), settingMerkleMap.getWitness(Field(1)), Field(2), // threshold
    dkgAddressMerkleMap.getWitness(Field(1)));
    ActionCommitteeProfiler.stop();
    console.log('proof info: ');
    console.log('poof public input actionHash: ', Number(proof.publicInput.actionHash));
    console.log('poof public output actionHash: ', Number(proof.publicOutput.actionHash));
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
    settingMerkleMap.set(Field(1), Poseidon.hash([Field(2), myGroupArray2.length]));
    dkgAddressMerkleMap.set(Field(1), GroupArray.hash(addresses.dkg2.toGroup()));
    // check if memerber belong to committeeId
    console.log('committeeContract.checkMember p2: ');
    tx = await Mina.transaction(feePayer, () => {
        committeeContract.checkMember(addresses.p2.toGroup(), Field(0), new MyMerkleWitness(tree.getWitness(1n)), memberMerkleMap.getWitness(Field(0)));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();
}
main();
//# sourceMappingURL=testCommittee.js.map