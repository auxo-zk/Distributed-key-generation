import {
    Field,
    Group,
    Poseidon,
    Reducer,
    SelfProof,
    SmartContract,
    State,
    Struct,
    UInt8,
    ZkProgram,
    method,
    state,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { CArray, Round1Contribution } from '../libs/Committee.js';
import {
    CommitteeWitness,
    CommitteeLevel1Witness,
} from '../storages/CommitteeStorage.js';
import {
    DKGWitness,
    DKG_LEVEL_1_TREE,
    DKG_LEVEL_2_TREE,
    DkgLevel1Witness,
    ProcessedContributions,
    calculateKeyIndex,
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
import { INSTANCE_LIMITS } from '../constants.js';
import {
    ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
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
    RollupWitness,
    calculateActionIndex,
} from '../storages/RollupStorage.js';

export {
    Action as Round1Action,
    FinalizeRound1Input,
    FinalizeRound1Output,
    FinalizeRound1,
    FinalizeRound1Proof,
    Round1Contract,
};

class Action
    extends Struct({
        committeeId: Field,
        keyId: Field,
        memberId: Field,
        contribution: Round1Contribution,
    })
    implements ZkAppAction
{
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

class FinalizeRound1Input extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

class FinalizeRound1Output extends Struct({
    rollupRoot: Field,
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
    processedActions: ProcessedContributions,
}) {}

const FinalizeRound1 = ZkProgram({
    name: ZkProgramEnum.FinalizeRound1,
    publicInput: FinalizeRound1Input,
    publicOutput: FinalizeRound1Output,
    methods: {
        init: {
            privateInputs: [
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                DkgLevel1Witness,
                DkgLevel1Witness,
            ],
            method(
                input: FinalizeRound1Input,
                rollupRoot: Field,
                T: Field,
                N: Field,
                initialContributionRoot: Field,
                initialPublicKeyRoot: Field,
                initialProcessRoot: Field,
                keyIndex: Field,
                contributionWitness: DkgLevel1Witness,
                publicKeyWitness: DkgLevel1Witness
            ) {
                // Verify and update empty contribution level 2 MT
                initialContributionRoot.assertEquals(
                    contributionWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.init.name,
                        ErrorEnum.R1_CONTRIBUTION_ROOT
                    )
                );

                keyIndex.assertEquals(
                    contributionWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.init.name,
                        ErrorEnum.R1_CONTRIBUTION_INDEX_L1
                    )
                );

                let nextContributionRoot = contributionWitness.calculateRoot(
                    DKG_LEVEL_2_TREE().getRoot()
                );

                // Verify and update empty public key level 2 MT
                initialPublicKeyRoot.assertEquals(
                    publicKeyWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.init.name,
                        ErrorEnum.ENC_PUBKEY_ROOT
                    )
                );
                keyIndex.assertEquals(
                    publicKeyWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.init.name,
                        ErrorEnum.ENC_PUBKEY_INDEX_L1
                    )
                );

                let nextPublicKeyRoot = publicKeyWitness.calculateRoot(
                    DKG_LEVEL_2_TREE().getRoot()
                );

                return new FinalizeRound1Output({
                    rollupRoot: rollupRoot,
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
                    processedActions: new ProcessedContributions(),
                });
            },
        },
        contribute: {
            privateInputs: [
                SelfProof<FinalizeRound1Input, FinalizeRound1Output>,
                DKGWitness,
                DKGWitness,
                RollupWitness,
                ProcessWitness,
            ],
            method(
                input: FinalizeRound1Input,
                earlierProof: SelfProof<
                    FinalizeRound1Input,
                    FinalizeRound1Output
                >,
                contributionWitness: DKGWitness,
                publicKeyWitness: DKGWitness,
                rollupWitness: RollupWitness,
                processWitness: ProcessWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();
                input.action.contribution.C.length.assertEquals(
                    earlierProof.publicOutput.T,
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
                        ErrorEnum.R1_CONTRIBUTION_VALUE
                    )
                );

                // Verify if the actions have the same keyIndex
                let keyIndex = calculateKeyIndex(
                    input.action.committeeId,
                    input.action.keyId
                );
                keyIndex.assertEquals(
                    earlierProof.publicOutput.keyIndex,
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
                        ErrorEnum.R1_CONTRIBUTION_KEY_INDEX
                    )
                );

                // Verify if this committee member has contributed yet
                earlierProof.publicOutput.nextContributionRoot.assertEquals(
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
                        ErrorEnum.R1_CONTRIBUTION_ROOT
                    )
                );
                keyIndex.assertEquals(
                    contributionWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
                        ErrorEnum.R1_CONTRIBUTION_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
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

                // Verify if this member's public key has not been registered
                earlierProof.publicOutput.nextPublicKeyRoot.assertEquals(
                    publicKeyWitness.level1.calculateRoot(
                        publicKeyWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
                        ErrorEnum.ENC_PUBKEY_ROOT
                    )
                );
                keyIndex.assertEquals(
                    publicKeyWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
                        ErrorEnum.ENC_PUBKEY_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    publicKeyWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeRound1.name,
                        FinalizeRound1.contribute.name,
                        ErrorEnum.ENC_PUBKEY_INDEX_L2
                    )
                );

                // Compute new public key root
                let memberPublicKey = input.action.contribution.C.get(Field(0));
                let nextPublicKeyRoot = publicKeyWitness.level1.calculateRoot(
                    publicKeyWitness.level2.calculateRoot(
                        Poseidon.hash(memberPublicKey.toFields())
                    )
                );

                // Verify action is rolluped
                let actionIndex = calculateActionIndex(
                    Field(ZkAppIndex.ROUND1),
                    input.actionId
                );
                verifyRollup(
                    FinalizeRound1.name,
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
                    FinalizeRound1.name,
                    input.actionId,
                    UInt8.from(0),
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeRound1Output({
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
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

class FinalizeRound1Proof extends ZkProgram.Proof(FinalizeRound1) {}

class Round1Contract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     * @see AddressStorage for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing members' contributions
     * @see Round1ContributionStorage for off-chain storage implementation
     */
    @state(Field) contributionRoot = State<Field>();

    /**
     * @description MT storing members' encryption public keys
     * @see PublicKeyStorage for off-chain storage implementation
     */
    @state(Field) publicKeyRoot = State<Field>();

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
        this.publicKeyRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.processRoot.set(PROCESS_MT().getRoot());
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
        memberWitness: CommitteeWitness,
        committee: ZkAppRef,
        rollup: ZkAppRef,
        selfRef: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify Committee Contract address
        verifyZkApp(
            Round1Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            Round1Contract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.contribute.name,
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Verify committee member
        Utils.requireSignature(this.sender);
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address: this.sender,
                committeeId: committeeId,
                memberId: memberId,
                memberWitness: memberWitness,
            })
        );

        // Create & dispatch action
        let action = new Action({
            committeeId: committeeId,
            keyId: keyId,
            memberId: memberId,
            contribution: new Round1Contribution({
                C: C,
            }),
        });
        this.reducer.dispatch(action);

        // Record action for rollup
        selfRef.address.assertEquals(this.address);
        rollupContract.recordAction(action.hash(), selfRef);
    }

    /**
     * Finalize round 1 with N members' contribution
     * @param proof Verification proof
     * @param settingWitness Witness for proof of committee's config
     * @param keyStatusWitness Witness for proof of key status
     * @param committee Reference to Committee Contract
     * @param dkg Reference to Dkg Contract
     * @param rollup Reference to Rollup Contract
     * @param dkgRound1 Reference to this in Dkg Contract
     * @param dkgRollup Reference to Rollup Contract in Dkg Contract
     */
    @method
    finalize(
        proof: FinalizeRound1Proof,
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
        let publicKeyRoot = this.publicKeyRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        let committeeId = proof.publicInput.action.committeeId;
        let keyId = proof.publicInput.action.keyId;

        // Verify Committee Contract address
        verifyZkApp(
            Round1Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );

        // Verify Dkg Contract address
        verifyZkApp(Round1Contract.name, dkg, zkAppRoot, Field(ZkAppIndex.DKG));

        // Verify Rollup Contract address
        verifyZkApp(
            DkgContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const dkgContract = new DkgContract(dkg.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify finalize proof
        proof.verify();
        proof.publicOutput.rollupRoot.assertEquals(
            rollupContract.rollupRoot.getAndRequireEquals(),
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.finalize.name,
                ErrorEnum.ROLLUP_ROOT
            )
        );
        proof.publicOutput.initialContributionRoot.assertEquals(
            contributionRoot,
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.finalize.name,
                ErrorEnum.R1_CONTRIBUTION_ROOT
            )
        );
        proof.publicOutput.initialPublicKeyRoot.assertEquals(
            publicKeyRoot,
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.finalize.name,
                ErrorEnum.ENC_PUBKEY_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.finalize.name,
                ErrorEnum.PROCESS_ROOT
            )
        );
        proof.publicOutput.processedActions.length.assertEquals(
            proof.publicOutput.N,
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.finalize.name,
                ErrorEnum.R1_CONTRIBUTION_THRESHOLD
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
                status: Field(KeyStatus.ROUND_1_CONTRIBUTION),
                witness: keyStatusWitness,
            })
        );

        // Set new states
        this.contributionRoot.set(proof.publicOutput.nextContributionRoot);
        this.publicKeyRoot.set(proof.publicOutput.nextPublicKeyRoot);
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        // Create & dispatch action to DkgContract
        dkgContract.finalizeContributionRound(
            committeeId,
            keyId,
            Field(DkgActionEnum.FINALIZE_ROUND_1),
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

    /**
     * Verify enc public key of a committee's member
     * @param committeeId Committee Id
     * @param keyId Committee's key Id
     * @param memberId Committee's member Id
     * @param pubKey Enc public key
     * @param witness Witness for proof of enc public key
     */
    verifyEncPubKey(
        committeeId: Field,
        keyId: Field,
        memberId: Field,
        pubKey: Group,
        witness: DKGWitness
    ) {
        let keyIndex = calculateKeyIndex(committeeId, keyId);
        this.publicKeyRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.level1.calculateRoot(
                    witness.level2.calculateRoot(
                        Poseidon.hash(pubKey.toFields())
                    )
                ),
                Utils.buildAssertMessage(
                    Round1Contract.name,
                    Round1Contract.prototype.verifyEncPubKey.name,
                    ErrorEnum.ENC_PUBKEY_ROOT
                )
            );
        keyIndex.assertEquals(
            witness.level1.calculateIndex(),
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.verifyEncPubKey.name,
                ErrorEnum.ENC_PUBKEY_INDEX_L1
            )
        );
        memberId.assertEquals(
            witness.level2.calculateIndex(),
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.verifyEncPubKey.name,
                ErrorEnum.ENC_PUBKEY_INDEX_L2
            )
        );
    }

    /**
     * Verify enc public keys of committee's members
     * @param committeeId Committee Id
     * @param keyId Committee's key Id
     * @param leaf Root of enc public key MT
     * @param witness Witness for proof of level 1 MT
     */
    verifyEncPubKeys(
        committeeId: Field,
        keyId: Field,
        leaf: Field,
        witness: DkgLevel1Witness
    ) {
        let keyIndex = calculateKeyIndex(committeeId, keyId);
        this.publicKeyRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(leaf),
                Utils.buildAssertMessage(
                    Round1Contract.name,
                    Round1Contract.prototype.verifyEncPubKeys.name,
                    ErrorEnum.ENC_PUBKEY_ROOT
                )
            );
        keyIndex.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                Round1Contract.name,
                Round1Contract.prototype.verifyEncPubKeys.name,
                ErrorEnum.ENC_PUBKEY_INDEX_L1
            )
        );
    }
}
