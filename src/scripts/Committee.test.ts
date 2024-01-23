import {
    Field,
    Reducer,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Poseidon,
    MerkleMap,
    MerkleTree,
    MerkleWitness,
    Proof,
    Void,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
    CommitteeContract,
    CommitteeAction,
    CreateCommittee,
    CheckMemberInput,
    CreateCommitteeOutput,
} from '../contracts/Committee.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { MemberArray } from '../libs/Committee.js';
import {
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
    Level1Witness,
    MemberStorage,
    SettingStorage,
} from '../contracts/CommitteeStorage.js';

describe('Committee', () => {
    const doProofs = false;
    let memberStorage = new MemberStorage(EMPTY_LEVEL_1_TREE());
    let settingStorage = new SettingStorage(EMPTY_LEVEL_1_TREE());

    let { keys, addresses } = randomAccounts(
        'committee',
        'p1',
        'p2',
        'p3',
        'p4',
        'p5'
    );
    let feePayerKey: PrivateKey;
    let feePayer: PublicKey;
    let committeeContract: CommitteeContract;
    let proof: Proof<Void, CreateCommitteeOutput>;
    let myMemberArray1: MemberArray;
    let threshold1 = Field(1);
    let threshold2 = Field(2);
    let myMemberArray2: MemberArray;
    let tree1: MerkleTree;
    let tree2: MerkleTree;

    const ActionCommitteeProfiler = getProfiler('Testing committee');

    beforeAll(async () => {
        let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
        Mina.setActiveInstance(Local);
        feePayerKey = Local.testAccounts[0].privateKey;
        feePayer = Local.testAccounts[0].publicKey;
        committeeContract = new CommitteeContract(addresses.committee);
        if (doProofs) {
            await CommitteeContract.compile();
        } else {
            // CreateCommittee.analyzeMethods();
            CommitteeContract.analyzeMethods();
        }

        let tx = await Mina.transaction(feePayer, () => {
            AccountUpdate.fundNewAccount(feePayer, 1);
            committeeContract.deploy();
        });
        await tx.sign([feePayerKey, keys.committee]).send();
    });

    // beforeEach(() => {});

    it('compile proof', async () => {
        // compile proof
        await CreateCommittee.compile();
    });

    xit('Create commitee consist of 2 people with threshhold 1, and test deploy DKG', async () => {
        let arrayAddress = [];
        arrayAddress.push(addresses.p1, addresses.p2);
        myMemberArray1 = new MemberArray(arrayAddress);

        let action = new CommitteeAction({
            addresses: myMemberArray1,
            threshold: threshold1,
            ipfsHash: IPFSHash.fromString('testing'),
        });

        let tx = await Mina.transaction(feePayer, () => {
            committeeContract.createCommittee(action);
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
    });

    xit('Create commitee consist of 3 people with threshhold 2', async () => {
        let arrayAddress = [];
        arrayAddress.push(addresses.p3, addresses.p4, addresses.p5);
        myMemberArray2 = new MemberArray(arrayAddress);

        let action = new CommitteeAction({
            addresses: myMemberArray2,
            threshold: threshold2,
            ipfsHash: IPFSHash.fromString('testing'),
        });

        let tx = await Mina.transaction(feePayer, () => {
            committeeContract.createCommittee(action);
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
    });

    xit('create proof first step...', async () => {
        // create first step proof
        proof = await CreateCommittee.firstStep(
            Reducer.initialActionState,
            memberStorage.root,
            settingStorage.root,
            committeeContract.nextCommitteeId.get()
        );
        expect(proof.publicOutput.initialActionState).toEqual(
            Reducer.initialActionState
        );
        expect(proof.publicOutput.initialCommitteeId).toEqual(Field(0));
    });

    xit('create proof next step 1...', async () => {
        proof = await CreateCommittee.nextStep(
            proof,
            new CommitteeAction({
                addresses: myMemberArray1,
                threshold: threshold1,
                ipfsHash: IPFSHash.fromString('testing'),
            }),
            memberStorage.getLevel1Witness(Field(0)),
            settingStorage.getWitness(Field(0))
        );

        expect(proof.publicOutput.initialActionState).toEqual(
            Reducer.initialActionState
        );

        ////// udpate data to local

        // memberMerkleTree.set
        tree1 = EMPTY_LEVEL_2_TREE();
        for (let i = 0; i < Number(myMemberArray1.length); i++) {
            tree1.setLeaf(
                BigInt(i),
                MemberArray.hash(myMemberArray1.get(Field(i)))
            );
        }

        memberStorage.updateInternal(Field(0), tree1);
        settingStorage.updateLeaf(
            { level1Index: Field(0) },
            Poseidon.hash([Field(1), myMemberArray1.length])
        );
    });

    xit('create proof next step 2...', async () => {
        proof = await CreateCommittee.nextStep(
            proof,
            new CommitteeAction({
                addresses: myMemberArray2,
                threshold: threshold2,
                ipfsHash: IPFSHash.fromString('testing'),
            }),
            memberStorage.getLevel1Witness(Field(1)),
            settingStorage.getWitness(Field(1))
        );

        expect(proof.publicOutput.initialActionState).toEqual(
            Reducer.initialActionState
        );
        ////// udpate data to local

        // memberMerkleTree.set
        tree2 = EMPTY_LEVEL_2_TREE();
        for (let i = 0; i < Number(myMemberArray2.length); i++) {
            tree2.setLeaf(
                BigInt(i),
                MemberArray.hash(myMemberArray2.get(Field(i)))
            );
        }

        memberStorage.updateInternal(Field(1), tree2);
        settingStorage.updateLeaf(
            { level1Index: Field(1) },
            Poseidon.hash([Field(2), myMemberArray2.length])
        );
    });

    xit('committeeContract rollupIncrements', async () => {
        let tx = await Mina.transaction(feePayer, () => {
            committeeContract.rollupIncrements(proof);
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
    });

    xit('check if p2 belong to committee 0', async () => {
        // check if memerber belong to committeeId
        let checkInput = new CheckMemberInput({
            address: addresses.p2,
            commiteeId: Field(0),
            memberWitness: memberStorage.getWitness(Field(0), Field(1)),
        });
        let tx = await Mina.transaction(feePayer, () => {
            committeeContract.checkMember(checkInput);
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();
    });

    xit('check if p2 belong to committee 1: to throw error', async () => {
        // check if memerber belong to committeeId
        let checkInput = new CheckMemberInput({
            address: addresses.p2,
            commiteeId: Field(1),
            memberWitness: memberStorage.getWitness(Field(1), Field(1)),
        });
        expect(() => {
            committeeContract.checkMember(checkInput);
        }).toThrowError();
    });
});
