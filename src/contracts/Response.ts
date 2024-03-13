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
import { Utils } from '@auxo-dev/auxo-libs';
import { ResponseContribution } from '../libs/Committee.js';
import {
    FullMTWitness as CommitteeFullWitness,
    Level1Witness as CommitteeLevel1Witness,
} from '../storages/CommitteeStorage.js';
import {
    FullMTWitness as DKGWitness,
    Level1Witness,
    calculateKeyIndex,
} from '../storages/DKGStorage.js';
import {
    FullMTWitness as RequestWitness,
    Level1Witness as RequestLevel1Witness,
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_2_TREE,
} from '../storages/RequestStorage.js';
import {
    CommitteeConfigInput,
    CommitteeMemberInput,
    CommitteeContract,
} from './Committee.js';
import { BatchDecryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { Round2Contract } from './Round2.js';
import { INSTANCE_LIMITS, ZkAppEnum, ZkProgramEnum } from '../constants.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessedContributions,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import { DArray, RArray, RequestVector } from '../libs/Requester.js';
import { ErrorEnum, EventEnum, ZkAppAction } from './constants.js';
import { RollupContract, processAction, verifyRollup } from './Rollup.js';
import { RequestContract } from './Request.js';
import {
    RollupWitness,
    calculateActionIndex,
} from '../storages/RollupStorage.js';

export {
    Action as ResponseAction,
    FinalizeResponseInput,
    FinalizeResponse,
    FinalizeResponseProof,
    ResponseContract,
};

class Action
    extends Struct({
        committeeId: Field,
        keyId: Field,
        memberId: Field,
        requestId: Field,
        contribution: ResponseContribution,
    })
    implements ZkAppAction
{
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

class FinalizeResponseInput extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

class FinalizeResponseOutput extends Struct({
    rollupRoot: Field,
    T: Field,
    N: Field,
    initialContributionRoot: Field,
    initialProcessRoot: Field,
    nextContributionRoot: Field,
    nextProcessRoot: Field,
    requestId: Field,
    D: RequestVector,
    indexList: Field,
    processedActions: ProcessedContributions,
}) {}

class LagrangeCoefficientMul extends Struct({
    mul2: Scalar,
    mul3: Scalar,
}) {}

const FinalizeResponse = ZkProgram({
    name: ZkProgramEnum.FinalizeResponse,
    publicInput: FinalizeResponseInput,
    publicOutput: FinalizeResponseOutput,
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
                Field,
                RequestLevel1Witness,
            ],
            method(
                input: FinalizeResponseInput,
                rollupRoot: Field,
                T: Field,
                N: Field,
                initialContributionRoot: Field,
                initialProcessRoot: Field,
                requestId: Field,
                requestDim: Field,
                indexList: Field,
                contributionWitness: RequestLevel1Witness
            ) {
                // Verify there is no recorded contribution for the request
                initialContributionRoot.assertEquals(
                    contributionWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        FinalizeResponse.init.name,
                        ErrorEnum.RES_CONTRIBUTION_ROOT
                    )
                );
                requestId.assertEquals(
                    contributionWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        FinalizeResponse.init.name,
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L1
                    )
                );

                // Record an empty level 2 tree
                let nextContributionRoot = contributionWitness.calculateRoot(
                    EMPTY_LEVEL_2_TREE().getRoot()
                );

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
                D.length.assertEquals(
                    requestDim,
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        FinalizeResponse.init.name,
                        ErrorEnum.RES_CONTRIBUTION_DIMENSION
                    )
                );
                for (let i = 0; i < INSTANCE_LIMITS.DIMENSION; i++)
                    D.set(Field(i), Group.zero);

                return new FinalizeResponseOutput({
                    rollupRoot,
                    T,
                    N,
                    initialContributionRoot,
                    initialProcessRoot,
                    nextContributionRoot,
                    nextProcessRoot: initialProcessRoot,
                    requestId,
                    D,
                    indexList,
                    processedActions: new ProcessedContributions(),
                });
            },
        },
        contribute: {
            privateInputs: [
                SelfProof<FinalizeResponseInput, FinalizeResponseOutput>,
                RequestWitness,
                RollupWitness,
                ActionWitness,
            ],
            method(
                input: FinalizeResponseInput,
                earlierProof: SelfProof<
                    FinalizeResponseInput,
                    FinalizeResponseOutput
                >,
                contributionWitness: RequestWitness,
                rollupWitness: RollupWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify contributionRoot using the same requestId
                input.action.requestId.assertEquals(
                    earlierProof.publicOutput.requestId,
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        FinalizeResponse.contribute.name,
                        ErrorEnum.REQUEST_ID
                    )
                );

                // Verify the member's contribution witness
                earlierProof.publicOutput.nextContributionRoot.assertEquals(
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        FinalizeResponse.contribute.name,
                        ErrorEnum.RES_CONTRIBUTION_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    contributionWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        FinalizeResponse.contribute.name,
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        FinalizeResponse.contribute.name,
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L2
                    )
                );

                // Compute new contribution root
                let nextContributionRoot =
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(
                            input.action.contribution.hash()
                        )
                    );

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
                for (let i = 0; i < INSTANCE_LIMITS.DIMENSION; i++) {
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

                // Verify action is rolluped
                let actionIndex = calculateActionIndex(
                    Field(ZkAppEnum.RESPONSE),
                    input.actionId
                );
                verifyRollup(
                    FinalizeResponse.name,
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
                    FinalizeResponse.name,
                    input.actionId,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeResponseOutput({
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
                    T: earlierProof.publicOutput.T,
                    N: earlierProof.publicOutput.N,
                    initialContributionRoot:
                        earlierProof.publicOutput.initialContributionRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextContributionRoot: nextContributionRoot,
                    nextProcessRoot: nextProcessRoot,
                    requestId: input.action.requestId,
                    D: D,
                    indexList: earlierProof.publicOutput.indexList,
                    processedActions: processedActions,
                });
            },
        },
    },
});

