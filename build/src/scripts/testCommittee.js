import { Field, Reducer, Mina, AccountUpdate, MerkleMap, MerkleWitness, } from 'o1js';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import { Committee, createCommitteeProof, GroupArray, RollupState, } from '../contracts/Committee.js';
const EmptyMerkleMap = new MerkleMap();
const treeHeight = 6; // setting max 32 member
// const memberMerkleTree = new MerkleTree(treeHeight);
const memberMerkleMap = new MerkleMap();
const dkgAddressMerkleMap = new MerkleMap();
const settingMerkleMap = new MerkleMap();
class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {
}
// function updateOutOfSnark(state: Field, action: Field[][]) {
//   if (action === undefined) return state;
//   let actionsHash = AccountUpdate.Actions.hash(action);
//   return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
// }
async function main() {
    // fresh account
    let { keys, addresses } = randomAccounts('committee', 'dkg', 'p1', 'p2', 'p3', 'p4', 'p5');
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
        committeeContract.memberTreeRoot.set(EmptyMerkleMap.getRoot());
        committeeContract.settingTreeRoot.set(EmptyMerkleMap.getRoot());
        committeeContract.dkgAddressTreeRoot.set(EmptyMerkleMap.getRoot());
        committeeContract.actionState.set(Reducer.initialActionState);
    });
    await tx.sign([feePayerKey, keys.committee]).send();
    console.log('committeeContract deployed!');
    // create commitee consist of 2 people with thresh hold 1
    let arrayAddress = [];
    arrayAddress.push(addresses.p1, addresses.p2);
    arrayAddress = arrayAddress.map((value) => {
        console.log(`address: `, value.toBase58());
        return value.toGroup();
    });
    console.log(`dkg: `, addresses.dkg.toBase58());
    let myGroupArray = new GroupArray(arrayAddress);
    for (let i = 1; i <= 1; i++) {
        console.log('committeeContract.createCommittee: ', i);
        tx = await Mina.transaction(feePayer, () => {
            committeeContract.createCommittee(myGroupArray, addresses.dkg.toGroup(), Field(1));
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
        console.log('committeeContract.createCommittee sent!...');
    }
    // let myActionArray: Field[] = [];
    // let actions = await Mina.fetchActions(addresses.committee);
    // if (Array.isArray(actions)) {
    //   for (let action of actions) {
    //     // let temp: string[] = [];
    //     // if (action) temp = action.actions[0];
    //     // let newAction = temp.map((value) => Field(value));
    //     // myActionArray.push(Field(action.actions[0][0]));
    //     console.log(action.hash);
    //   }
    // }
    // create proof
    console.log('compile...');
    ActionCommitteeProfiler.start('createCommitteeProof compile');
    await createCommitteeProof.compile();
    ActionCommitteeProfiler.stop().store();
    console.log('create proof first step...');
    ActionCommitteeProfiler.start('createCommitteeProof create fist step');
    let proof = await createCommitteeProof.firstStep(new RollupState({
        actionHash: Reducer.initialActionState,
        memberTreeRoot: EmptyMerkleMap.getRoot(),
        settingTreeRoot: EmptyMerkleMap.getRoot(),
        dkgAddressTreeRoot: EmptyMerkleMap.getRoot(),
        currentCommitteeId: Field(0),
    }));
    ActionCommitteeProfiler.stop().store();
    console.log('create proof next step...');
    ActionCommitteeProfiler.start('createCommitteeProof create next step');
    proof = await createCommitteeProof.nextStep(proof.publicOutput, proof, myGroupArray, memberMerkleMap.getWitness(Field(0)), addresses.dkg.toGroup(), settingMerkleMap.getWitness(Field(0)), Field(1), // threshold
    dkgAddressMerkleMap.getWitness(Field(0)));
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
    // check member belong to this committee
}
main();
//# sourceMappingURL=testCommittee.js.map