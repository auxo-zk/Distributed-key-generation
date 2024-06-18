/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fs from 'fs/promises';
import { Cache, Field, Reducer } from 'o1js';
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
import { prepare } from './helper/prepare.js';
import { Network } from './helper/config.js';
import { fetchAccounts } from './helper/index.js';

describe('DKG Committee', () => {
    const doProofs = true;
    const profiler = Utils.getProfiler('committee', fs);
    const logger = {
        info: true,
        error: true,
    };
    let cache: Cache;
    let _: any;
    let users: Utils.Key[] = [];
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
                aliases: ['committee'],
            }
        );
        cache = _.cache;
        users = [_.accounts[0], _.accounts[1], _.accounts[2]];
        await Utils.compile(UpdateCommittee, { cache, profiler, logger });
        if (doProofs) {
            await Utils.compile(CommitteeContract, { cache, profiler, logger });
        }
        committeeZkApp = Utils.getZkApp(
            _.accounts.committee,
            new CommitteeContract(_.accounts.committee.publicKey),
            { name: CommitteeContract.name }
        );
        await Utils.deployZkApps([committeeZkApp], _.feePayer, true, {
            logger,
        });
        // await fetchAccounts([committeeZkApp.key.publicKey]);
    });

    it('Should create committee with config T = 1, N = 2', async () => {
        let { feePayer } = _;
        let memberArray = new MemberArray([
            users[0].publicKey,
            users[1].publicKey,
        ]);

        let action = new CommitteeAction({
            addresses: memberArray,
            threshold: Field(1),
            ipfsHash: IpfsHash.fromString(
                'QmXJofK5TCzogTqut9Kpx1Dh93NgiEnQ8ib3oiWtYuM883'
            ),
        });

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        await Utils.proveAndSendTx(
            CommitteeContract.name,
            'create',
            async () => committeeContract.create(action),
            feePayer,
            true,
            { profiler, logger }
        );
        await fetchAccounts([committeeZkApp.key.publicKey]);

        committees.push({
            members: action.addresses,
            threshold: action.threshold,
            ipfsHash: action.ipfsHash,
        });
        committeeZkApp.actions!.push(CommitteeAction.toFields(action));
    });

    it('Should create committee with config T = 3, N = 3', async () => {
        let { feePayer } = _;
        let memberArray = new MemberArray([
            users[0].publicKey,
            users[1].publicKey,
            users[2].publicKey,
        ]);

        let action = new CommitteeAction({
            addresses: memberArray,
            threshold: Field(3),
            ipfsHash: IpfsHash.fromString(
                'QmSUEHkTCwfcSeumeYXgvd6jXtS76tYLfab94Sk22hBmyE'
            ),
        });

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        await Utils.proveAndSendTx(
            CommitteeContract.name,
            'create',
            async () => committeeContract.create(action),
            feePayer,
            true,
            { profiler, logger }
        );
        await fetchAccounts([committeeZkApp.key.publicKey]);

        committees.push({
            members: action.addresses,
            threshold: action.threshold,
            ipfsHash: action.ipfsHash,
        });
        committeeZkApp.actions!.push(CommitteeAction.toFields(action));
    });

    it('Should rollup actions and update committees...', async () => {
        let { feePayer } = _;
        // create first step proof
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        let proof = await Utils.prove(
            UpdateCommittee.name,
            'init',
            async () =>
                UpdateCommittee.init(
                    Reducer.initialActionState,
                    memberStorage.root,
                    settingStorage.root,
                    committeeContract.nextCommitteeId.get()
                ),
            { profiler, logger }
        );
        for (let i = 0; i < committees.length; i++) {
            let committee = committees[i];
            proof = await Utils.prove(
                UpdateCommittee.name,
                'update',
                async () =>
                    UpdateCommittee.update(
                        proof,
                        CommitteeAction.fromFields(committeeZkApp.actions![i]),
                        memberStorage.getLevel1Witness(Field(i)),
                        settingStorage.getLevel1Witness(Field(i))
                    ),
                { profiler, logger }
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
            'update',
            async () => committeeContract.update(proof),
            feePayer,
            true,
            { profiler, logger }
        );
        await fetchAccounts([committeeZkApp.key.publicKey]);

        expect(committeeContract.memberRoot.get()).toEqual(memberStorage.root);
        expect(committeeContract.settingRoot.get()).toEqual(
            settingStorage.root
        );
    });

    it('Should not create committee with duplicated members', async () => {
        let { feePayer } = _;
        let memberArray = new MemberArray([
            users[0].publicKey,
            users[1].publicKey,
            users[0].publicKey,
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
                'create',
                async () => committeeContract.create(action),
                feePayer,
                true,
                { logger }
            )
        ).rejects.toThrow();
    });

    it('Should not create committee with threshold T = 0', async () => {
        let { feePayer } = _;
        let memberArray = new MemberArray([
            users[0].publicKey,
            users[1].publicKey,
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
                'create',
                async () => committeeContract.create(action),
                feePayer,
                true,
                { logger }
            )
        ).rejects.toThrow();
    });

    it('Should verify committee membership', async () => {
        let memberVerification = new CommitteeMemberInput({
            address: users[0].publicKey,
            committeeId: Field(0),
            memberId: Field(0),
            memberWitness: memberStorage.getWitness(Field(0), Field(0)),
        });
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        committeeContract.verifyMember(memberVerification);
    });

    it('Should verify committee non-membership', async () => {
        // Check if member belong to committeeId
        let memberVerification = new CommitteeMemberInput({
            address: users[2].publicKey,
            committeeId: Field(0),
            memberId: Field(2),
            memberWitness: memberStorage.getWitness(Field(0), Field(2)),
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
