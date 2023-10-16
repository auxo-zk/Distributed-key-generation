import { Field, Mina, PublicKey, AccountUpdate, } from 'o1js';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import { Committee, createCommitteeProve, GroupArray, } from '../contracts/Committee.js';
function updateOutOfSnark(state, action) {
    if (action === undefined)
        return state;
    let actionsHash = AccountUpdate.Actions.hash(action);
    return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}
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
        createCommitteeProve.analyzeMethods();
        Committee.analyzeMethods();
    }
    console.log('deploy committeeContract...');
    let tx = await Mina.transaction(feePayer, () => {
        AccountUpdate.fundNewAccount(feePayer, 1);
        committeeContract.deploy();
    });
    await tx.sign([feePayerKey, keys.committee]).send();
    console.log('committeeContract deployed!');
    // create commitee consist of 5 people
    let arrayAddress = [];
    arrayAddress.push(addresses.p1, addresses.p2, addresses.p3, addresses.p4, addresses.p5);
    arrayAddress = arrayAddress.map((value) => {
        console.log(`address: `, value.toBase58());
        return value.toGroup();
    });
    let myGroupArray = new GroupArray(arrayAddress);
    console.log('myGroupArray0 ', PublicKey.fromGroup(myGroupArray.get(Field(0))).toBase58());
    console.log('myGroupArray4 ', PublicKey.fromGroup(myGroupArray.get(Field(4))).toBase58());
    console.log('myGroupArray5 ', PublicKey.fromGroup(myGroupArray.get(Field(5))).toBase58());
    // create proof
    console.log('compile...');
    ActionCommitteeProfiler.start('createCommitteeProve compile');
    await createCommitteeProve.compile();
    ActionCommitteeProfiler.stop();
    console.log('create proof...');
    ActionCommitteeProfiler.start('createCommitteeProve create proof with 5 memeber');
    let proof = await createCommitteeProve.createProve(myGroupArray);
    ActionCommitteeProfiler.stop().store();
    console.log('proof input: ', proof.publicInput);
    console.log('proof input: ', proof.publicOutput);
}
main();
//# sourceMappingURL=testCommittee.js.map