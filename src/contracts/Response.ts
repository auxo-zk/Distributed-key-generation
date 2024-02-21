import {
    Field,
    Group,
    Poseidon,
    Provable,
    Reducer,
    Scalar,
    SelfProof,
    SmartContract,
    State,
    Struct,
    ZkProgram,
    method,
    state,
} from 'o1js';
import { ResponseContribution } from '../libs/Committee.js';
import { updateActionState } from '../libs/utils.js';
import {
    FullMTWitness as CommitteeFullWitness,
    Level1Witness as CommitteeLevel1Witness,
} from './CommitteeStorage.js';
import { FullMTWitness as DKGWitness, Level1Witness } from './DKGStorage.js';
import {
    FullMTWitness as RequestWitness,
    Level1Witness as RequestLevel1Witness,
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
} from './RequestStorage.js';
import {
    CommitteeConfigInput,
    CommitteeMemberInput,
    CommitteeContract,
} from './Committee.js';
import { DkgContract, KeyStatus, KeyStatusInput } from './DKG.js';
import { RequestContract, RequestVector, ResolveInput } from './Request.js';
import { BatchDecryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { Round2Contract } from './Round2.js';
import {
    COMMITTEE_MAX_SIZE,
    INSTANCE_LIMITS,
    REQUEST_MAX_SIZE,
    ZkAppEnum,
} from '../constants.js';
import {
    ActionStatus,
    EMPTY_ADDRESS_MT,
    EMPTY_REDUCE_MT,
    ReduceWitness,
    ZkAppRef,
} from './SharedStorage.js';
import { DArray, RArray } from '../libs/Requestor.js';

export enum EventEnum {
    CONTRIBUTIONS_REDUCED = 'contributions-reduced',
}

export class Action extends Struct({
    committeeId: Field,
    keyId: Field,
    memberId: Field,
    requestId: Field,
    contribution: ResponseContribution,
}) {
    static empty(): Action {
        return new Action({
            committeeId: Field(0),
            keyId: Field(0),
            memberId: Field(0),
            requestId: Field(0),
            contribution: ResponseContribution.empty(),
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

export const ReduceResponse = ZkProgram({
    name: 'reduce-response-contribution',
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

export class ReduceResponseProof extends ZkProgram.Proof(ReduceResponse) {}

export class ResponseInput extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class ResponseOutput extends Struct({
    T: Field,
    N: Field,
    initialContributionRoot: Field,
    reduceStateRoot: Field,
    newContributionRoot: Field,
    requestId: Field,
    D: RequestVector,
    counter: Field,
    indexList: Field,
}) {}

class LagrangeCoefficientMul extends Struct({
    mul2: Scalar,
    mul3: Scalar,
}) {}

/**
 * First step:
 * - Verify there is no recorded contribution for the request
 * - Record an empty level 2 tree
 *
 * Next steps:
 * - Verify earlier proof
 * - Verify contributions using the same requestId
 * - Verify the member's contribution witness
 * - Compute new contribution root
 * - Compute D values
 * - Verify the action has been reduced
 */
export const CompleteResponse = ZkProgram({
    name: 'complete-response',
    publicInput: ResponseInput,
    publicOutput: ResponseOutput,
    methods: {
        firstStep: {
            privateInputs: [
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                RequestLevel1Witness,
            ],
            method(
                input: ResponseInput,
                T: Field,
                N: Field,
                initialContributionRoot: Field,
                reduceStateRoot: Field,
                requestId: Field,
                requestDim: Field,
                indexList: Field,
                contributionWitness: RequestLevel1Witness
            ) {
                // Verify there is no recorded contribution for the request
                let [contributionRoot, contributionKey] =
                    contributionWitness.computeRootAndKey(Field(0));
                initialContributionRoot.assertEquals(contributionRoot);
                requestId.assertEquals(contributionKey);

                // Record an empty level 2 tree
                let newContributionRoot = contributionWitness.computeRootAndKey(
                    EMPTY_LEVEL_2_TREE().getRoot()
                )[0];

                // Initialize dynamic vector D
                let D = Provable.witness(
                    RequestVector,
                    () =>
                        new RequestVector(
                            [...Array(Number(requestDim)).keys()].map(
                                () => Group.zero
                            )
                        )
                );
                D.length.assertEquals(requestDim);
                for (let i = 0; i < REQUEST_MAX_SIZE; i++)
                    D.set(Field(i), Group.zero);

                return new ResponseOutput({
                    T: T,
                    N: N,
                    initialContributionRoot: initialContributionRoot,
                    reduceStateRoot: reduceStateRoot,
                    newContributionRoot: newContributionRoot,
                    requestId: requestId,
                    D: D,
                    counter: Field(0),
                    indexList: indexList,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<ResponseInput, ResponseOutput>,
                RequestWitness,
                ReduceWitness,
            ],
            method(
                input: ResponseInput,
                earlierProof: SelfProof<ResponseInput, ResponseOutput>,
                contributionWitness: RequestWitness,
                reduceWitness: ReduceWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify contributions using the same requestId
                input.action.requestId.assertEquals(
                    earlierProof.publicOutput.requestId
                );

                // Verify the member's contribution witness
                let [contributionRoot, contributionKey] =
                    contributionWitness.level1.computeRootAndKey(
                        contributionWitness.level2.calculateRoot(Field(0))
                    );
                earlierProof.publicOutput.newContributionRoot.assertEquals(
                    contributionRoot
                );
                input.action.requestId.assertEquals(contributionKey);
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex()
                );

                // Compute new contribution root
                let newContributionRoot =
                    contributionWitness.level1.computeRootAndKey(
                        contributionWitness.level2.calculateRoot(
                            input.action.contribution.hash()
                        )
                    )[0];

                // Compute Lagrange coefficient
                let lagrangeCoefficientMul = Provable.witness(
                    LagrangeCoefficientMul,
                    () => {
                        let result = Scalar.from(1n);
                        let indexI = input.action.memberId.add(1);
                        let T = Number(earlierProof.publicOutput.T.toBigInt());
                        for (let j = 0; j < T; j++) {
                            let indexJ = Field.fromBits(
                                earlierProof.publicOutput.indexList
                                    .toBits()
                                    .slice(6 * j, 6 * (j + 1))
                            ).add(1);
                            if (indexJ.equals(indexI).toBoolean()) continue;
                            result = result.mul(
                                Scalar.from(indexJ.toBigInt()).div(
                                    Scalar.from(indexJ.sub(indexI).toBigInt())
                                )
                            );
                        }
                        return new LagrangeCoefficientMul({
                            mul2: result.mul(Scalar.from(2n)),
                            mul3: result.mul(Scalar.from(3n)),
                        });
                    }
                );

                // Compute D values
                let D = earlierProof.publicOutput.D;
                for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
                    let Di = D.get(Field(i));
                    let di = input.action.contribution.D.get(Field(i));
                    di = Provable.if(
                        di
                            .equals(Group.zero)
                            .or(Field(i).greaterThanOrEqual(D.length)),
                        di,
                        di
                            .add(Group.generator)
                            .scale(lagrangeCoefficientMul.mul3)
                            .sub(
                                Group.generator.scale(
                                    lagrangeCoefficientMul.mul3
                                )
                            )
                            .sub(
                                di
                                    .add(Group.generator)
                                    .scale(lagrangeCoefficientMul.mul2)
                                    .sub(
                                        Group.generator.scale(
                                            lagrangeCoefficientMul.mul2
                                        )
                                    )
                            )
                    );
                    D.set(Field(i), Di.add(di));
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

                return new ResponseOutput({
                    T: earlierProof.publicOutput.T,
                    N: earlierProof.publicOutput.N,
                    initialContributionRoot:
                        earlierProof.publicOutput.initialContributionRoot,
                    reduceStateRoot: earlierProof.publicOutput.reduceStateRoot,
                    newContributionRoot: newContributionRoot,
                    requestId: input.action.requestId,
                    D: D,
                    counter: earlierProof.publicOutput.counter.add(Field(1)),
                    indexList: earlierProof.publicOutput.indexList,
                });
            },
        },
    },
});

export class CompleteResponseProof extends ZkProgram.Proof(CompleteResponse) {}

export class ResponseContract extends SmartContract {
    reducer = Reducer({ actionType: Action });
    events = {
        [EventEnum.CONTRIBUTIONS_REDUCED]: Field,
    };

    @state(Field) zkApps = State<Field>();
    @state(Field) reduceState = State<Field>();
    @state(Field) contributions = State<Field>();

    init() {
        super.init();
        this.zkApps.set(EMPTY_ADDRESS_MT().getRoot());
        this.reduceState.set(EMPTY_REDUCE_MT().getRoot());
        this.contributions.set(EMPTY_LEVEL_1_TREE().getRoot());
    }

    /**
     * Submit response contribution for key generation
     * - Verify zkApp references
     * - Verify decryption proof
     * - Verify committee member
     * - Verify round 1 public key (C0)
     * - Verify round 2 encryptions (hashes)
     * - Compute response
     * - Create & dispatch action to DkgContract
     * @param committeeId
     * @param keyId
     * @param requestId
     * @param decryptionProof
     * @param R
     * @param ski
     * @param committee
     * @param round1
     * @param round2
     * @param memberWitness
     * @param publicKeyWitness
     * @param encryptionWitness
     */
    @method
    contribute(
        committeeId: Field,
        keyId: Field,
        requestId: Field,
        decryptionProof: BatchDecryptionProof,
        R: RArray,
        ski: Scalar,
        committee: ZkAppRef,
        round1: ZkAppRef,
        round2: ZkAppRef,
        memberWitness: CommitteeFullWitness,
        publicKeyWitness: DKGWitness,
        encryptionWitness: DKGWitness
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

        // Round2Contract
        zkApps.assertEquals(
            round2.witness.calculateRoot(
                Poseidon.hash(round2.address.toFields())
            )
        );
        Field(ZkAppEnum.ROUND2).assertEquals(round2.witness.calculateIndex());

        const committeeContract = new CommitteeContract(committee.address);
        const round1Contract = new Round1Contract(round1.address);
        const round2Contract = new Round2Contract(round2.address);

        // Verify decryption proof
        decryptionProof.verify();

        // Verify committee member - FIXME check if using this.sender is secure
        let memberId = committeeContract.checkMember(
            new CommitteeMemberInput({
                address: this.sender,
                committeeId: committeeId,
                memberWitness: memberWitness,
            })
        );
        memberId.assertEquals(decryptionProof.publicInput.memberId);

        // Verify round 1 public key (C0)
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
            .mul(committeeId)
            .add(keyId);
        round1Contract.publicKeys
            .getAndRequireEquals()
            .assertEquals(
                publicKeyWitness.level1.calculateRoot(
                    publicKeyWitness.level2.calculateRoot(
                        Poseidon.hash(
                            decryptionProof.publicInput.publicKey.toFields()
                        )
                    )
                )
            );
        keyIndex.assertEquals(publicKeyWitness.level1.calculateIndex());
        memberId.assertEquals(publicKeyWitness.level2.calculateIndex());

        // Verify round 2 encryptions (hashes)
        let encryptionHashChain = Field(0);
        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
            encryptionHashChain = Provable.if(
                Field(i).greaterThanOrEqual(
                    decryptionProof.publicInput.c.length
                ),
                encryptionHashChain,
                Poseidon.hash(
                    [
                        encryptionHashChain,
                        decryptionProof.publicInput.c.get(Field(i)).toFields(),
                        decryptionProof.publicInput.U.get(Field(i)).toFields(),
                    ].flat()
                )
            );
        }
        round2Contract.encryptions
            .getAndRequireEquals()
            .assertEquals(
                encryptionWitness.level1.calculateRoot(
                    encryptionWitness.level2.calculateRoot(encryptionHashChain)
                )
            );
        keyIndex.assertEquals(encryptionWitness.level1.calculateIndex());
        memberId.assertEquals(encryptionWitness.level2.calculateIndex());

        // Compute response
        let D = Provable.witness(DArray, () => {
            return new DArray(R.values.slice(0, Number(R.length)));
        });
        D.length.assertEquals(R.length);
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
            let Ri = R.get(Field(i));
            Group.generator.scale(ski).equals(decryptionProof.publicOutput);
            D.set(
                Field(i),
                Provable.if(
                    Field(i).greaterThanOrEqual(R.length),
                    Ri,
                    Ri.add(Group.generator)
                        .scale(ski)
                        .sub(Group.generator.scale(ski))
                )
            );
        }

        // Create & dispatch action to DkgContract
        let action = new Action({
            committeeId: committeeId,
            keyId: keyId,
            memberId: memberId,
            requestId: requestId,
            contribution: new ResponseContribution({
                D: D,
            }),
        });
        this.reducer.dispatch(action);
    }

    @method
    reduce(proof: ReduceResponseProof) {
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
     * Complete response with T members' contribution
     * - Get current state values
     * - Verify zkApp references
     * - Verify response proof
     * - Verify committee config
     * - Verify key status
     * - Set new states
     *
     * @param proof
     * @param committee
     * @param dkg
     * @param settingWitness
     * @param keyStatusWitness
     */
    @method
    complete(
        proof: CompleteResponseProof,
        committee: ZkAppRef,
        dkg: ZkAppRef,
        request: ZkAppRef,
        settingWitness: CommitteeLevel1Witness,
        keyStatusWitness: Level1Witness
    ) {
        // Get current state values
        let zkApps = this.zkApps.getAndRequireEquals();
        let contributions = this.contributions.getAndRequireEquals();
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

        // RequestContract
        zkApps.assertEquals(
            request.witness.calculateRoot(
                Poseidon.hash(request.address.toFields())
            )
        );
        Field(ZkAppEnum.REQUEST).assertEquals(request.witness.calculateIndex());

        const committeeContract = new CommitteeContract(committee.address);
        const dkgContract = new DkgContract(dkg.address);

        // Verify response proof
        proof.verify();
        proof.publicOutput.initialContributionRoot.assertEquals(contributions);
        proof.publicOutput.reduceStateRoot.assertEquals(reduceState);
        proof.publicOutput.counter.assertEquals(proof.publicOutput.T);

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
                status: Field(KeyStatus.ACTIVE),
                witness: keyStatusWitness,
            })
        );

        // Set new states
        this.contributions.set(proof.publicOutput.newContributionRoot);

        // Create & dispatch action to RequestContract
        const requestContract = new RequestContract(request.address);
        requestContract.resolveRequest(
            new ResolveInput({
                requestId: proof.publicOutput.requestId,
                D: proof.publicOutput.D,
            })
        );
    }

    // TODO - Distribute earned fee
}
