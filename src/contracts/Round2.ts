import {
    Field,
    Group,
    method,
    Poseidon,
    Provable,
    Reducer,
    SelfProof,
    SmartContract,
    state,
    State,
    Struct,
    UInt8,
    ZkProgram,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import {
    EncryptionHashArray,
    PublicKeyArray,
    Round2Contribution,
} from '../libs/Committee.js';
import {
    CommitteeWitness,
    CommitteeLevel1Witness,
} from '../storages/CommitteeStorage.js';
import {
    calculateKeyIndex,
    DKGWitness,
    DKG_LEVEL_1_TREE,
    DKG_LEVEL_2_TREE,
    DkgLevel1Witness,
    ProcessedContributions,
} from '../storages/DkgStorage.js';
import {
    CommitteeConfigInput,
    CommitteeMemberInput,
    CommitteeContract,
} from './Committee.js';
import {
    DkgActionEnum,
    DkgContract,
    KeyStatus,
    KeyStatusInput,
} from './DKG.js';
import { BatchEncryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { INSTANCE_LIMITS } from '../constants.js';
import {
    ADDRESS_MT,
    verifyZkApp,
    ZkAppRef,
} from '../storages/AddressStorage.js';
import {
    PROCESS_MT,
    ProcessWitness,
    processAction,
} from '../storages/ProcessStorage.js';
import {
    ErrorEnum,
    EventEnum,
    ZkAppAction,
    ZkAppIndex,
    ZkProgramEnum,
} from './constants.js';
import { RollupContract, verifyRollup } from './Rollup.js';
import {
    calculateActionIndex,
    RollupWitness,
} from '../storages/RollupStorage.js';

export {
    Action as Round2Action,
    FinalizeRound2Input,
    FinalizeRound2,
    FinalizeRound2Proof,
    Round2Contract,
};

class Action
    extends Struct({
        packedId: Field,
        contribution: Round2Contribution,
    })
    implements ZkAppAction
{
    // static empty(): Action {
    //     return new Action({
    //         committeeId: Field(0),
    //         keyId: Field(0),
    //         memberId: Field(0),
    //         contribution: Round2Contribution.empty(),
    //     });
    // }

    static empty(): Action {
        return new Action({
            packedId: Field(0),
            contribution: Round2Contribution.empty(),
        });
    }

    static packId(committeeId: Field, keyId: Field, memberId: Field): Field {
        let committeeIdLength =
            Math.floor(Math.log2(INSTANCE_LIMITS.COMMITTEE)) + 1;
        let keyIdLength = Math.floor(Math.log2(INSTANCE_LIMITS.KEY)) + 1;
        let memberIdLength = Math.floor(Math.log2(INSTANCE_LIMITS.MEMBER)) + 1;

        return Field.fromBits([
            ...committeeId.toBits().slice(0, committeeIdLength),
            ...keyId.toBits().slice(0, keyIdLength),
            ...memberId.toBits().slice(0, memberIdLength),
        ]);
    }

    static unpackId(packedId: Field): {
        committeeId: Field;
        keyId: Field;
        memberId: Field;
    } {
        let committeeIdLength =
            Math.floor(Math.log2(INSTANCE_LIMITS.COMMITTEE)) + 1;
        let keyIdLength = Math.floor(Math.log2(INSTANCE_LIMITS.KEY)) + 1;
        let memberIdLength = Math.floor(Math.log2(INSTANCE_LIMITS.MEMBER)) + 1;

        return {
            committeeId: Field.fromBits(
                packedId.toBits().slice(0, committeeIdLength)
            ),
            keyId: Field.fromBits(
                packedId
                    .toBits()
                    .slice(committeeIdLength, committeeIdLength + keyIdLength)
            ),
            memberId: Field.fromBits(
                packedId
                    .toBits()
                    .slice(
                        committeeIdLength + keyIdLength,
                        committeeIdLength + keyIdLength + memberIdLength
                    )
            ),
        };
    }

    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }

    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

class FinalizeRound2Input extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

class FinalizeRound2Output extends Struct({
    rollupRoot: Field,
    T: Field,
    N: Field,
    initialContributionRoot: Field,
    initialProcessRoot: Field,
    nextContributionRoot: Field,
    nextProcessRoot: Field,
    keyIndex: Field,
    encryptionHashes: EncryptionHashArray,
    processedActions: ProcessedContributions,
}) {}

const FinalizeRound2 = ZkProgram({
    name: ZkProgramEnum.FinalizeRound2,
    publicInput: FinalizeRound2Input,
    publicOutput: FinalizeRound2Output,
    methods: {
        init: {
            privateInputs: [
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                EncryptionHashArray,
                DkgLevel1Witness,
            ],
            // initialEncryptionHashes must be filled with Field(0) with correct length
            async method(
                input: FinalizeRound2Input,
                rollupRoot: Field,
                T: Field,
                N: Field,
                initialContributionRoot: Field,
                initialProcessRoot: Field,
                keyIndex: Field,
                initialEncryptionHashes: EncryptionHashArray,
                contributionWitness: DkgLevel1Witness
            ) {
                // Verify there is no recorded contribution for the request
                initialContributionRoot.assertEquals(
                    contributionWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'init',
                        ErrorEnum.R2_CONTRIBUTION_ROOT
                    )
                );
                keyIndex.assertEquals(
                    contributionWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'init',
                        ErrorEnum.R2_CONTRIBUTION_INDEX_L1
                    )
                );
                initialEncryptionHashes.hash().assertEquals(
                    Provable.witness(Field, () =>
                        new EncryptionHashArray(
                            [...Array(Number(N)).keys()].map(() => Field(0))
                        ).hash()
                    ),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'init',
                        ErrorEnum.INITIAL_ENCRYPTION_HASHES
                    )
                );

                // Record an empty level 2 tree
                let nextContributionRoot = contributionWitness.calculateRoot(
                    DKG_LEVEL_2_TREE().getRoot()
                );

                return new FinalizeRound2Output({
                    rollupRoot,
                    T,
                    N,
                    initialContributionRoot,
                    initialProcessRoot,
                    nextContributionRoot,
                    nextProcessRoot: initialProcessRoot,
                    keyIndex,
                    encryptionHashes: initialEncryptionHashes,
                    processedActions: new ProcessedContributions(),
                });
            },
        },
        contribute: {
            privateInputs: [
                SelfProof<FinalizeRound2Input, FinalizeRound2Output>,
                DKGWitness,
                RollupWitness,
                ProcessWitness,
            ],
            async method(
                input: FinalizeRound2Input,
                earlierProof: SelfProof<
                    FinalizeRound2Input,
                    FinalizeRound2Output
                >,
                contributionWitness: DKGWitness,
                rollupWitness: RollupWitness,
                processWitness: ProcessWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();
                let { committeeId, keyId, memberId } = Action.unpackId(
                    input.action.packedId
                );
                memberId.assertEquals(
                    earlierProof.publicOutput.processedActions.length,
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'contribute',
                        ErrorEnum.R2_CONTRIBUTION_ORDER
                    )
                );
                input.action.contribution.c.length.assertEquals(
                    earlierProof.publicOutput.N,
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'contribute',
                        ErrorEnum.R2_CONTRIBUTION_VALUE
                    )
                );

                // Verify contributionRoot using the same keyIndex
                let keyIndex = calculateKeyIndex(committeeId, keyId);
                keyIndex.assertEquals(
                    earlierProof.publicOutput.keyIndex,
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'contribute',
                        ErrorEnum.R2_CONTRIBUTION_KEY_INDEX
                    )
                );

                // Verify the member's contribution witness
                earlierProof.publicOutput.nextContributionRoot.assertEquals(
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'contribute',
                        ErrorEnum.R2_CONTRIBUTION_ROOT
                    )
                );
                keyIndex.assertEquals(
                    contributionWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'contribute',
                        ErrorEnum.R2_CONTRIBUTION_INDEX_L1
                    )
                );
                memberId.assertEquals(
                    contributionWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'contribute',
                        ErrorEnum.R2_CONTRIBUTION_INDEX_L2
                    )
                );

                // Compute new contribution root
                let nextContributionRoot =
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(
                            input.action.contribution.hash()
                        )
                    );

                // Compute new encryption hash array
                let encryptionHashes =
                    earlierProof.publicOutput.encryptionHashes;
                for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
                    let hashChain = encryptionHashes.get(Field(i));
                    hashChain = Provable.if(
                        Field(i).greaterThanOrEqual(
                            earlierProof.publicOutput.encryptionHashes.length
                        ),
                        Field(0),
                        Poseidon.hash(
                            [
                                hashChain,
                                input.action.contribution.c
                                    .get(Field(i))
                                    .toFields(),
                                input.action.contribution.U.get(
                                    Field(i)
                                ).toFields(),
                            ].flat()
                        )
                    );
                    encryptionHashes.set(Field(i), hashChain);
                }

                // Verify action is rolluped
                let actionIndex = calculateActionIndex(
                    Field(ZkAppIndex.ROUND2),
                    input.actionId
                );
                verifyRollup(
                    FinalizeRound2.name,
                    actionIndex,
                    input.action.hash(),
                    earlierProof.publicOutput.rollupRoot,
                    rollupWitness
                );

                // Calculate corresponding action state
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );
                let processedActions =
                    earlierProof.publicOutput.processedActions;
                processedActions.push(actionState);

                // Verify the action isn't already processed
                let nextProcessRoot = processAction(
                    FinalizeRound2.name,
                    input.actionId,
                    UInt8.from(0),
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeRound2Output({
                    ...earlierProof.publicOutput,
                    nextContributionRoot,
                    nextProcessRoot,
                    keyIndex,
                    encryptionHashes,
                    processedActions,
                });
            },
        },
    },
});

