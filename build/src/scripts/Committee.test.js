import { Field, Reducer, Mina, AccountUpdate, Poseidon, MerkleMap, MerkleTree, MerkleWitness, } from 'o1js';
import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import { Committee, createCommitteeProof, GroupArray, RollupState, MyMerkleWitness, } from '../contracts/Committee.js';
import { MockDKGContract } from '../contracts/MockDKGContract.js';
const doProofs = false;
describe('Committee', () => {
    const EmptyMerkleMap = new MerkleMap();
    const treeHeight = 6; // setting max 32 member
    const memberMerkleMap = new MerkleMap();
    const dkgAddressMerkleMap = new MerkleMap();
    const settingMerkleMap = new MerkleMap();
    class memberMerkleTreeWitness extends MerkleWitness(treeHeight) {
    }
    let { keys, addresses } = randomAccounts('committee', 'dkg1', 'dkg2', 'p1', 'p2', 'p3', 'p4', 'p5');
    let feePayerKey;
    let feePayer;
    let committeeContract;
    let proof;
    let myGroupArray1;
    let threshold1 = Field(1);
    let threshold2 = Field(2);
    let myGroupArray2;
    let tree1;
    let tree2;
    const ActionCommitteeProfiler = getProfiler('Testing committee');
    beforeAll(async () => {
        let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
        Mina.setActiveInstance(Local);
        feePayerKey = Local.testAccounts[0].privateKey;
        feePayer = Local.testAccounts[0].publicKey;
        committeeContract = new Committee(addresses.committee);
        if (doProofs) {
            await Committee.compile();
        }
        else {
            // createCommitteeProof.analyzeMethods();
            Committee.analyzeMethods();
        }
        let tx = await Mina.transaction(feePayer, () => {
            AccountUpdate.fundNewAccount(feePayer, 1);
            committeeContract.deploy();
        });
        await tx.sign([feePayerKey, keys.committee]).send();
        if (!doProofs)
            await MockDKGContract.compile();
        // set verification key
        tx = await Mina.transaction(feePayer, () => {
            committeeContract.setVkDKGHash(MockDKGContract._verificationKey);
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
    });
    beforeEach(() => { });
    it('Create commitee consist of 2 people with threshhold 1, and test deploy DKG', async () => {
        let arrayAddress = [];
        arrayAddress.push(addresses.p1, addresses.p2);
        arrayAddress = arrayAddress.map((value) => {
            return value.toGroup();
        });
        myGroupArray1 = new GroupArray(arrayAddress);
        let tx = await Mina.transaction(feePayer, () => {
            AccountUpdate.fundNewAccount(feePayer, 1);
            committeeContract.createCommittee(myGroupArray1, threshold1, addresses.dkg1.toGroup(), MockDKGContract._verificationKey);
        });
        await tx.prove();
        await tx.sign([feePayerKey, keys.dkg1]).send();
        // Test MockDKG contract
        let mockDKGContract = new MockDKGContract(addresses.dkg1);
        expect(mockDKGContract.num.get()).toEqual(Field(0));
    });
    it('Create commitee consist of 3 people with threshhold 2', async () => {
        let arrayAddress = [];
        arrayAddress.push(addresses.p3, addresses.p4, addresses.p5);
        arrayAddress = arrayAddress.map((value) => {
            return value.toGroup();
        });
        myGroupArray2 = new GroupArray(arrayAddress);
        let tx = await Mina.transaction(feePayer, () => {
            AccountUpdate.fundNewAccount(feePayer, 1);
            committeeContract.createCommittee(myGroupArray2, Field(2), addresses.dkg2.toGroup(), MockDKGContract._verificationKey);
        });
        await tx.prove();
        await tx.sign([feePayerKey, keys.dkg2]).send();
    });
    it('compile proof', async () => {
        // compile proof
        await createCommitteeProof.compile();
    });
    it('create proof first step...', async () => {
        // create first step proof
        proof = await createCommitteeProof.firstStep(new RollupState({
            actionHash: Reducer.initialActionState,
            memberTreeRoot: EmptyMerkleMap.getRoot(),
            settingTreeRoot: EmptyMerkleMap.getRoot(),
            dkgAddressTreeRoot: EmptyMerkleMap.getRoot(),
            currentCommitteeId: committeeContract.nextCommitteeId.get(),
        }));
        expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);
        expect(proof.publicInput.currentCommitteeId).toEqual(Field(0));
    });
    it('create proof next step 1...', async () => {
        proof = await createCommitteeProof.nextStep(proof.publicInput, proof, myGroupArray1, memberMerkleMap.getWitness(Field(0)), addresses.dkg1.toGroup(), settingMerkleMap.getWitness(Field(0)), threshold1, dkgAddressMerkleMap.getWitness(Field(0)));
        expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);
        ////// udpate data to local
        // memberMerkleTree.set
        tree1 = new MerkleTree(treeHeight);
        for (let i = 0; i < 32; i++) {
            tree1.setLeaf(BigInt(i), GroupArray.hash(myGroupArray1.get(Field(i))));
        }
        memberMerkleMap.set(Field(0), tree1.getRoot());
        settingMerkleMap.set(Field(0), Poseidon.hash([Field(1), myGroupArray1.length]));
        dkgAddressMerkleMap.set(Field(0), GroupArray.hash(addresses.dkg1.toGroup()));
    });
    it('create proof next step 2...', async () => {
        proof = await createCommitteeProof.nextStep(proof.publicInput, proof, myGroupArray2, memberMerkleMap.getWitness(Field(1)), addresses.dkg2.toGroup(), settingMerkleMap.getWitness(Field(1)), threshold2, // threshold
        dkgAddressMerkleMap.getWitness(Field(1)));
        expect(proof.publicInput.actionHash).toEqual(Reducer.initialActionState);
        ////// udpate data to local
        // memberMerkleTree.set
        tree2 = new MerkleTree(treeHeight);
        for (let i = 0; i < 32; i++) {
            tree2.setLeaf(BigInt(i), GroupArray.hash(myGroupArray2.get(Field(i))));
        }
        memberMerkleMap.set(Field(1), tree2.getRoot());
        settingMerkleMap.set(Field(1), Poseidon.hash([Field(2), myGroupArray2.length]));
        dkgAddressMerkleMap.set(Field(1), GroupArray.hash(addresses.dkg2.toGroup()));
    });
    it('committeeContract rollupIncrements', async () => {
        let tx = await Mina.transaction(feePayer, () => {
            committeeContract.rollupIncrements(proof);
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
    });
    it('check if p2 belong to committee 0', async () => {
        // check if memerber belong to committeeId
        let tx = await Mina.transaction(feePayer, () => {
            committeeContract.checkMember(addresses.p2.toGroup(), Field(0), new MyMerkleWitness(tree1.getWitness(1n)), memberMerkleMap.getWitness(Field(0)));
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
    });
    it('check if p2 belong to committee 1: to throw error', async () => {
        // check if memerber belong to committeeId
        expect(() => {
            committeeContract.checkMember(addresses.p2.toGroup(), Field(1), new MyMerkleWitness(tree1.getWitness(1n)), memberMerkleMap.getWitness(Field(1)));
        }).toThrowError();
    });
});
//# sourceMappingURL=Committee.test.js.map