import {
    Field,
    Group,
    Poseidon,
    Reducer,
    SelfProof,
    SmartContract,
    State,
    Struct,
    ZkProgram,
    method,
    state,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { CArray, Round1Contribution } from '../libs/Committee.js';
import {
    FullMTWitness as CommitteeFullWitness,
    Level1Witness as CommitteeLevel1Witness,
} from '../storages/CommitteeStorage.js';
import {
    FullMTWitness as DKGWitness,
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
    Level1Witness,
    calculateKeyIndex,
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
import { ZkAppEnum, ZkProgramEnum } from '../constants.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessedActions,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import { Rollup, processAction, rollup } from './Actions.js';
import { ErrorEnum, EventEnum } from './constants.js';

export class Action extends Struct({
    committeeId: Field,
    keyId: Field,
    memberId: Field,
    contribution: Round1Contribution,
}) {
    static empty(): Action {
        return new Action({
            committeeId: Field(0),
            keyId: Field(0),
            memberId: Field(0),
            contribution: Round1Contribution.empty(),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

export const RollupRound1 = Rollup(ZkProgramEnum.RollupRound1, Action);

export class RollupRound1Proof extends ZkProgram.Proof(RollupRound1) {}

export class FinalizeRound1Input extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class FinalizeRound1Output extends Struct({
    T: Field,
    N: Field,
    initialContributionRoot: Field,
    initialPublicKeyRoot: Field,
    initialProcessRoot: Field,
    nextContributionRoot: Field,
    nextPublicKeyRoot: Field,
    nextProcessRoot: Field,
    keyIndex: Field,
    publicKey: Group,
    processedActions: ProcessedActions,
}) {}

export const FinalizeRound1 = ZkProgram({
    name: ZkProgramEnum.FinalizeRound1,
    publicInput: FinalizeRound1Input,
    publicOutput: FinalizeRound1Output,
    methods: {
        firstStep: {
            privateInputs: [
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                Level1Witness,
                Level1Witness,
            ],
            method(
                input: FinalizeRound1Input,
                T: Field,
                N: Field,
                initialContributionRoot: Field,
                initialPublicKeyRoot: Field,
                initialProcessRoot: Field,
                keyIndex: Field,
                contributionWitness: Level1Witness,
                publicKeyWitness: Level1Witness
            ) {
                // Verify and update empty contribution level 2 MT
                initialContributionRoot.assertEquals(
                    contributionWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'firstStep',
                        ErrorEnum.R1_CONTRIBUTION_ROOT
                    )
                );

                keyIndex.assertEquals(
                    contributionWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'firstStep',
                        ErrorEnum.R1_CONTRIBUTION_INDEX_L1
                    )
                );

                let nextContributionRoot = contributionWitness.calculateRoot(
                    EMPTY_LEVEL_2_TREE().getRoot()
                );

                // Verify and update empty public key level 2 MT
                initialPublicKeyRoot.assertEquals(
                    publicKeyWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'firstStep',
                        ErrorEnum.ENC_PUBKEY_ROOT
                    )
                );
                keyIndex.assertEquals(
                    publicKeyWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'firstStep',
                        ErrorEnum.ENCRYPTION_INDEX_L1
                    )
                );

                let nextPublicKeyRoot = publicKeyWitness.calculateRoot(
                    EMPTY_LEVEL_2_TREE().getRoot()
                );

                return new FinalizeRound1Output({
                    T: T,
                    N: N,
                    initialContributionRoot: initialContributionRoot,
                    initialPublicKeyRoot: initialPublicKeyRoot,
                    initialProcessRoot: initialProcessRoot,
                    nextContributionRoot: nextContributionRoot,
                    nextPublicKeyRoot: nextPublicKeyRoot,
                    nextProcessRoot: initialProcessRoot,
                    keyIndex: keyIndex,
                    publicKey: Group.zero,
                    processedActions: new ProcessedActions(),
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<FinalizeRound1Input, FinalizeRound1Output>,
                DKGWitness,
                DKGWitness,
                ActionWitness,
            ],
            method(
                input: FinalizeRound1Input,
                earlierProof: SelfProof<
                    FinalizeRound1Input,
                    FinalizeRound1Output
                >,
                contributionWitness: DKGWitness,
                publicKeyWitness: DKGWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();
                input.action.contribution.C.length.assertEquals(
                    earlierProof.publicOutput.T,
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.R1_CONTRIBUTION_VALUE
                    )
                );

                // Check if the actions have the same keyIndex
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                keyIndex.assertEquals(
                    earlierProof.publicOutput.keyIndex,
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.R1_CONTRIBUTION_INDEX_INDEX
                    )
                );

                // Check if this committee member has contributed yet
                earlierProof.publicOutput.nextContributionRoot.assertEquals(
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.R1_CONTRIBUTION_ROOT
                    )
                );
                keyIndex.assertEquals(
                    contributionWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.R1_CONTRIBUTION_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.R1_CONTRIBUTION_INDEX_L2
                    )
                );

                // Compute new contribution root
                let nextContributionRoot =
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(
                            input.action.contribution.hash()
                        )
                    );

                // Check if this member's public key has not been registered
                earlierProof.publicOutput.nextPublicKeyRoot.assertEquals(
                    publicKeyWitness.level1.calculateRoot(
                        publicKeyWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.ENC_PUBKEY_ROOT
                    )
                );
                keyIndex.assertEquals(
                    publicKeyWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.ENC_PUBKEY_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    publicKeyWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        'nextStep',
                        ErrorEnum.ENC_PUBKEY_INDEX_L2
                    )
                );

                // Compute new public key root
                let memberPublicKey = input.action.contribution.C.values[0];
                let nextPublicKeyRoot = publicKeyWitness.level1.calculateRoot(
                    publicKeyWitness.level2.calculateRoot(
                        Poseidon.hash(memberPublicKey.toFields())
                    )
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
                    FinalizeRound1.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeRound1Output({
                    T: earlierProof.publicOutput.T,
                    N: earlierProof.publicOutput.N,
                    initialContributionRoot:
                        earlierProof.publicOutput.initialContributionRoot,
                    initialPublicKeyRoot:
                        earlierProof.publicOutput.initialPublicKeyRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextContributionRoot: nextContributionRoot,
                    nextPublicKeyRoot: nextPublicKeyRoot,
                    nextProcessRoot: nextProcessRoot,
                    keyIndex: keyIndex,
                    publicKey:
                        earlierProof.publicOutput.publicKey.add(
                            memberPublicKey
                        ),
                    processedActions: processedActions,
                });
            },
        },
    },
});

