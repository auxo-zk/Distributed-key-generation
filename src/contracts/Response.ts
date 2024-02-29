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
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
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
import {
    DkgContract,
    KeyStatus,
    KeyStatusInput,
    calculateKeyIndex,
} from './DKG.js';
import { RequestContract, ResolveInput } from './Request.js';
import { BatchDecryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { Round2Contract } from './Round2.js';
import {
    COMMITTEE_MAX_SIZE,
    REQUEST_MAX_SIZE,
    ZkAppEnum,
    ZkProgramEnum,
} from '../constants.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessedActions,
    ZkAppRef,
    verifyZkApp,
} from './SharedStorage.js';
import { DArray, RArray, RequestVector } from '../libs/Requester.js';
import { Rollup, processAction, rollup } from './Actions.js';
import { ErrorEnum, EventEnum } from './constants.js';

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

export const RollupResponse = Rollup(ZkProgramEnum.RollupResponse, Action);

export class RollupResponseProof extends ZkProgram.Proof(RollupResponse) {}

export class FinalizeResponseInput extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class FinalizeResponseOutput extends Struct({
    T: Field,
    N: Field,
    initialContributionRoot: Field,
    initialProcessRoot: Field,
    nextContributionRoot: Field,
    nextProcessRoot: Field,
    requestId: Field,
    D: RequestVector,
    indexList: Field,
    processedActions: ProcessedActions,
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
 * - Verify contributionRoot using the same requestId
 * - Verify the member's contribution witness
 * - Compute new contribution root
 * - Compute D values
 * - Verify the action has been reduced
 */
export const FinalizeResponse = ZkProgram({
    name: ZkProgramEnum.FinalizeResponse,
    publicInput: FinalizeResponseInput,
    publicOutput: FinalizeResponseOutput,
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
                input: FinalizeResponseInput,
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
                let [contributionRoot, contributionKey] =
                    contributionWitness.computeRootAndKey(Field(0));
                initialContributionRoot.assertEquals(
                    contributionRoot,
                    buildAssertMessage(
                        FinalizeResponse.name,
                        'firstStep',
                        ErrorEnum.RES_CONTRIBUTION_ROOT
                    )
                );
                requestId.assertEquals(
                    contributionKey,
                    buildAssertMessage(
                        FinalizeResponse.name,
                        'firstStep',
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L1
                    )
                );

                // Record an empty level 2 tree
                let nextContributionRoot =
                    contributionWitness.computeRootAndKey(
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
                D.length.assertEquals(
                    requestDim,
                    buildAssertMessage(
                        FinalizeResponse.name,
                        'firstStep',
                        ErrorEnum.RES_CONTRIBUTION_DIMENSION
                    )
                );
                for (let i = 0; i < REQUEST_MAX_SIZE; i++)
                    D.set(Field(i), Group.zero);

                return new FinalizeResponseOutput({
                    T: T,
                    N: N,
                    initialContributionRoot: initialContributionRoot,
                    initialProcessRoot: initialProcessRoot,
                    nextContributionRoot: nextContributionRoot,
                    nextProcessRoot: initialProcessRoot,
                    requestId: requestId,
                    D: D,
                    indexList: indexList,
                    processedActions: new ProcessedActions(),
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<FinalizeResponseInput, FinalizeResponseOutput>,
                RequestWitness,
                ActionWitness,
            ],
            method(
                input: FinalizeResponseInput,
                earlierProof: SelfProof<
                    FinalizeResponseInput,
                    FinalizeResponseOutput
                >,
                contributionWitness: RequestWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify contributionRoot using the same requestId
                input.action.requestId.assertEquals(
                    earlierProof.publicOutput.requestId,
                    buildAssertMessage(
                        FinalizeResponse.name,
                        'nextStep',
                        ErrorEnum.REQUEST_ID
                    )
                );

                // Verify the member's contribution witness
                let [contributionRoot, contributionKey] =
                    contributionWitness.level1.computeRootAndKey(
                        contributionWitness.level2.calculateRoot(Field(0))
                    );
                earlierProof.publicOutput.nextContributionRoot.assertEquals(
                    contributionRoot,
                    buildAssertMessage(
                        FinalizeResponse.name,
                        'nextStep',
                        ErrorEnum.RES_CONTRIBUTION_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    contributionKey,
                    buildAssertMessage(
                        FinalizeResponse.name,
                        'nextStep',
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex(),
                    buildAssertMessage(
                        FinalizeResponse.name,
                        'nextStep',
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L2
                    )
                );

                // Compute new contribution root
                let nextContributionRoot =
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

                // Calculate corresponding action state
                let actionState = updateActionState(input.previousActionState, [
                    Action.toFields(input.action),
                ]);
                let processedActions =
                    earlierProof.publicOutput.processedActions;
                processedActions.push(actionState);

                // Verify the action isn't already processed
                let nextProcessRoot = processAction(
                    FinalizeResponse.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeResponseOutput({
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

export class FinalizeResponseProof extends ZkProgram.Proof(FinalizeResponse) {}

export class ResponseContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing members' contributions
     */
    @state(Field) contributionRoot = State<Field>();

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
        this.actionState.set(Reducer.initialActionState);
        this.rollupRoot.set(EMPTY_ACTION_MT().getRoot());
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
        committee: ZkAppRef,
        round1: ZkAppRef,
        round2: ZkAppRef,
        memberWitness: CommitteeFullWitness,
        publicKeyWitness: DKGWitness,
        encryptionWitness: DKGWitness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

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

        const committeeContract = new CommitteeContract(committee.address);
        const round1Contract = new Round1Contract(round1.address);
        const round2Contract = new Round2Contract(round2.address);

        // Verify decryption proof
        proof.verify();
        let committeeId = memberWitness.level1.calculateIndex();
        let memberId = memberWitness.level2.calculateIndex();

        // Verify committee member - FIXME check if using this.sender is secure
        committeeContract.checkMember(
            new CommitteeMemberInput({
                address: this.sender,
                committeeId: committeeId,
                memberId: memberId,
                memberWitness: memberWitness,
            })
        );

        // Verify round 1 public key (C0)
        let keyIndex = calculateKeyIndex(committeeId, keyId);
        round1Contract.publicKeyRoot
            .getAndRequireEquals()
            .assertEquals(
                publicKeyWitness.level1.calculateRoot(
                    publicKeyWitness.level2.calculateRoot(
                        Poseidon.hash(proof.publicInput.publicKey.toFields())
                    )
                ),
                buildAssertMessage(
                    ResponseContract.name,
                    'contribute',
                    ErrorEnum.R1_CONTRIBUTION_ROOT
                )
            );
        keyIndex.assertEquals(
            publicKeyWitness.level1.calculateIndex(),
            buildAssertMessage(
                ResponseContract.name,
                'contribute',
                ErrorEnum.R1_CONTRIBUTION_INDEX_L1
            )
        );
        memberId.assertEquals(
            publicKeyWitness.level2.calculateIndex(),
            buildAssertMessage(
                ResponseContract.name,
                'contribute',
                ErrorEnum.R1_CONTRIBUTION_INDEX_L2
            )
        );

        // Verify round 2 encryptions (hashes)
        let encryptionHashChain = Field(0);
        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
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
        round2Contract.encryptionRoot
            .getAndRequireEquals()
            .assertEquals(
                encryptionWitness.level1.calculateRoot(
                    encryptionWitness.level2.calculateRoot(encryptionHashChain)
                ),
                buildAssertMessage(
                    ResponseContract.name,
                    'contribute',
                    ErrorEnum.ENCRYPTION_ROOT
                )
            );
        keyIndex.assertEquals(
            encryptionWitness.level1.calculateIndex(),
            buildAssertMessage(
                ResponseContract.name,
                'contribute',
                ErrorEnum.ENCRYPTION_INDEX_L1
            )
        );
        memberId.assertEquals(
            encryptionWitness.level2.calculateIndex(),
            buildAssertMessage(
                ResponseContract.name,
                'contribute',
                ErrorEnum.ENCRYPTION_INDEX_L2
            )
        );

        // Compute response
        let D = Provable.witness(DArray, () => {
            return new DArray(R.values.slice(0, Number(R.length)));
        });
        D.length.assertEquals(
            R.length,
            buildAssertMessage(
                ResponseContract.name,
                'contribute',
                ErrorEnum.RES_CONTRIBUTION_DIMENSION
            )
        );
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
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

    /**
     * Rollup actions
     * @param proof Verification proof
     */
    @method
    rollup(proof: RollupResponseProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let rollupRoot = this.rollupRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        rollup(
            ResponseContract.name,
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
        committee: ZkAppRef,
        request: ZkAppRef,
        settingWitness: CommitteeLevel1Witness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let contributionRoot = this.contributionRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        // Verify CommitteeContract address
        verifyZkApp(
            Round2Contract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );

        // RequestContract
        verifyZkApp(
            Round2Contract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const requestContract = new RequestContract(request.address);

        // Verify response proof
        proof.verify();
        proof.publicOutput.initialContributionRoot.assertEquals(
            contributionRoot,
            buildAssertMessage(
                ResponseContract.name,
                'finalize',
                ErrorEnum.RES_CONTRIBUTION_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.PROCESS_ROOT
            )
        );
        proof.publicOutput.processedActions.length.assertEquals(
            proof.publicOutput.T,
            buildAssertMessage(
                Round2Contract.name,
                'finalize',
                ErrorEnum.RES_CONTRIBUTION_THRESHOLD
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

        // Set new states
        this.contributionRoot.set(proof.publicOutput.nextContributionRoot);
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        // Create & dispatch action to RequestContract
        requestContract.resolve(
            new ResolveInput({
                requestId: proof.publicOutput.requestId,
                D: proof.publicOutput.D,
            })
        );

        // Emit events
        this.emitEvent(
            EventEnum.PROCESSED,
            proof.publicOutput.processedActions
        );
    }
}
