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
import {
    EncryptionHashArray,
    PublicKeyArray,
    Round2Contribution,
} from '../libs/Committee.js';
import { updateActionState } from '../libs/utils.js';
import {
    FullMTWitness as CommitteeFullWitness,
    Level1Witness as CommitteeLevel1Witness,
} from './CommitteeStorage.js';
import {
    FullMTWitness as DKGWitness,
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
    Level1Witness,
} from './DKGStorage.js';
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
import {
    COMMITTEE_MAX_SIZE,
    INSTANCE_LIMITS,
    ZkAppEnum,
} from '../constants.js';
import {
    ActionStatus,
    EMPTY_ADDRESS_MT,
    EMPTY_REDUCE_MT,
    ReduceWitness,
    ZkAppRef,
} from './SharedStorage.js';

export enum EventEnum {
    CONTRIBUTIONS_REDUCED = 'contributions-reduced',
}

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

export class ReduceOutput extends Struct({
    initialReduceState: Field,
    newActionState: Field,
    newReduceState: Field,
}) {}

export const ReduceRound2 = ZkProgram({
    name: 'reduce-round-2-contribution',
    publicInput: Action,
    publicOutput: ReduceOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field],
            method(
                input: Action,
                initialReduceState: Field,
                initialActionState: Field
            ) {
                return new ReduceOutput({
                    initialReduceState: initialReduceState,
                    newActionState: initialActionState,
                    newReduceState: initialReduceState,
                });
            },
        },
        nextStep: {
            privateInputs: [SelfProof<Action, ReduceOutput>, ReduceWitness],
            method(
                input: Action,
                earlierProof: SelfProof<Action, ReduceOutput>,
                reduceWitness: ReduceWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Calculate corresponding action state
                let actionState = updateActionState(
                    earlierProof.publicOutput.newActionState,
                    [Action.toFields(input)]
                );

                // Check the non-existence of the action
                let [root, key] = reduceWitness.computeRootAndKey(
                    Field(ActionStatus.NOT_EXISTED)
                );
                root.assertEquals(earlierProof.publicOutput.newReduceState);
                key.assertEquals(actionState);

                // Check the new tree contains the reduced action
                [root] = reduceWitness.computeRootAndKey(
                    Field(ActionStatus.REDUCED)
                );

                return new ReduceOutput({
                    initialReduceState:
                        earlierProof.publicOutput.initialReduceState,
                    newActionState: actionState,
                    newReduceState: root,
                });
            },
        },
    },
});

export class ReduceRound2Proof extends ZkProgram.Proof(ReduceRound2) {}

export class Round2Input extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class Round2Output extends Struct({
    T: Field,
    N: Field,
    initialContributionRoot: Field,
    reduceStateRoot: Field,
    newContributionRoot: Field,
    keyIndex: Field,
    counter: Field,
    ecryptionHashes: EncryptionHashArray,
}) {}

/**
 * First step:
 * - Verify there is no recorded contribution for the request
 * - Record an empty level 2 tree
 *
 * Next steps:
 * - Verify earlier proof
 * - Verify contributions using the same keyIndex
 * - Verify the member's contribution witness
 * - Compute new contribution root
 * - Compute new encryption hash array
 * - Verify the action has been reduced
 */