export class FinalizeRound1Proof extends ZkProgram.Proof(FinalizeRound1) {}

export class Round1Contract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing members' contributions
     */
    @state(Field) contributionRoot = State<Field>();

    /**
     * @description MT storing members' encryption public keys
     */
    @state(Field) publicKeyRoot = State<Field>();

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
        this.publicKeyRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.actionState.set(Reducer.initialActionState);
        this.rollupRoot.set(EMPTY_ACTION_MT().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    /**
     * Submit round 1 contribution for key generation
     * @param keyId Committee's key Id
     * @param C Contribution value: Array of group points
     * @param committee Reference to Committee Contract
     * @param memberWitness Witness for proof of committee's member
     */
    @method
    contribute(
        keyId: Field,
        C: CArray,
        committee: ZkAppRef,
        memberWitness: CommitteeFullWitness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify CommitteeContract address
        verifyZkApp(
            Round1Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );

        const committeeContract = new CommitteeContract(committee.address);

        // Verify committee member - FIXME check if using this.sender is secure
        committeeContract.checkMember(
            new CommitteeMemberInput({
                address: this.sender,
                committeeId: committeeId,
                memberId: memberId,
                memberWitness: memberWitness,
            })
        );

        // Create & dispatch action to DkgContract
        let action = new Action({
            committeeId: committeeId,
            keyId: keyId,
            memberId: memberId,
            contribution: new Round1Contribution({
                C: C,
            }),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Rollup Round 1 actions
     * @param proof Verification proof
     */
    @method
    rollup(proof: RollupRound1Proof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let rollupRoot = this.rollupRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        rollup(
            Round1Contract.name,
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
     * Finalize round 1 with N members' contribution
     * @param proof Verification proof
     * @param committee Reference to Committee Contract
     * @param dkg Reference to Dkg Contract
     * @param settingWitness Witness for proof of committee's config
     * @param keyStatusWitness Witness for proof of key status
     */
    @method
    finalize(
        proof: FinalizeRound1Proof,
        committee: ZkAppRef,
        dkg: ZkAppRef,
        settingWitness: CommitteeLevel1Witness,
        keyStatusWitness: Level1Witness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let contributionRoot = this.contributionRoot.getAndRequireEquals();
        let publicKeyRoot = this.publicKeyRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        // Verify Committee Contract address
        verifyZkApp(
            Round1Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );

        // Verify Dkg Contract address
        verifyZkApp(Round1Contract.name, dkg, zkAppRoot, Field(ZkAppEnum.DKG));

        const committeeContract = new CommitteeContract(committee.address);
        const dkgContract = new DkgContract(dkg.address);

        // Verify finalize proof
        proof.verify();
        proof.publicOutput.processedActions.length.assertEquals(
            proof.publicOutput.N,
            Utils.buildAssertMessage(
                Round1Contract.name,
                'finalize',
                ErrorEnum.R1_CONTRIBUTION_THRESHOLD
            )
        );
        proof.publicOutput.initialContributionRoot.assertEquals(
            contributionRoot,
            Utils.buildAssertMessage(
                Round1Contract.name,
                'finalize',
                ErrorEnum.R1_CONTRIBUTION_ROOT
            )
        );
        proof.publicOutput.initialPublicKeyRoot.assertEquals(
            publicKeyRoot,
            Utils.buildAssertMessage(
                Round1Contract.name,
                'finalize',
                ErrorEnum.ENC_PUBKEY_INDEX_L1
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                Round1Contract.name,
                'finalize',
                ErrorEnum.PROCESS_ROOT
            )
        );

        // Verify committee config
        committeeContract.checkConfig(
            new CommitteeConfigInput({
                N: proof.publicOutput.N,
                T: proof.publicOutput.T,
                committeeId: proof.publicInput.action.committeeId,
                settingWitness: settingWitness,
            })
        );

        // Verify key status
        dkgContract.verifyKeyStatus(
            new KeyStatusInput({
                committeeId: proof.publicInput.action.committeeId,
                keyId: proof.publicInput.action.keyId,
                status: Field(KeyStatus.ROUND_1_CONTRIBUTION),
                witness: keyStatusWitness,
            })
        );

        // Set new states
        this.contributionRoot.set(proof.publicOutput.nextContributionRoot);
        this.publicKeyRoot.set(proof.publicOutput.nextPublicKeyRoot);
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        // Create & dispatch action to DkgContract
        dkgContract.publicAction(
            proof.publicInput.action.committeeId,
            proof.publicInput.action.keyId,
            Field(KeyUpdateEnum.FINALIZE_ROUND_1)
        );

        // Emit events
        this.emitEvent(
            EventEnum.PROCESSED,
            proof.publicOutput.processedActions
        );
    }
}