class FinalizeRound2Proof extends ZkProgram.Proof(FinalizeRound2) {}

class Round2Contract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     * @see AddressStorage for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing members' contributions
     * @see Round2ContributionStorage for off-chain storage implementation
     */
    @state(Field) contributionRoot = State<Field>();

    /**
     * @description MT storing members' encryption hashes
     * @see EncryptionStorage for off-chain storage implementation
     */
    @state(Field) encryptionRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     * @see ProcessStorage for off-chain storage implementation
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.PROCESSED]: ProcessedContributions,
    };

    init() {
        super.init();
        this.zkAppRoot.set(ADDRESS_MT().getRoot());
        this.contributionRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.encryptionRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.processRoot.set(PROCESS_MT().getRoot());
    }

    /**
     * Submit round 2 contribution for key generation
     * @param keyId Committee's key Id
     * @param proof
     * @param committee
     * @param round1
     * @param memberWitness
     * @param publicKeysWitness
     */
    @method
    async contribute(
        keyId: Field,
        proof: BatchEncryptionProof,
        memberWitness: CommitteeWitness,
        publicKeysWitness: DkgLevel1Witness,
        committee: ZkAppRef,
        round1: ZkAppRef,
        rollup: ZkAppRef,
        selfRef: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify CommitteeContract address
        verifyZkApp(
            Round2Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );

        // Verify Round1Contract address
        verifyZkApp(
            Round2Contract.name,
            round1,
            zkAppRoot,
            Field(ZkAppIndex.ROUND1)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            Round2Contract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const round1Contract = new Round1Contract(round1.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify encryption proof
        proof.verify();

        // Verify committee member
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address: this.sender.getAndRequireSignature(),
                committeeId,
                memberId,
                memberWitness,
            })
        );

        // Verify round 1 public keys (C0[])
        // @todo Remove Provable.witness or adding assertion
        // let publicKeysLeaf = Provable.witness(Field, () => {
        // let publicKeysMT = DKG_LEVEL_2_TREE();
        // for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
        //     let value = Provable.if(
        //         Field(i).greaterThanOrEqual(
        //             proof.publicInput.publicKeys.length
        //         ),
        //         Field(0),
        //         PublicKeyArray.hash(proof.publicInput.publicKeys.get(Field(i)))
        //     );
        //     publicKeysMT.setLeaf(BigInt(i), value);
        // }
        // return publicKeysMT.getRoot();
        // });
        // round1Contract.verifyEncPubKeys(
        //     committeeId,
        //     keyId,
        //     publicKeysMT.getRoot(),
        //     publicKeysWitness
        // );

        // Create & dispatch action
        let action = new Action({
            packedId: Action.packId(committeeId, keyId, memberId),
            contribution: new Round2Contribution({
                c: proof.publicInput.c,
                U: proof.publicInput.U,
            }),
        });
        this.reducer.dispatch(action);

        // Record action for rollup
        selfRef.address.assertEquals(this.address);
        await rollupContract.recordAction(action.hash(), selfRef);
    }

    /**
     * Finalize round 2 with N members' contribution
     * @param proof
     * @param encryptionWitness
     * @param committee
     * @param dkg
     * @param settingWitness
     * @param keyStatusWitness
     */
    @method
    async finalize(
        proof: FinalizeRound2Proof,
        encryptionWitness: DkgLevel1Witness,
        settingWitness: CommitteeLevel1Witness,
        keyStatusWitness: DkgLevel1Witness,
        committee: ZkAppRef,
        dkg: ZkAppRef,
        rollup: ZkAppRef,
        selfRef: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let contributionRoot = this.contributionRoot.getAndRequireEquals();
        let encryptionRoot = this.encryptionRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        let { committeeId, keyId } = Action.unpackId(
            proof.publicInput.action.packedId
        );

        // Verify Committee Contract address
        verifyZkApp(
            Round2Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );

        // Verify Dkg Contract address
        verifyZkApp(Round2Contract.name, dkg, zkAppRoot, Field(ZkAppIndex.DKG));

        // Verify Rollup Contract address
        verifyZkApp(
            Round2Contract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const dkgContract = new DkgContract(dkg.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify proof
        proof.verify();
        proof.publicOutput.rollupRoot.assertEquals(
            rollupContract.rollupRoot.getAndRequireEquals(),
            Utils.buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.ROLLUP_ROOT
            )
        );
        proof.publicOutput.initialContributionRoot.assertEquals(
            contributionRoot,
            Utils.buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.R2_CONTRIBUTION_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.PROCESS_ROOT
            )
        );
        proof.publicOutput.processedActions.length.assertEquals(
            proof.publicOutput.N,
            Utils.buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.R2_CONTRIBUTION_THRESHOLD
            )
        );

        // Verify committee config
        committeeContract.verifyConfig(
            new CommitteeConfigInput({
                N: proof.publicOutput.N,
                T: proof.publicOutput.T,
                committeeId: committeeId,
                settingWitness: settingWitness,
            })
        );

        // Verify key status
        dkgContract.verifyKeyStatus(
            new KeyStatusInput({
                committeeId: committeeId,
                keyId: keyId,
                status: Field(KeyStatus.ROUND_2_CONTRIBUTION),
                witness: keyStatusWitness,
            })
        );

        // Verify encryption witness
        let encryptionHashesMT = DKG_LEVEL_2_TREE();
        for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
            let value = Provable.if(
                Field(i).greaterThanOrEqual(
                    proof.publicOutput.encryptionHashes.length
                ),
                Field(0),
                proof.publicOutput.encryptionHashes.get(Field(i))
            );
            encryptionHashesMT.setLeaf(BigInt(i), value);
        }
        encryptionRoot.assertEquals(
            encryptionWitness.calculateRoot(Field(0)),
            Utils.buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.ENCRYPTION_ROOT
            )
        );
        proof.publicOutput.keyIndex.assertEquals(
            encryptionWitness.calculateIndex(),
            Utils.buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.ENCRYPTION_INDEX_L1
            )
        );

        // Set new states
        this.contributionRoot.set(proof.publicOutput.nextContributionRoot);
        this.encryptionRoot.set(
            encryptionWitness.calculateRoot(encryptionHashesMT.getRoot())
        );
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        // Create & dispatch action to DkgContract
        await dkgContract.finalizeContributionRound(
            committeeId,
            keyId,
            Field(DkgActionEnum.FINALIZE_ROUND_2),
            Group.zero,
            selfRef,
            rollup,
            dkg
        );

        // Emit events
        this.emitEvent(
            EventEnum.PROCESSED,
            proof.publicOutput.processedActions
        );
    }

    verifyEncHashChain(
        committeeId: Field,
        keyId: Field,
        memberId: Field,
        hashChain: Field,
        witness: DKGWitness
    ) {
        let keyIndex = calculateKeyIndex(committeeId, keyId);
        this.encryptionRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.level1.calculateRoot(
                    witness.level2.calculateRoot(hashChain)
                ),
                Utils.buildAssertMessage(
                    Round2Contract.name,
                    'verifyEncHashChain',
                    ErrorEnum.ENCRYPTION_ROOT
                )
            );
        keyIndex.assertEquals(
            witness.level1.calculateIndex(),
            Utils.buildAssertMessage(
                Round2Contract.name,
                'verifyEncHashChain',
                ErrorEnum.ENCRYPTION_INDEX_L1
            )
        );
        memberId.assertEquals(
            witness.level2.calculateIndex(),
            Utils.buildAssertMessage(
                Round2Contract.name,
                'verifyEncHashChain',
                ErrorEnum.ENCRYPTION_INDEX_L2
            )
        );
    }
}