export const FinalizeRound2 = ZkProgram({
    name: 'finalize-round-2',
    publicInput: Round2Input,
    publicOutput: Round2Output,
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
            // initialHashArray must be filled with Field(0) with correct length
            method(
                input: Round2Input,
                T: Field,
                N: Field,
                initialContributionRoot: Field,
                reduceStateRoot: Field,
                keyIndex: Field,
                initialEncryptionHashes: EncryptionHashArray,
                contributionWitness: Level1Witness
            ) {
                // Verify there is no recorded contribution for the request
                initialContributionRoot.assertEquals(
                    contributionWitness.calculateRoot(Field(0))
                );
                keyIndex.assertEquals(contributionWitness.calculateIndex());

                // Record an empty level 2 tree
                let newContributionRoot = contributionWitness.calculateRoot(
                    EMPTY_LEVEL_2_TREE().getRoot()
                );

                return new Round2Output({
                    T: T,
                    N: N,
                    initialContributionRoot: initialContributionRoot,
                    reduceStateRoot: reduceStateRoot,
                    newContributionRoot: newContributionRoot,
                    keyIndex: keyIndex,
                    counter: Field(0),
                    ecryptionHashes: initialEncryptionHashes,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<Round2Input, Round2Output>,
                DKGWitness,
                ReduceWitness,
            ],
            method(
                input: Round2Input,
                earlierProof: SelfProof<Round2Input, Round2Output>,
                contributionWitness: DKGWitness,
                reduceWitness: ReduceWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();
                input.action.memberId.assertEquals(
                    earlierProof.publicOutput.counter
                );
                input.action.contribution.c.length.assertEquals(
                    earlierProof.publicOutput.N
                );

                // Verify contributions using the same keyIndex
                let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
                    .mul(input.action.committeeId)
                    .add(input.action.keyId);
                keyIndex.assertEquals(earlierProof.publicOutput.keyIndex);

                // Verify the member's contribution witness
                earlierProof.publicOutput.newContributionRoot.assertEquals(
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(Field(0))
                    )
                );
                keyIndex.assertEquals(
                    contributionWitness.level1.calculateIndex()
                );
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex()
                );

                // Compute new contribution root
                let newContributionRoot =
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(
                            input.action.contribution.hash()
                        )
                    );

                // Compute new encryption hash array
                let encryptionHashes =
                    earlierProof.publicOutput.ecryptionHashes;
                for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
                    let hashChain = encryptionHashes.get(Field(i));
                    hashChain = Provable.if(
                        Field(i).greaterThanOrEqual(
                            earlierProof.publicOutput.ecryptionHashes.length
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

                // Verify the action has been reduced
                let actionState = updateActionState(input.previousActionState, [
                    Action.toFields(input.action),
                ]);
                let [reduceRoot, reduceIndex] = reduceWitness.computeRootAndKey(
                    Field(ActionStatus.REDUCED)
                );
                reduceRoot.assertEquals(
                    earlierProof.publicOutput.reduceStateRoot
                );
                reduceIndex.assertEquals(actionState);

                return new Round2Output({
                    T: earlierProof.publicOutput.T,
                    N: earlierProof.publicOutput.N,
                    initialContributionRoot:
                        earlierProof.publicOutput.initialContributionRoot,
                    reduceStateRoot: earlierProof.publicOutput.reduceStateRoot,
                    newContributionRoot: newContributionRoot,
                    keyIndex: keyIndex,
                    counter: earlierProof.publicOutput.counter.add(Field(1)),
                    ecryptionHashes: encryptionHashes,
                });
            },
        },
    },
});

export class FinalizeRound2Proof extends ZkProgram.Proof(FinalizeRound2) {}

export class Round2Contract extends SmartContract {
    reducer = Reducer({ actionType: Action });
    events = {
        [EventEnum.CONTRIBUTIONS_REDUCED]: Field,
    };

    @state(Field) zkApps = State<Field>();
    @state(Field) reduceState = State<Field>();
    @state(Field) contributions = State<Field>();
    @state(Field) encryptions = State<Field>();

    init() {
        super.init();
        this.zkApps.set(EMPTY_ADDRESS_MT().getRoot());
        this.reduceState.set(EMPTY_REDUCE_MT().getRoot());
        this.contributions.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.encryptions.set(EMPTY_LEVEL_1_TREE().getRoot());
    }