class FinalizeResponseProof extends ZkProgram.Proof(FinalizeResponse) {}

class ResponseContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing members' contributions
     */
    @state(Field) contributionRoot = State<Field>();

    /**
     * @description MT storing members' contributions
     */
    @state(Field) finalizedDRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.ROLLUPED]: Field,
        [EventEnum.PROCESSED]: ProcessedContributions,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.contributionRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.finalizedDRoot.set(EMPTY_LEVEL_1_TREE().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    /**
     * Submit response contribution for key usage request
     * @param keyId Committee's key Id
     * @param requestId Request Id
     * @param proof Decryption proof
     * @param R Commitment of random inputs
     * @param ski Partial secret for decryption
     * @param committee Reference to Committee Contract
     * @param round1 Reference to Round 1 Contract
     * @param round2 Reference to Round 2 Contract
     * @param memberWitness Witness for proof of committee membership
     * @param publicKeyWitness Witness for proof of encryption public key
     * @param encryptionWitness Witness for encryption hashes
     */
    @method
    contribute(
        keyId: Field,
        requestId: Field,
        proof: BatchDecryptionProof,
        R: RArray,
        ski: Scalar,
        memberWitness: CommitteeFullWitness,
        publicKeyWitness: DKGWitness,
        encryptionWitness: DKGWitness,
        keyIndexWitness: RequestLevel1Witness,
        committee: ZkAppRef,
        round1: ZkAppRef,
        round2: ZkAppRef,
        request: ZkAppRef,
        rollup: ZkAppRef,
        selfRef: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify CommitteeContract address
        verifyZkApp(
            ResponseContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );

        // Verify Round1Contract address
        verifyZkApp(
            ResponseContract.name,
            round1,
            zkAppRoot,
            Field(ZkAppEnum.ROUND1)
        );

        // Verify Round2Contract address
        verifyZkApp(
            ResponseContract.name,
            round2,
            zkAppRoot,
            Field(ZkAppEnum.ROUND2)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            ResponseContract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            ResponseContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const round1Contract = new Round1Contract(round1.address);
        const round2Contract = new Round2Contract(round2.address);
        const requestContract = new RequestContract(round2.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify decryption proof
        proof.verify();

        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                ResponseContract.name,
                ResponseContract.prototype.contribute.name,
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

        // Verify round 1 public key (C0)
        round1Contract.verifyEncPubKey(
            committeeId,
            keyId,
            memberId,
            proof.publicInput.publicKey,
            publicKeyWitness
        );

        // Verify round 2 encryptions (hashes)
        let encryptionHashChain = Field(0);
        for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
            encryptionHashChain = Provable.if(
                Field(i).greaterThanOrEqual(proof.publicInput.c.length),
                encryptionHashChain,
                Poseidon.hash(
                    [
                        encryptionHashChain,
                        proof.publicInput.c.get(Field(i)).toFields(),
                        proof.publicInput.U.get(Field(i)).toFields(),
                    ].flat()
                )
            );
        }
        round2Contract.verifyEncHashChain(
            committeeId,
            keyId,
            memberId,
            encryptionHashChain,
            encryptionWitness
        );

        // Verify request Id
        requestContract.verifyKeyIndex(
            requestId,
            calculateKeyIndex(committeeId, keyId),
            keyIndexWitness
        );

        // Compute response
        let D = Provable.witness(DArray, () => {
            return new DArray(R.values.slice(0, Number(R.length)));
        });
        D.length.assertEquals(
            R.length,
            Utils.buildAssertMessage(
                ResponseContract.name,
                ResponseContract.prototype.contribute.name,
                ErrorEnum.RES_CONTRIBUTION_DIMENSION
            )
        );
        for (let i = 0; i < INSTANCE_LIMITS.DIMENSION; i++) {
            let Ri = R.get(Field(i));
            Group.generator.scale(ski).equals(proof.publicOutput);
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
            committeeId,
            keyId,
            memberId,
            requestId,
            contribution: new ResponseContribution({
                D: D,
            }),
        });
        this.reducer.dispatch(action);

        // Record action for rollup
        selfRef.address.assertEquals(this.address);
        rollupContract.recordAction(action.hash(), selfRef);
    }

    /**
     * Finalize response with T members' contribution
     * @param proof Verification proof
     * @param committee Reference to Committee Contract
     * @param dkg Reference to Dkg Contract
     * @param settingWitness Witness for proof of committee's setting
     * @param keyStatusWitness Witness for proof of threshold
     */
    @method
    finalize(
        proof: FinalizeResponseProof,
        finalizedDWitness: Level1Witness,
        settingWitness: CommitteeLevel1Witness,
        committee: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let contributionRoot = this.contributionRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();
        let finalizedDRoot = this.finalizedDRoot.getAndRequireEquals();

        // Verify CommitteeContract address
        verifyZkApp(
            ResponseContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            ResponseContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify response proof
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
                ResponseContract.name,
                ResponseContract.prototype.finalize.name,
                ErrorEnum.RES_CONTRIBUTION_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                ResponseContract.name,
                ResponseContract.prototype.finalize.name,
                ErrorEnum.PROCESS_ROOT
            )
        );
        proof.publicOutput.processedActions.length.assertEquals(
            proof.publicOutput.T,
            Utils.buildAssertMessage(
                ResponseContract.name,
                ResponseContract.prototype.finalize.name,
                ErrorEnum.RES_CONTRIBUTION_THRESHOLD
            )
        );

        // Verify empty finalized D value
        finalizedDRoot.assertEquals(
            finalizedDWitness.calculateRoot(Field(0)),
            Utils.buildAssertMessage(
                ResponseContract.name,
                ResponseContract.prototype.finalize.name,
                ErrorEnum.RES_D_ROOT
            )
        );
        proof.publicOutput.requestId.assertEquals(
            finalizedDWitness.calculateIndex(),
            Utils.buildAssertMessage(
                ResponseContract.name,
                ResponseContract.prototype.finalize.name,
                ErrorEnum.RES_D_INDEX
            )
        );
        let nextFinalizedDRoot = finalizedDWitness.calculateRoot(
            proof.publicOutput.D.hash()
        );

        // Verify committee config
        committeeContract.verifyConfig(
            new CommitteeConfigInput({
                N: proof.publicOutput.N,
                T: proof.publicOutput.T,
                committeeId: proof.publicInput.action.committeeId,
                settingWitness: settingWitness,
            })
        );

        // Set new states
        this.contributionRoot.set(proof.publicOutput.nextContributionRoot);
        this.finalizedDRoot.set(nextFinalizedDRoot);
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        // Emit events
        this.emitEvent(
            EventEnum.PROCESSED,
            proof.publicOutput.processedActions
        );
    }

    verifyFinalizedD(
        requestId: Field,
        D: RequestVector,
        witness: Level1Witness
    ) {
        this.finalizedDRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(D.hash()),
                Utils.buildAssertMessage(
                    ResponseContract.name,
                    ResponseContract.prototype.verifyFinalizedD.name,
                    ErrorEnum.RES_D_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                ResponseContract.name,
                ResponseContract.prototype.verifyFinalizedD.name,
                ErrorEnum.RES_D_INDEX
            )
        );
    }
}
