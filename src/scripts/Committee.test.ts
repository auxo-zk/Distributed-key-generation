/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fs from 'fs/promises';
import { Field, Provable, Reducer } from 'o1js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import {
    CommitteeContract,
    CommitteeAction,
    UpdateCommittee,
    CommitteeMemberInput,
    CommitteeConfigInput,
} from '../contracts/Committee.js';
import { MemberArray } from '../libs/Committee.js';
import { MemberStorage, SettingStorage } from '../storages/CommitteeStorage.js';
import { prepare } from './interactions/prepare.js';
import { Network } from './helper/config.js';

describe('Committee', () => {
    const doProofs = false;
    const profiler = Utils.getProfiler('committee', fs);
    const logger = {
        info: true,
        debug: true,
    };
    let _: any;
    let committeeZkApp: Utils.ZkApp;
    let memberStorage = new MemberStorage();
    let settingStorage = new SettingStorage();
    let committees: {
        members: MemberArray;
        threshold: Field;
        ipfsHash: IpfsHash;
    }[] = [];

    beforeAll(async () => {
        _ = await prepare(
            './caches',
            { type: Network.Local, doProofs },
            {
                aliases: ['committee', 'user1', 'user2', 'user3'],
            }
        );
        await Utils.compile(UpdateCommittee, _.cache, profiler);
        if (doProofs) {
            await Utils.compile(CommitteeContract, _.cache, profiler);
        }
        committeeZkApp = {
            key: _.accounts.committee,
            contract: new CommitteeContract(_.accounts.committee.publicKey),
            name: CommitteeContract.name,
            actions: [],
            events: [],
        };
        await Utils.deployZkApps(
            [{ zkApp: committeeZkApp, initArgs: [] }],
            _.feePayer
        );
    });

    it('Should create committee with config T = 1, N = 2', async () => {
        let { accounts, feePayer } = _;
        let memberArray = new MemberArray([
            accounts.user1.publicKey,
            accounts.user2.publicKey,
        ]);

        let action = new CommitteeAction({
            addresses: memberArray,
            threshold: Field(1),
            ipfsHash: IpfsHash.fromString(
                'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
            ),
        });

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        await Utils.proveAndSendTx(
            CommitteeContract.name,
            'createCommittee',
            async () => committeeContract.createCommittee(action),
            feePayer,
            undefined,
            profiler
        );

        committees.push({
            members: action.addresses,
            threshold: action.threshold,
            ipfsHash: action.ipfsHash,
        });
        committeeZkApp.actions!.push(CommitteeAction.toFields(action));
    });

    it('Should create committee with config T = 3, N = 3', async () => {
        let { accounts, feePayer } = _;
        let memberArray = new MemberArray([
            accounts.user1.publicKey,
            accounts.user2.publicKey,
            accounts.user3.publicKey,
        ]);

        let action = new CommitteeAction({
            addresses: memberArray,
            threshold: Field(3),
            ipfsHash: IpfsHash.fromString(
                'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
            ),
        });

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        await Utils.proveAndSendTx(
            CommitteeContract.name,
            'createCommittee',
            async () => committeeContract.createCommittee(action),
            feePayer
        );

        committees.push({
            members: action.addresses,
            threshold: action.threshold,
            ipfsHash: action.ipfsHash,
        });
        committeeZkApp.actions!.push(CommitteeAction.toFields(action));
    });

    it('Should not create committee with duplicated members', async () => {
        let { accounts, feePayer } = _;
        let memberArray = new MemberArray([
            accounts.user1.publicKey,
            accounts.user2.publicKey,
            accounts.user1.publicKey,
        ]);

        let action = new CommitteeAction({
            addresses: memberArray,
            threshold: Field(1),
            ipfsHash: IpfsHash.fromString(
                'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
            ),
        });

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        expect(
            Utils.proveAndSendTx(
                CommitteeContract.name,
                'createCommittee',
                async () => committeeContract.createCommittee(action),
                feePayer
            )
        ).rejects.toThrow();
    });

    it('Should not create committee with threshold T = 0', async () => {
        let { accounts, feePayer } = _;
        let memberArray = new MemberArray([
            accounts.user1.publicKey,
            accounts.user2.publicKey,
        ]);

        let action = new CommitteeAction({
            addresses: memberArray,
            threshold: Field(0),
            ipfsHash: IpfsHash.fromString(
                'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
            ),
        });

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        expect(
            Utils.proveAndSendTx(
                CommitteeContract.name,
                'createCommittee',
                async () => committeeContract.createCommittee(action),
                feePayer
            )
        ).rejects.toThrow();
    });

    it('Should rollup actions and update committees...', async () => {
        let { feePayer } = _;
        // create first step proof
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        let proof = await Utils.prove(
            UpdateCommittee.name,
            'init',
            UpdateCommittee.init(
                Reducer.initialActionState,
                memberStorage.root,
                settingStorage.root,
                committeeContract.nextCommitteeId.get()
            ),
            profiler,
            logger
        );
        for (let i = 0; i < committees.length; i++) {
            let committee = committees[i];
            proof = await Utils.prove(
                UpdateCommittee.name,
                'update',
                UpdateCommittee.update(
                    proof,
                    CommitteeAction.fromFields(committeeZkApp.actions![i]),
                    memberStorage.getLevel1Witness(Field(i)),
                    settingStorage.getLevel1Witness(Field(i))
                ),
                profiler,
                logger
            );
            for (let j = 0; j < Number(committee.members.length); j++)
                memberStorage.updateRawLeaf(
                    {
                        level1Index: Field(i),
                        level2Index: Field(j),
                    },
                    committee.members.get(Field(j))
                );

            settingStorage.updateRawLeaf(
                { level1Index: Field(i) },
                {
                    T: committees[i].threshold,
                    N: Field(committee.members.length),
                }
            );
        }

        await Utils.proveAndSendTx(
            CommitteeContract.name,
            'updateCommittees',
            async () => committeeContract.updateCommittees(proof),
            feePayer,
            true,
            profiler,
            logger
        );

        Provable.log(memberStorage.root);
        Provable.log(committeeContract.memberRoot.get());
        expect(committeeContract.memberRoot.get()).toEqual(memberStorage.root);
        expect(committeeContract.settingRoot.get()).toEqual(
            settingStorage.root
        );
    });

    it('Should verify committee membership', async () => {
        let { accounts } = _;
        let memberVerification = new CommitteeMemberInput({
            address: accounts.user1.publicKey,
            committeeId: Field(0),
            memberId: Field(0),
            memberWitness: memberStorage.getWitness(Field(0), Field(0)),
        });
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        committeeContract.verifyMember(memberVerification);
    });

    it('Should verify committee non-membership', async () => {
        let { accounts } = _;
        // Check if member belong to committeeId
        let memberVerification = new CommitteeMemberInput({
            address: accounts.user3.publicKey,
            committeeId: Field(0),
            memberId: Field(1),
            memberWitness: memberStorage.getWitness(Field(0), Field(1)),
        });
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        expect(() =>
            committeeContract.verifyMember(memberVerification)
        ).toThrow();
    });

    it('Should verify correctness of setting', async () => {
        let correctInput = new CommitteeConfigInput({
            N: committees[0].members.length,
            T: committees[0].threshold,
            committeeId: Field(0),
            settingWitness: settingStorage.getWitness(Field(0)),
        });
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        committeeContract.verifyConfig(correctInput);

        let incorrectInput = new CommitteeConfigInput({
            N: committees[0].members.length,
            T: committees[0].threshold.add(1),
            committeeId: Field(0),
            settingWitness: settingStorage.getWitness(Field(0)),
        });
        expect(() => committeeContract.verifyConfig(incorrectInput)).toThrow();
    });

    afterAll(async () => {
        profiler.store();
    });
});