    /**
     * Submit round 2 contribution for key generation
     * - Verify zkApp references
     * - Verify encryption proof
     * - Verify committee member
     * - Verify round 1 public keys (C0[]])
     * - Create & dispatch action
     * @param committeeId
     * @param keyId
     * @param proof
     * @param committee
     * @param round1
     * @param memberWitness
     * @param publicKeysWitness
     */
    @method
    contribute(
        committeeId: Field,
        keyId: Field,
        proof: BatchEncryptionProof,
        committee: ZkAppRef,
        round1: ZkAppRef,
        memberWitness: CommitteeFullWitness,
        publicKeysWitness: Level1Witness
    ) {
        // Verify zkApp references
        let zkApps = this.zkApps.getAndRequireEquals();

        // CommitteeContract
        zkApps.assertEquals(
            committee.witness.calculateRoot(
                Poseidon.hash(committee.address.toFields())
            )
        );
        Field(ZkAppEnum.COMMITTEE).assertEquals(
            committee.witness.calculateIndex()
        );

        // Round1Contract
        zkApps.assertEquals(
            round1.witness.calculateRoot(
                Poseidon.hash(round1.address.toFields())
            )
        );

        const committeeContract = new CommitteeContract(committee.address);
        const round1Contract = new Round1Contract(round1.address);

        // Verify encryption proof
        proof.verify();

        // Verify committee member - FIXME check if using this.sender is secure
        let memberId = committeeContract.checkMember(
            new CommitteeMemberInput({
                address: this.sender,
                committeeId: committeeId,
                memberWitness: memberWitness,
            })
        );
        memberId.assertEquals(proof.publicInput.memberId);

        // Verify round 1 public keys (C0[]])
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
            .mul(committeeId)
            .add(keyId);
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
        round1Contract.publicKeys
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

    @method
    reduce(proof: ReduceRound2Proof) {
        // Get current state values
        let reduceState = this.reduceState.getAndRequireEquals();
        let actionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.initialReduceState.assertEquals(reduceState);
        proof.publicOutput.newActionState.assertEquals(actionState);

        // Set new states
        this.reduceState.set(proof.publicOutput.newReduceState);

        // Emit events
        this.emitEvent(EventEnum.CONTRIBUTIONS_REDUCED, actionState);
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
        let zkApps = this.zkApps.getAndRequireEquals();
        let contributions = this.contributions.getAndRequireEquals();
        let encryptions = this.encryptions.getAndRequireEquals();
        let reduceState = this.reduceState.getAndRequireEquals();

        // Verify zkApp references
        // CommitteeContract
        zkApps.assertEquals(
            committee.witness.calculateRoot(
                Poseidon.hash(committee.address.toFields())
            )
        );
        Field(ZkAppEnum.COMMITTEE).assertEquals(
            committee.witness.calculateIndex()
        );

        // DkgContract
        zkApps.assertEquals(
            dkg.witness.calculateRoot(Poseidon.hash(dkg.address.toFields()))
        );
        Field(ZkAppEnum.DKG).assertEquals(dkg.witness.calculateIndex());

        const committeeContract = new CommitteeContract(committee.address);
        const dkgContract = new DkgContract(dkg.address);

        // Verify proof
        proof.verify();
        proof.publicOutput.initialContributionRoot.assertEquals(contributions);
        proof.publicOutput.reduceStateRoot.assertEquals(reduceState);
        proof.publicOutput.counter.assertEquals(proof.publicOutput.N);

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
                        proof.publicOutput.ecryptionHashes.length
                    ),
                    Field(0),
                    proof.publicOutput.ecryptionHashes.get(Field(i))
                );
                encryptionHashesMT.setLeaf(BigInt(i), value);
            }
            return encryptionHashesMT.getRoot();
        });
        encryptions.assertEquals(encryptionWitness.calculateRoot(Field(0)));
        proof.publicOutput.keyIndex.assertEquals(
            encryptionWitness.calculateIndex()
        );

        // Set new states
        this.contributions.set(proof.publicOutput.newContributionRoot);
        this.encryptions.set(encryptionWitness.calculateRoot(encryptionLeaf));

        // Create & dispatch action to DkgContract
        dkgContract.publicAction(
            proof.publicInput.action.committeeId,
            proof.publicInput.action.keyId,
            Field(KeyUpdateEnum.FINALIZE_ROUND_2)
        );
    }
}
