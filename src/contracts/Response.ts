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
    UInt8,
    Void,
    ZkProgram,
    method,
    state,
} from 'o1js';
import { Bit255, CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import {
    CommitteeWitness,
    CommitteeLevel1Witness,
} from '../storages/CommitteeStorage.js';
import {
    DKGWitness,
    DKG_LEVEL_2_TREE,
    ProcessedContributions,
    ResponseContributionWitness,
    calculateKeyIndex,
} from '../storages/DkgStorage.js';
import {
    RequestLevel1Witness,
    RequestLevel2Witness,
    REQUEST_LEVEL_1_TREE,
    REQUEST_LEVEL_2_TREE,
} from '../storages/RequestStorage.js';
import {
    CommitteeConfigInput,
    CommitteeMemberInput,
    CommitteeContract,
} from './Committee.js';
import { BatchDecryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { Round2Contract } from './Round2.js';
import { ENCRYPTION_LIMITS, INSTANCE_LIMITS } from '../constants.js';
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
import { DArray } from '../libs/Requester.js';
import { RequestContract } from './Request.js';

export {
    Action as ResponseAction,
    FinalizedEvent,
    RespondedDArrayEvent,
    FinalizedDArrayEvent,
    ComputeResponseOutput,
    ComputeResponse,
    ComputeResponseProof,
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
        dimension: UInt8,
        responseRootD: Field,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            committeeId: Field(0),
            keyId: Field(0),
            memberId: Field(0),
            requestId: Field(0),
            dimension: UInt8.from(0),
            responseRootD: Field(0),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

class FinalizedEvent extends Struct({
    requestId: Field,
    actions: ProcessedContributions,
}) {}

class RespondedDArrayEvent extends Struct({
    requestId: Field,
    memberId: Field,
    dimensionIndex: UInt8,
    Di: Group,
}) {}

class FinalizedDArrayEvent extends Struct({
    requestId: Field,
    dimensionIndex: UInt8,
    Di: Group,
}) {}

class ComputeResponseOutput extends Struct({
    accumulationRootR: Field,
    responseRootD: Field,
    skiCommitment: Group,
    dimension: UInt8,
    responseVector: DArray,
}) {}

const ComputeResponse = ZkProgram({
    name: ZkProgramEnum.ComputeResponse,
    publicOutput: ComputeResponseOutput,
    methods: {
        init: {
            privateInputs: [Field, CustomScalar],
            async method(accumulationRootR: Field, ski: CustomScalar) {
                return new ComputeResponseOutput({
                    accumulationRootR,
                    responseRootD: REQUEST_LEVEL_2_TREE().getRoot(),
                    skiCommitment: Group.generator.scale(ski.toScalar()),
                    dimension: UInt8.from(0),
                    responseVector: new DArray(),
                });
            },
        },
        compute: {
            privateInputs: [
                SelfProof<Void, ComputeResponseOutput>,
                CustomScalar,
                Group,
                RequestLevel2Witness,
                RequestLevel2Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, ComputeResponseOutput>,
                ski: CustomScalar,
                R: Group,
                accumulationWitness: RequestLevel2Witness,
                responseWitness: RequestLevel2Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify R value
                earlierProof.publicOutput.accumulationRootR.assertEquals(
                    accumulationWitness.calculateRoot(
                        Provable.if(
                            R.equals(Group.zero),
                            Field(0),
                            Poseidon.hash(R.toFields())
                        )
                    ),
                    Utils.buildAssertMessage(
                        ComputeResponse.name,
                        'compute',
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                earlierProof.publicOutput.dimension.value.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResponse.name,
                        'compute',
                        ErrorEnum.ACCUMULATION_INDEX_L2
                    )
                );
                // Verify empty D value
                earlierProof.publicOutput.responseRootD.assertEquals(
                    responseWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        ComputeResponse.name,
                        'compute',
                        ErrorEnum.RES_D_ROOT
                    )
                );
                earlierProof.publicOutput.dimension.value.assertEquals(
                    responseWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        ComputeResponse.name,
                        'compute',
                        ErrorEnum.RES_D_INDEX_L2
                    )
                );

                // Calculate contribution D value
                let skiCommitment = Group.generator.scale(ski.toScalar());
                skiCommitment.assertEquals(
                    earlierProof.publicOutput.skiCommitment
                );
                let D = R.add(Group.generator)
                    .scale(ski.toScalar())
                    .sub(skiCommitment);
                let responseVector = earlierProof.publicOutput.responseVector;
                responseVector.push(D);
                let responseRootD = responseWitness.calculateRoot(
                    Poseidon.hash(D.toFields())
                );

                return new ComputeResponseOutput({
                    ...earlierProof.publicOutput,
                    responseRootD,
                    skiCommitment,
                    dimension: earlierProof.publicOutput.dimension.add(1),
                    responseVector,
                });
            },
        },
    },
});

class ComputeResponseProof extends ZkProgram.Proof(ComputeResponse) {}

class FinalizeResponseInput extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

class FinalizeResponseOutput extends Struct({
    T: Field,
    N: Field,
    memberCounter: UInt8,
    dimension: UInt8,
    dimensionCounter: UInt8,
    requestId: Field,
    indexList: Field,
    initialContributionRoot: Field,
    initialProcessRoot: Field,
    nextContributionRoot: Field,
    nextProcessRoot: Field,
    responseRootD: Field,
    Di: Group,
    rollupRoot: Field,
    processedActions: ProcessedContributions,
    responseVector: DArray,
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
                UInt8,
                Field,
                Field,
                Field,
                Field,
                Field,
                RequestLevel1Witness,
            ],
            async method(
                input: FinalizeResponseInput,
                T: Field,
                N: Field,
                dimension: UInt8,
                requestId: Field,
                indexList: Field,
                initialContributionRoot: Field,
                initialProcessRoot: Field,
                rollupRoot: Field,
                contributionWitness: RequestLevel1Witness
            ) {
                // Verify there is no recorded contribution for the request
                initialContributionRoot.assertEquals(
                    contributionWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'init',
                        ErrorEnum.RES_CONTRIBUTION_ROOT
                    )
                );
                requestId.assertEquals(
                    contributionWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'init',
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L1
                    )
                );

                // Record an empty level 2 tree
                let nextContributionRoot = contributionWitness.calculateRoot(
                    DKG_LEVEL_2_TREE().getRoot()
                );
                let responseRootD = REQUEST_LEVEL_2_TREE().getRoot();

                return new FinalizeResponseOutput({
                    T,
                    N,
                    memberCounter: UInt8.from(0),
                    dimension,
                    dimensionCounter: UInt8.from(0),
                    requestId,
                    indexList,
                    initialContributionRoot,
                    initialProcessRoot,
                    nextContributionRoot,
                    nextProcessRoot: initialProcessRoot,
                    responseRootD,
                    Di: Group.zero,
                    rollupRoot,
                    processedActions: new ProcessedContributions(),
                    responseVector: new DArray(),
                });
            },
        },
        contribute: {
            privateInputs: [
                SelfProof<FinalizeResponseInput, FinalizeResponseOutput>,
                ResponseContributionWitness,
                RollupWitness,
                ProcessWitness,
            ],
            async method(
                input: FinalizeResponseInput,
                earlierProof: SelfProof<
                    FinalizeResponseInput,
                    FinalizeResponseOutput
                >,
                contributionWitness: ResponseContributionWitness,
                rollupWitness: RollupWitness,
                processWitness: ProcessWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify requestId
                input.action.requestId.assertEquals(
                    earlierProof.publicOutput.requestId,
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'contribute',
                        ErrorEnum.REQUEST_ID
                    )
                );

                // Verify dimension
                input.action.dimension.assertEquals(
                    earlierProof.publicOutput.dimension,
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'contribute',
                        ErrorEnum.REQUEST_VECTOR_DIM
                    )
                );

                // Verify the member's contribution witness
                earlierProof.publicOutput.nextContributionRoot.assertEquals(
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(Field(0))
                    ),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'contribute',
                        ErrorEnum.RES_CONTRIBUTION_ROOT
                    )
                );
                input.action.requestId.assertEquals(
                    contributionWitness.level1.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'contribute',
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L1
                    )
                );
                input.action.memberId.assertEquals(
                    contributionWitness.level2.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'contribute',
                        ErrorEnum.RES_CONTRIBUTION_INDEX_L2
                    )
                );

                // Compute new contribution root
                let nextContributionRoot =
                    contributionWitness.level1.calculateRoot(
                        contributionWitness.level2.calculateRoot(
                            input.action.responseRootD
                        )
                    );

                // Verify action is rolluped
                let actionIndex = calculateActionIndex(
                    Field(ZkAppIndex.RESPONSE),
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
                    UInt8.from(0),
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeResponseOutput({
                    ...earlierProof.publicOutput,
                    nextContributionRoot,
                    nextProcessRoot,
                    processedActions,
                });
            },
        },
        compute: {
            privateInputs: [
                SelfProof<FinalizeResponseInput, FinalizeResponseOutput>,
                Group,
                RequestLevel2Witness,
                ProcessWitness,
            ],
            async method(
                input: FinalizeResponseInput,
                earlierProof: SelfProof<
                    FinalizeResponseInput,
                    FinalizeResponseOutput
                >,
                di: Group,
                responseWitness: RequestLevel2Witness,
                processWitness: ProcessWitness
            ) {
                // Verify proof
                earlierProof.verify();

                // Verify response D
                input.action.responseRootD.assertEquals(
                    responseWitness.calculateRoot(Poseidon.hash(di.toFields())),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'compute',
                        ErrorEnum.RES_D_ROOT
                    )
                );
                earlierProof.publicOutput.dimensionCounter.value.assertEquals(
                    responseWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'compute',
                        ErrorEnum.RES_D_INDEX_L2
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
                let Di = earlierProof.publicOutput.Di.add(
                    di
                        .add(Group.generator)
                        .scale(lagrangeCoefficientMul.mul3)
                        .sub(Group.generator.scale(lagrangeCoefficientMul.mul3))
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

                // Verify action
                let actionState = Utils.updateActionState(
                    input.previousActionState,
                    [Action.toFields(input.action)]
                );
                earlierProof.publicOutput.processedActions
                    .get(Field(earlierProof.publicOutput.memberCounter.value))
                    .assertEquals(
                        actionState,
                        Utils.buildAssertMessage(
                            FinalizeResponse.name,
                            'compute',
                            ErrorEnum.ACTION_STATE
                        )
                    );
                let memberCounter =
                    earlierProof.publicOutput.memberCounter.add(1);
                let nextProcessRoot = processAction(
                    FinalizeResponse.name,
                    input.actionId,
                    earlierProof.publicOutput.dimensionCounter.add(1),
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new FinalizeResponseOutput({
                    ...earlierProof.publicOutput,
                    memberCounter,
                    Di,
                    nextProcessRoot,
                });
            },
        },
        finalize: {
            privateInputs: [
                SelfProof<FinalizeResponseInput, FinalizeResponseOutput>,
                RequestLevel2Witness,
            ],
            async method(
                input: FinalizeResponseInput,
                earlierProof: SelfProof<
                    FinalizeResponseInput,
                    FinalizeResponseOutput
                >,
                responseWitness: RequestLevel2Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify committee threshold
                earlierProof.publicOutput.memberCounter.value.assertEquals(
                    earlierProof.publicOutput.T,
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'finalize',
                        ErrorEnum.RES_CONTRIBUTION_THRESHOLD
                    )
                );

                // Verify empty D value
                earlierProof.publicOutput.responseRootD.assertEquals(
                    responseWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'finalize',
                        ErrorEnum.RES_D_ROOT
                    )
                );
                earlierProof.publicOutput.dimensionCounter.value.assertEquals(
                    responseWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        FinalizeResponse.name,
                        'finalize',
                        ErrorEnum.RES_D_INDEX_L2
                    )
                );

                // Calculate new response root D value
                let responseRootD = responseWitness.calculateRoot(
                    Poseidon.hash(earlierProof.publicOutput.Di.toFields())
                );
                let responseVector = earlierProof.publicOutput.responseVector;
                responseVector.push(earlierProof.publicOutput.Di);

                let dimensionCounter =
                    earlierProof.publicOutput.dimensionCounter.add(1);

                return new FinalizeResponseOutput({
                    ...earlierProof.publicOutput,
                    memberCounter: UInt8.from(0),
                    dimensionCounter,
                    Di: Group.zero,
                    responseRootD,
                    responseVector,
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
    @state(Field) responseRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.RespondedDArray]: RespondedDArrayEvent,
        [EventEnum.FinalizedDArray]: FinalizedDArrayEvent,
        [EventEnum.PROCESSED]: FinalizedEvent,
    };

    init() {
        super.init();
        this.zkAppRoot.set(ADDRESS_MT().getRoot());
        this.contributionRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.responseRoot.set(REQUEST_LEVEL_1_TREE().getRoot());
        this.processRoot.set(PROCESS_MT().getRoot());
    }

    /**
     * Submit response contribution for key usage request
     * @param decryptionProof Decryption verification proof
     * @param responseProof Response verification proof
     * @param keyId Committee's key Id
     * @param requestId Request Id
     * @param memberWitness Witness for proof of committee membership
     * @param publicKeyWitness Witness for proof of encryption public key
     * @param encryptionWitness Witness for encryption hashes
     * @param committee Reference to Committee Contract
     * @param round1 Reference to Round 1 Contract
     * @param round2 Reference to Round 2 Contract
     * @param rollup Reference to Rollup Contract
     * @param selfRef Reference to this Contract
     */
    @method
    async contribute(
        decryptionProof: BatchDecryptionProof,
        responseProof: ComputeResponseProof,
        keyId: Field,
        requestId: Field,
        accumulationRootM: Field,
        memberWitness: CommitteeWitness,
        publicKeyWitness: DKGWitness,
        encryptionWitness: DKGWitness,
        accumulationWitness: RequestLevel1Witness,
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
            Field(ZkAppIndex.COMMITTEE)
        );

        // Verify Round1Contract address
        verifyZkApp(
            ResponseContract.name,
            round1,
            zkAppRoot,
            Field(ZkAppIndex.ROUND1)
        );

        // Verify Round2Contract address
        verifyZkApp(
            ResponseContract.name,
            round2,
            zkAppRoot,
            Field(ZkAppIndex.ROUND2)
        );

        // Verify RequestContract address
        verifyZkApp(
            ResponseContract.name,
            request,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            ResponseContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const round1Contract = new Round1Contract(round1.address);
        const round2Contract = new Round2Contract(round2.address);
        const requestContract = new RequestContract(request.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify decryption proof
        decryptionProof.verify();

        // FIXME - "Option.value_exn None" error
        // Verify keyId
        keyId.assertLessThanOrEqual(
            INSTANCE_LIMITS.KEY,
            Utils.buildAssertMessage(
                ResponseContract.name,
                'contribute',
                ErrorEnum.KEY_COUNTER_LIMIT
            )
        );

        // Verify committee member
        committeeContract.verifyMember(
            new CommitteeMemberInput({
                address: this.sender.getAndRequireSignature(),
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
            decryptionProof.publicInput.publicKey,
            publicKeyWitness
        );

        // Verify round 2 encryptions (hashes)
        let encryptionHashChain = Field(0);
        for (let i = 0; i < INSTANCE_LIMITS.MEMBER; i++) {
            encryptionHashChain = Provable.if(
                Field(i).greaterThanOrEqual(
                    decryptionProof.publicInput.c.length
                ),
                encryptionHashChain,
                Poseidon.hash(
                    [
                        encryptionHashChain,
                        (
                            decryptionProof.publicInput.c.get(
                                Field(i)
                            ) as Bit255
                        ).toFields(),
                        decryptionProof.publicInput.U.get(Field(i)).toFields(),
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

        // Verify accumulation root
        requestContract.verifyAccumulationData(
            requestId,
            responseProof.publicOutput.accumulationRootR,
            accumulationRootM,
            responseProof.publicOutput.dimension,
            accumulationWitness
        );

        // Verify response proof
        responseProof.verify();
        responseProof.publicOutput.skiCommitment.assertEquals(
            decryptionProof.publicOutput,
            Utils.buildAssertMessage(
                ResponseContract.name,
                'contribute',
                ErrorEnum.SECRET_SHARE
            )
        );

        // Create & dispatch action to DkgContract
        let action = new Action({
            committeeId,
            keyId,
            memberId,
            requestId,
            dimension: responseProof.publicOutput.dimension,
            responseRootD: responseProof.publicOutput.responseRootD,
        });
        this.reducer.dispatch(action);

        // Record action for rollup
        selfRef.address.assertEquals(this.address);
        await rollupContract.recordAction(action.hash(), selfRef);

        for (let i = 0; i < ENCRYPTION_LIMITS.FULL_DIMENSION; i++) {
            this.emitEvent(
                EventEnum.RespondedDArray,
                new RespondedDArrayEvent({
                    requestId,
                    memberId,
                    dimensionIndex: UInt8.from(i),
                    Di: responseProof.publicOutput.responseVector.get(Field(i)),
                })
            );
        }
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
    async finalize(
        proof: FinalizeResponseProof,
        settingWitness: CommitteeLevel1Witness,
        keyIndexWitness: RequestLevel1Witness,
        responseWitness: RequestLevel1Witness,
        committee: ZkAppRef,
        request: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let contributionRoot = this.contributionRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();
        let responseRoot = this.responseRoot.getAndRequireEquals();

        let requestId = proof.publicOutput.requestId;

        // Verify CommitteeContract address
        verifyZkApp(
            ResponseContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );

        // Verify RequestContract address
        verifyZkApp(
            ResponseContract.name,
            request,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            ResponseContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppIndex.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const requestContract = new RequestContract(request.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify response proof
        proof.verify();
        proof.publicOutput.rollupRoot.assertEquals(
            rollupContract.rollupRoot.getAndRequireEquals(),
            Utils.buildAssertMessage(
                ResponseContract.name,
                'finalize',
                ErrorEnum.ROLLUP_ROOT
            )
        );
        proof.publicOutput.initialContributionRoot.assertEquals(
            contributionRoot,
            Utils.buildAssertMessage(
                ResponseContract.name,
                'finalize',
                ErrorEnum.RES_CONTRIBUTION_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                ResponseContract.name,
                'finalize',
                ErrorEnum.PROCESS_ROOT
            )
        );
        proof.publicOutput.processedActions.length.assertEquals(
            proof.publicOutput.T,
            Utils.buildAssertMessage(
                ResponseContract.name,
                'finalize',
                ErrorEnum.RES_CONTRIBUTION_THRESHOLD
            )
        );

        // Verify empty response value
        responseRoot.assertEquals(
            responseWitness.calculateRoot(Field(0)),
            Utils.buildAssertMessage(
                ResponseContract.name,
                'finalize',
                ErrorEnum.RES_D_ROOT
            )
        );
        proof.publicOutput.requestId.assertEquals(
            responseWitness.calculateIndex(),
            Utils.buildAssertMessage(
                ResponseContract.name,
                'finalize',
                ErrorEnum.RES_D_INDEX_L1
            )
        );
        let nextResponseRoot = responseWitness.calculateRoot(
            proof.publicOutput.responseRootD
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

        // Verify key index and accumulation data
        requestContract.verifyKeyIndex(
            proof.publicOutput.requestId,
            calculateKeyIndex(
                proof.publicInput.action.committeeId,
                proof.publicInput.action.keyId
            ),
            keyIndexWitness
        );

        // Set new states
        this.contributionRoot.set(proof.publicOutput.nextContributionRoot);
        this.responseRoot.set(nextResponseRoot);
        this.processRoot.set(proof.publicOutput.nextProcessRoot);

        for (let i = 0; i < ENCRYPTION_LIMITS.FULL_DIMENSION; i++) {
            this.emitEvent(
                EventEnum.FinalizedDArray,
                new FinalizedDArrayEvent({
                    requestId,
                    dimensionIndex: UInt8.from(i),
                    Di: proof.publicOutput.responseVector.get(Field(i)),
                })
            );
        }

        // Emit events
        this.emitEvent(
            EventEnum.PROCESSED,
            new FinalizedEvent({
                requestId,
                actions: proof.publicOutput.processedActions,
            })
        );
    }

    verifyResponse(
        requestId: Field,
        responseRootD: Field,
        witness: RequestLevel1Witness
    ) {
        this.responseRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(responseRootD),
                Utils.buildAssertMessage(
                    ResponseContract.name,
                    'verifyResponse',
                    ErrorEnum.RES_D_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                ResponseContract.name,
                'verifyResponse',
                ErrorEnum.RES_D_INDEX_L1
            )
        );
    }
}
