import {
    Field,
    method,
    Poseidon,
    Provable,
    Reducer,
    SelfProof,
    SmartContract,
    state,
    State,
    Struct,
    ZkProgram,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import {
    EncryptionHashArray,
    PublicKeyArray,
    Round2Contribution,
} from '../libs/Committee.js';
import {
    FullMTWitness as CommitteeFullWitness,
    Level1Witness as CommitteeLevel1Witness,
} from '../storages/CommitteeStorage.js';
import {
    calculateKeyIndex,
    FullMTWitness as DKGWitness,
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
    Level1Witness,
} from '../storages/DKGStorage.js';
import {
    CommitteeConfigInput,
    CommitteeMemberInput,
    CommitteeContract,
} from './Committee.js';
import {
    ActionEnum as KeyUpdateEnum,
    DkgContract,
    KeyStatus,
    KeyStatusInput,
} from './DKG.js';
import { BatchEncryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { COMMITTEE_MAX_SIZE, ZkAppEnum, ZkProgramEnum } from '../constants.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessedActions,
    verifyZkApp,
    ZkAppRef,
} from '../storages/SharedStorage.js';
import { processAction, rollup, Rollup } from './Actions.js';
import { ErrorEnum, EventEnum } from './constants.js';

export class Action extends Struct({
    committeeId: Field,
    keyId: Field,
    memberId: Field,
    contribution: Round2Contribution,
}) {
    static empty(): Action {
        return new Action({
            committeeId: Field(0),
            keyId: Field(0),
            memberId: Field(0),
            contribution: Round2Contribution.empty(),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

export const RollupRound2 = Rollup(ZkProgramEnum.RollupRound2, Action);

export class RollupRound2Proof extends ZkProgram.Proof(RollupRound2) {}

export class FinalizeRound2Input extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class FinalizeRound2Output extends Struct({
    T: Field,
    N: Field,
    initialContributionRoot: Field,
    initialProcessRoot: Field,
    nextContributionRoot: Field,
    nextProcessRoot: Field,
    keyIndex: Field,
    encryptionHashes: EncryptionHashArray,
    processedActions: ProcessedActions,
}) {}

/**
 * First step:
 * - Verify there is no recorded contribution for the request
 * - Record an empty level 2 tree
 *
 * Next steps:
 * - Verify earlier proof
 * - Verify contributionRoot using the same keyIndex
 * - Verify the member's contribution witness
 * - Compute new contribution root
 * - Compute new encryption hash array
 * - Verify the action has been reduced
 */
export const FinalizeRound2 = ZkProgram({
    name: ZkProgramEnum.FinalizeRound2,
    publicInput: FinalizeRound2Input,
    publicOutput: FinalizeRound2Output,
    methods: {
        firstStep: {
            privateInputs: [
                Field,
                Field,
                Field,
                Field,
                Field,
                EncryptionHashArray,
                Level1Witness,
            ],
            // initialEncryptionHashes must be filled with Field(0) with correct length
            method(
                input: FinalizeRound2Input,
                T: Field,
                N: Field,
                initialContributionRoot: Field,
                initialProcessRoot: Field,
                keyIndex: Field,
                initialEncryptionHashes: EncryptionHashArray,
                contributionWitness: Level1Witness
            ) {
                // Verify there is no recorded contribution for the request
                initialContributionRoot.assertEquals(
                    contributionWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'firstStep',
                        ErrorEnum.R2_CONTRIBUTION_ROOT
                    )
                );
                keyIndex.assertEquals(
                    contributionWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'firstStep',
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
                        'firstStep',
                        ErrorEnum.INITIAL_ENCRYPTION_HASHES
                    )
                );

                // Record an empty level 2 tree
                let nextContributionRoot = contributionWitness.calculateRoot(
                    EMPTY_LEVEL_2_TREE().getRoot()
                );

                return new FinalizeRound2Output({
                    T: T,
                    N: N,
                    initialContributionRoot: initialContributionRoot,
                    initialProcessRoot: initialProcessRoot,
                    nextContributionRoot: nextContributionRoot,
                    nextProcessRoot: initialProcessRoot,
                    keyIndex: keyIndex,
                    encryptionHashes: initialEncryptionHashes,
                    processedActions: new ProcessedActions(),
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<FinalizeRound2Input, FinalizeRound2Output>,
                DKGWitness,
                ActionWitness,
            ],
            method(
                input: FinalizeRound2Input,
                earlierProof: SelfProof<
                    FinalizeRound2Input,
                    FinalizeRound2Output
                >,
                contributionWitness: DKGWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();
                input.action.memberId.assertEquals(
                    earlierProof.publicOutput.processedActions.length,
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'nextStep',
                        ErrorEnum.R2_CONTRIBUTION_ORDER
                    )
                );
                input.action.contribution.c.length.assertEquals(
                    earlierProof.publicOutput.N,
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'nextStep',
                        ErrorEnum.R2_CONTRIBUTION_VALUE
                    )
                );

                // Verify contributionRoot using the same keyIndex
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                keyIndex.assertEquals(
                    earlierProof.publicOutput.keyIndex,
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'nextStep',
                        ErrorEnum.R2_CONTRIBUTION_INDEX_INDEX
                    )
                );

                // Verify the member's contribution witness
                earlierProof.publicOutput.nextContributionRoot.assertEquals(
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'nextStep',
                        ErrorEnum.R2_CONTRIBUTION_ROOT
                    )
                );
                keyIndex.assertEquals(
                    contributionWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'nextStep',
                        ErrorEnum.R2_CONTRIBUTION_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound2.name,
                        'nextStep',
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
                for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
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
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeRound2Output({
                    T: earlierProof.publicOutput.T,
                    N: earlierProof.publicOutput.N,
                    initialContributionRoot:
                        earlierProof.publicOutput.initialContributionRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextContributionRoot: nextContributionRoot,
                    nextProcessRoot: nextProcessRoot,
                    keyIndex: keyIndex,
                    encryptionHashes: encryptionHashes,
                    processedActions: processedActions,
                });
            },
        },
    },
});

export class FinalizeRound2Proof extends ZkProgram.Proof(FinalizeRound2) {}

export class Round2Contract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing members' contributions
     */
    @state(Field) contributionRoot = State<Field>();

    /**
     * @description MT storing members' encryption hashes
     */
    @state(Field) encryptionRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    /**
     * @description MT storing actions' rollup state
     */
    @state(Field) rollupRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.ROLLUPED]: Field,
        [EventEnum.PROCESSED]: ProcessedActions,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.contributionRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.encryptionRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
        this.rollupRoot.set(EMPTY_ACTION_MT().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
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
    contribute(
        keyId: Field,
        proof: BatchEncryptionProof,
        committee: ZkAppRef,
        round1: ZkAppRef,
        memberWitness: CommitteeFullWitness,
        publicKeysWitness: Level1Witness
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
            Field(ZkAppEnum.COMMITTEE)
        );

        // Verify Round1Contract address
        verifyZkApp(
            Round2Contract.name,
            round1,
            zkAppRoot,
            Field(ZkAppEnum.ROUND1)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const round1Contract = new Round1Contract(round1.address);

        // Verify encryption proof
        proof.verify();

        // Verify committee member - FIXME check if using this.sender is secure
        committeeContract.checkMember(
            new CommitteeMemberInput({
                address: this.sender,
                committeeId: committeeId,
                memberId: memberId,
                memberWitness: memberWitness,
            })
        );

        // Verify round 1 public keys (C0[])
        let keyIndex = calculateKeyIndex(committeeId, keyId);
        // TODO: Remove Provable.witness or adding assertion
        let publicKeysLeaf = Provable.witness(Field, () => {
            let publicKeysMT = EMPTY_LEVEL_2_TREE();
            for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
                let value = Provable.if(
                    Field(i).greaterThanOrEqual(
                        proof.publicInput.publicKeys.length
                    ),
                    Field(0),
                    PublicKeyArray.hash(
                        proof.publicInput.publicKeys.get(Field(i))
                    )
                );
                publicKeysMT.setLeaf(BigInt(i), value);
            }
            return publicKeysMT.getRoot();
        });
        round1Contract.publicKeyRoot
            .getAndRequireEquals()
            .assertEquals(publicKeysWitness.calculateRoot(publicKeysLeaf));
        keyIndex.assertEquals(publicKeysWitness.calculateIndex());

        // Create & dispatch action to DkgContract
        let action = new Action({
            committeeId: committeeId,
            keyId: keyId,
            memberId: memberId,
            contribution: new Round2Contribution({
                c: proof.publicInput.c,
                U: proof.publicInput.U,
            }),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Rollup Round 2 actions
     * @param proof Verification proof
     */
    @method
    rollup(proof: RollupRound2Proof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let rollupRoot = this.rollupRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        rollup(
            Round2Contract.name,
            proof.publicOutput,
            curActionState,
            rollupRoot,
            lastActionState
        );

        // Update state values
        this.rollupRoot.set(proof.publicOutput.newRollupRoot);

        // Emit events
        this.emitEvent(EventEnum.ROLLUPED, lastActionState);
    }

    /**
     * Finalize round 2 with N members' contribution
     * - Get current state values
     * - Verify zkApp references
     * - Verify finalize proof
     * - Verify committee config
     * - Verify key status
     * - Verify encryption witness
     * - Set new states
     * - Create & dispatch action to DkgContract
     * @param proof
     * @param encryptionWitness
     * @param committee
     * @param dkg
     * @param settingWitness
     * @param keyStatusWitness
     */
    @method
    finalize(
        proof: FinalizeRound2Proof,
        encryptionWitness: Level1Witness,
        committee: ZkAppRef,
        dkg: ZkAppRef,
        settingWitness: CommitteeLevel1Witness,
        keyStatusWitness: Level1Witness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let contributionRoot = this.contributionRoot.getAndRequireEquals();
        let encryptionRoot = this.encryptionRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        let committeeId = proof.publicInput.action.committeeId;
        let keyId = proof.publicInput.action.keyId;

        // Verify CommitteeContract address
        verifyZkApp(
            Round2Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );

        // Verify Round1Contract address
        verifyZkApp(Round2Contract.name, dkg, zkAppRoot, Field(ZkAppEnum.DKG));

        const committeeContract = new CommitteeContract(committee.address);
        const dkgContract = new DkgContract(dkg.address);

        // Verify proof
        proof.verify();
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
        committeeContract.checkConfig(
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
        // TODO: Remove Provable.witness or adding assertion
        let encryptionLeaf = Provable.witness(Field, () => {
            let encryptionHashesMT = EMPTY_LEVEL_2_TREE();
            for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
                let value = Provable.if(
                    Field(i).greaterThanOrEqual(
                        proof.publicOutput.encryptionHashes.length
                    ),
                    Field(0),
                    proof.publicOutput.encryptionHashes.get(Field(i))
                );
                encryptionHashesMT.setLeaf(BigInt(i), value);
            }
            return encryptionHashesMT.getRoot();
        });
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
            encryptionWitness.calculateRoot(encryptionLeaf)
        );
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        // Create & dispatch action to DkgContract
        dkgContract.publicAction(
            committeeId,
            keyId,
            Field(KeyUpdateEnum.FINALIZE_ROUND_2)
        );

        // Emit events
        this.emitEvent(
            EventEnum.PROCESSED,
            proof.publicOutput.processedActions
        );
    }
}
