/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fs from 'fs/promises';
import { Bool, Cache, Field, Provable, PublicKey, Reducer } from 'o1js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';

import { prepare } from '../scripts/helper/prepare.js';
import { Network } from '../scripts/helper/config.js';
import { fetchAccounts } from '../scripts/helper/index.js';
import { INST_LIMITS } from '../constants.js';
import { MemberPublicKeyArray } from '../libs/types.js';
import {
    CommitteeAction,
    CommitteeActionEnum,
    CommitteeConfigInput,
    CommitteeContract,
    CommitteeMemberInput,
    CreateCommitteeActions,
    MemberStorage,
    RollupCommittee,
    SettingStorage,
} from '../zkapps/committee/index.js';

describe('DKG Committee', () => {
    const doProofs = true;
    const analyzing = false;
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
        members: MemberPublicKeyArray;
        threshold: Field;
        ipfsHash: IpfsHash;
        createActions: CreateCommitteeActions;
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
        users = [_.accounts[0], _.accounts[1], _.accounts[2], _.accounts[3]];
        await Utils.compile(RollupCommittee, { cache, profiler, logger });
        if (doProofs) {
            await Utils.compile(CommitteeContract, { cache, profiler, logger });
        }
        if (analyzing) {
            Provable.log(await RollupCommittee.analyzeMethods());
            Provable.log(await CommitteeContract.analyzeMethods());
        }
        committeeZkApp = Utils.getZkApp(
            _.accounts.committee,
            new CommitteeContract(_.accounts.committee.publicKey),
            { name: CommitteeContract.name }
        );
        await Utils.deployZkApps([committeeZkApp], _.feePayer, true, {
            logger,
        });
        await fetchAccounts([committeeZkApp.key.publicKey]);
    });

    // it('Should create committee with config T = 1, N = 2', async () => {
    //     let { feePayer } = _;
    //     let memberArray = new MemberPublicKeyArray([
    //         users[0].publicKey,
    //         users[1].publicKey,
    //     ]);
    //     const threshold = Field(1);
    //     const ipfsHash = IpfsHash.fromString(
    //         'QmXJofK5TCzogTqut9Kpx1Dh93NgiEnQ8ib3oiWtYuM883'
    //     );

    //     let committeeContract = committeeZkApp.contract as CommitteeContract;
    //     await Utils.proveAndSendTx(
    //         CommitteeContract.name,
    //         'create',
    //         async () =>
    //             committeeContract.create(
    //                 memberArray,
    //                 threshold,
    //                 ipfsHash,
    //                 Bool(false)
    //             ),
    //         feePayer,
    //         true,
    //         { profiler, logger }
    //     );
    //     await fetchAccounts([committeeZkApp.key.publicKey]);
    //     let actions = memberArray.values.map((address: PublicKey) => {
    //         return new CommitteeAction({
    //             committeeId: Field(-1),
    //             numParties: memberArray.length,
    //             address,
    //             threshold,
    //             ipfsHash,
    //             mask: CommitteeActionMask.createMask(
    //                 Field(CommitteeActionEnum.CREATE)
    //             ),
    //         });
    //     });
    //     committeeZkApp.actions!.concat(
    //         actions.map((action) => CommitteeAction.toFields(action))
    //     );
    //     committees.push({
    //         members: memberArray,
    //         threshold,
    //         ipfsHash,
    //         createActions: new CreateActions(
    //             actions.slice(0, Number(memberArray.length))
    //         ),
    //     });
    // });

    it('Should create committee with config T = 2, N = 3', async () => {
        let { feePayer } = _;
        let memberArray = new MemberPublicKeyArray([
            users[0].publicKey,
            users[1].publicKey,
            users[2].publicKey,
        ]);
        const threshold = Field(2);
        const ipfsHash = IpfsHash.fromString(
            'QmXJofK5TCzogTqut9Kpx1Dh93NgiEnQ8ib3oiWtYuM883'
        );

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        await Utils.proveAndSendTx(
            CommitteeContract.name,
            'create',
            async () =>
                committeeContract.create(
                    memberArray,
                    threshold,
                    ipfsHash,
                    Bool(true)
                ),
            feePayer,
            true,
            { profiler, logger }
        );
        await fetchAccounts([committeeZkApp.key.publicKey]);
        let actions = memberArray.values.map((address: PublicKey) => {
            let action = new CommitteeAction({
                packedData: CommitteeAction.pack(
                    Field(INST_LIMITS.COMMITTEE),
                    memberArray.length,
                    threshold,
                    Field(CommitteeActionEnum.CREATE)
                ),
                address,
            });
            return action;
        });
        committeeZkApp.actionss.push(
            actions.map((action) => CommitteeAction.toFields(action))
        );

        committees.push({
            members: memberArray,
            threshold,
            ipfsHash,
            createActions: new CreateCommitteeActions(
                actions.slice(0, Number(memberArray.length))
            ),
        });
    });

    it('Should rollup CREATE actions and update committees', async () => {
        let { feePayer } = _;
        // create first step proof
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        let proof = await Utils.prove(
            RollupCommittee.name,
            'init',
            async () =>
                RollupCommittee.init(
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
                RollupCommittee.name,
                'create',
                async () =>
                    RollupCommittee.create(
                        proof,
                        committee.createActions,
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
                    {
                        pubKey: committee.members.get(Field(j)),
                        active: Bool(false),
                    }
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
        expect(committeeContract.actionState.get()).toEqual(
            committeeContract.account.actionState.get()
        );
    });

    it('Should allow member join committee', async () => {
        for (let i = 0; i < committees.length; i++) {
            let committee = committees[i];
            for (let j = 0; j < Number(committee.members.length); j++) {
                let member = committee.members.get(Field(j));
                let feePayer: Utils.FeePayer = {
                    sender: {
                        privateKey: users[j].privateKey,
                        publicKey: users[j].publicKey,
                    },
                };
                let ipfsHash = committee.ipfsHash;
                let committeeContract =
                    committeeZkApp.contract as CommitteeContract;
                await Utils.proveAndSendTx(
                    CommitteeContract.name,
                    'join',
                    async () => committeeContract.join(Field(i), ipfsHash),
                    feePayer,
                    true,
                    { profiler, logger }
                );
                await fetchAccounts([committeeZkApp.key.publicKey]);
                let action = new CommitteeAction({
                    packedData: CommitteeAction.pack(
                        Field(i),
                        Field(0),
                        Field(0),
                        Field(CommitteeActionEnum.JOIN)
                    ),
                    address: member,
                });
                committeeZkApp.actionss.push([
                    CommitteeAction.toFields(action),
                ]);
            }
        }
    });

    it('Should rollup JOIN actions and update committees', async () => {
        let { feePayer } = _;
        // create first step proof
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        let proof = await Utils.prove(
            RollupCommittee.name,
            'init',
            async () =>
                RollupCommittee.init(
                    committeeContract.actionState.get(),
                    memberStorage.root,
                    settingStorage.root,
                    committeeContract.nextCommitteeId.get()
                ),
            { profiler, logger }
        );
        for (let i = 0; i < committees.length; i++) {
            let committee = committees[i];
            for (let j = 0; j < Number(committee.members.length); j++) {
                let action = new CommitteeAction({
                    packedData: CommitteeAction.pack(
                        Field(i),
                        Field(0),
                        Field(0),
                        Field(CommitteeActionEnum.JOIN)
                    ),
                    address: users[j].publicKey,
                });
                let witness = memberStorage.getWitness(Field(i), Field(j));
                // let r = Field.random();
                // let { c, U } = await ECElGamal.Lib.encrypt(
                //     Field(0),
                //     users[j].publicKey.toGroup(),
                //     r
                // );
                // let dummyProof = await ECElGamal.HashEncoding.Enc.encrypt(
                //     new ECElGamal.HashEncoding.Input({
                //         pubKey: users[j].publicKey.toGroup(),
                //         c,
                //         U,
                //     }),
                //     Field(0),
                //     r
                // );
                proof = await Utils.prove(
                    RollupCommittee.name,
                    'join',
                    async () =>
                        RollupCommittee.join(
                            proof,
                            action,
                            witness.level1,
                            witness.level2
                        ),
                    { profiler, logger }
                );
                memberStorage.updateRawLeaf(
                    {
                        level1Index: Field(i),
                        level2Index: Field(j),
                    },
                    {
                        pubKey: users[j].publicKey,
                        active: Bool(true),
                    }
                );
            }
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
    });

    it('Should not create committee with duplicated members', async () => {
        let { feePayer } = _;
        let memberArray = new MemberPublicKeyArray([
            users[0].publicKey,
            users[1].publicKey,
            users[0].publicKey,
        ]);
        const threshold = Field(3);
        const ipfsHash = IpfsHash.fromString(
            'QmXJofK5TCzogTqut9Kpx1Dh93NgiEnQ8ib3oiWtYuM883'
        );

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        expect(
            Utils.proveAndSendTx(
                CommitteeContract.name,
                'create',
                async () =>
                    committeeContract.create(
                        memberArray,
                        threshold,
                        ipfsHash,
                        Bool(true)
                    ),
                feePayer,
                true,
                { logger }
            )
        ).rejects.toThrow();
    });

    it('Should not create committee with threshold T = 0', async () => {
        let { feePayer } = _;
        let memberArray = new MemberPublicKeyArray([
            users[0].publicKey,
            users[1].publicKey,
        ]);
        const threshold = Field(0);
        const ipfsHash = IpfsHash.fromString(
            'QmXJofK5TCzogTqut9Kpx1Dh93NgiEnQ8ib3oiWtYuM883'
        );

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        expect(
            Utils.proveAndSendTx(
                CommitteeContract.name,
                'create',
                async () =>
                    committeeContract.create(
                        memberArray,
                        threshold,
                        ipfsHash,
                        Bool(true)
                    ),
                feePayer,
                true,
                { logger }
            )
        ).rejects.toThrow();
    });

    it('Should not create committee with T > N', async () => {
        let { feePayer } = _;
        let memberArray = new MemberPublicKeyArray([
            users[0].publicKey,
            users[1].publicKey,
        ]);
        const threshold = Field(3);
        const ipfsHash = IpfsHash.fromString(
            'QmXJofK5TCzogTqut9Kpx1Dh93NgiEnQ8ib3oiWtYuM883'
        );

        let committeeContract = committeeZkApp.contract as CommitteeContract;
        expect(
            Utils.proveAndSendTx(
                CommitteeContract.name,
                'create',
                async () =>
                    committeeContract.create(
                        memberArray,
                        threshold,
                        ipfsHash,
                        Bool(true)
                    ),
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
            isActive: Bool(true),
            memberWitness: memberStorage.getWitness(Field(0), Field(0)),
        });
        let committeeContract = committeeZkApp.contract as CommitteeContract;
        committeeContract.verifyMember(memberVerification);
    });

    it('Should verify committee non-membership', async () => {
        // Check if member belong to committeeId
        let memberVerification = new CommitteeMemberInput({
            address: users[3].publicKey,
            committeeId: Field(0),
            memberId: Field(2),
            isActive: Bool(true),
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
        committeeContract.verifySetting(correctInput);

        let incorrectInput = new CommitteeConfigInput({
            N: committees[0].members.length,
            T: committees[0].threshold.add(1),
            committeeId: Field(0),
            settingWitness: settingStorage.getWitness(Field(0)),
        });
        expect(() => committeeContract.verifySetting(incorrectInput)).toThrow();
    });

    afterAll(async () => {
        profiler.store();
    });
});
