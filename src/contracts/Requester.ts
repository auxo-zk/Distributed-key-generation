import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Group,
    Reducer,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    ZkProgram,
    Scalar,
    UInt64,
    PublicKey,
    Bool,
} from 'o1js';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import {
    REQUEST_EXPIRATION,
    REQUEST_MAX_SIZE,
    REQUEST_MIN_PERIOD,
    ZkAppEnum,
    ZkProgramEnum,
} from '../constants.js';
import {
    CommitmentArray,
    NullifierArray,
    RandomVector,
    RequestVector,
    SecretVector,
} from '../libs/Requester.js';
import { RollupContract, processAction, verifyRollup } from './Rollup.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessedActions,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import {
    Level1Witness,
    EMPTY_LEVEL_1_TREE as REQUESTER_LEVEL_1_TREE,
} from '../storages/RequestStorage.js';
import { ErrorEnum, EventEnum, ZkAppAction } from './constants.js';

import { RequestContract } from './Request.js';
import { Level1Witness as DkgLevel1Witness } from '../storages/DKGStorage.js';
import { DkgContract } from './DKG.js';

export {
    Action as RequesterAction,
    AccumulateEncryptionInput,
    AccumulateEncryptionOutput,
    AccumulateEncryption,
    AccumulateEncryptionProof,
    RequesterContract,
};

class Action
    extends Struct({
        taskId: Field,
        keyIndex: Field,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        R: RequestVector,
        M: RequestVector,
        commitments: CommitmentArray,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            taskId: Field(0),
            keyIndex: Field(0),
            startTimestamp: UInt64.zero,
            endTimestamp: UInt64.zero,
            R: new RequestVector(),
            M: new RequestVector(),
            commitments: new CommitmentArray(),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

class AccumulateEncryptionInput extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

class AccumulateEncryptionOutput extends Struct({
    address: PublicKey,
    rollupRoot: Field,
    taskId: Field,
    initialCommitmentCounter: Field,
    initialCommitmentRoot: Field,
    initialProcessRoot: Field,
    nextCommitmentCounter: Field,
    nextCommitmentRoot: Field,
    nextProcessRoot: Field,
    accumulationRoot: Field,
    sumR: RequestVector,
    sumM: RequestVector,
    submissionCounter: Field,
    processedActions: ProcessedActions,
}) {}

const AccumulateEncryption = ZkProgram({
    name: ZkProgramEnum.AccumulateEncryption,
    publicInput: AccumulateEncryptionInput,
    publicOutput: AccumulateEncryptionOutput,
    methods: {
        init: {
            privateInputs: [
                PublicKey,
                Field,
                Field,
                Field,
                Field,
                Field,
                Field,
                RequestVector,
                RequestVector,
                Level1Witness,
            ],
            method(
                input: AccumulateEncryptionInput,
                address: PublicKey,
                rollupRoot: Field,
                initialCommitmentCounter: Field,
                initialCommitmentRoot: Field,
                initialProcessRoot: Field,
                submissionCounter: Field,
                accumulationRoot: Field,
                sumR: RequestVector,
                sumM: RequestVector,
                accumulationWitness: Level1Witness
            ) {
                // Verify request vectors
                accumulationRoot.assertEquals(
                    accumulationWitness.calculateRoot(
                        Poseidon.hash([
                            sumR.hash(),
                            sumM.hash(),
                            submissionCounter,
                        ])
                    ),
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.init.name,
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                let taskId = accumulationWitness.calculateIndex();
                return new AccumulateEncryptionOutput({
                    address,
                    taskId,
                    rollupRoot,
                    initialCommitmentCounter,
                    initialCommitmentRoot,
                    initialProcessRoot,
                    nextCommitmentCounter: initialCommitmentCounter,
                    nextCommitmentRoot: initialCommitmentRoot,
                    nextProcessRoot: initialProcessRoot,
                    accumulationRoot,
                    sumR,
                    sumM,
                    submissionCounter,
                    processedActions: new ProcessedActions(),
                });
            },
        },
        accumulate: {
            privateInputs: [
                SelfProof<
                    AccumulateEncryptionInput,
                    AccumulateEncryptionOutput
                >,
                Level1Witness,
                ActionWitness,
                ActionWitness,
            ],

            method(
                input: AccumulateEncryptionInput,
                earlierProof: SelfProof<
                    AccumulateEncryptionInput,
                    AccumulateEncryptionOutput
                >,
                commitmentWitness: Level1Witness,
                rollupWitness: ActionWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify task Id
                earlierProof.publicOutput.taskId.assertEquals(
                    input.action.taskId,
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.accumulate.name,
                        ErrorEnum.TASK_ID
                    )
                );

                // Verify commitments
                let nextCommitmentCounter =
                    earlierProof.publicOutput.nextCommitmentCounter;
                let nextCommitmentRoot =
                    earlierProof.publicOutput.nextCommitmentRoot;
                for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
                    let index = Field(i);
                    // Verify empty commitment
                    Provable.if(
                        index.greaterThanOrEqual(
                            input.action.commitments.length
                        ),
                        Bool(true),
                        nextCommitmentRoot.equals(
                            commitmentWitness.calculateRoot(Field(0))
                        )
                    ).assertTrue(
                        Utils.buildAssertMessage(
                            AccumulateEncryption.name,
                            AccumulateEncryption.accumulate.name,
                            ErrorEnum.COMMITMENT_ROOT
                        )
                    );
                    Provable.if(
                        index.greaterThanOrEqual(
                            input.action.commitments.length
                        ),
                        Bool(true),
                        nextCommitmentCounter.equals(
                            commitmentWitness.calculateIndex()
                        )
                    ).assertTrue(
                        Utils.buildAssertMessage(
                            AccumulateEncryption.name,
                            AccumulateEncryption.accumulate.name,
                            ErrorEnum.COMMITMENT_INDEX
                        )
                    );

                    // Calculate new values
                    nextCommitmentRoot = Provable.if(
                        index.greaterThanOrEqual(
                            input.action.commitments.length
                        ),
                        nextCommitmentRoot,
                        commitmentWitness.calculateRoot(
                            input.action.commitments.get(Field(i))
                        )
                    );
                    nextCommitmentCounter = Provable.if(
                        index.greaterThanOrEqual(
                            input.action.commitments.length
                        ),
                        nextCommitmentCounter,
                        nextCommitmentCounter.add(1)
                    );
                }

                // Verify action is rolluped
                let actionIndex = Poseidon.hash(
                    [
                        earlierProof.publicOutput.address.toFields(),
                        input.action.hash(),
                        input.actionId,
                    ].flat()
                );
                verifyRollup(
                    AccumulateEncryption.name,
                    earlierProof.publicOutput.rollupRoot,
                    actionIndex,
                    rollupWitness
                );

                // Calculate next state values
                let submissionCounter =
                    earlierProof.publicOutput.submissionCounter.add(1);
                let sumR = earlierProof.publicOutput.sumR;
                let sumM = earlierProof.publicOutput.sumM;

                for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
                    sumR.set(
                        Field(i),
                        sumR.get(Field(i)).add(input.action.R.get(Field(i)))
                    );
                    sumM.set(
                        Field(i),
                        sumM.get(Field(i)).add(input.action.M.get(Field(i)))
                    );
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
                    AccumulateEncryption.name,
                    actionState,
                    earlierProof.publicOutput.nextProcessRoot,
                    processWitness
                );

                return new AccumulateEncryptionOutput({
                    address: earlierProof.publicOutput.address,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
                    taskId: earlierProof.publicOutput.taskId,
                    initialCommitmentCounter:
                        earlierProof.publicOutput.initialCommitmentCounter,
                    initialCommitmentRoot:
                        earlierProof.publicOutput.initialCommitmentRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextCommitmentCounter,
                    nextCommitmentRoot,
                    nextProcessRoot: nextProcessRoot,
                    accumulationRoot:
                        earlierProof.publicOutput.accumulationRoot,
                    sumR,
                    sumM,
                    submissionCounter,
                    processedActions,
                });
            },
        },
    },
});

class AccumulateEncryptionProof extends ZkProgram.Proof(AccumulateEncryption) {}

class RequesterContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing corresponding keys
     */
    @state(Field) keyIndexRoot = State<Field>();

    /**
     * @description MT storing tasks' period
     */
    @state(Field) periodRoot = State<Field>();

    /**
     * @description MT storing tasks' total number of submission
     * @todo To be implemented
     */
    @state(Field) submissionCounterRoot = State<Field>();

    /**
     * @description MT storing latest accumulation data Hash(R | M | counter)
     */
    @state(Field) accumulationRoot = State<Field>();

    /**
     * @description Total number of commitments recorded
     */
    @state(Field) commitmentCounter = State<Field>();

    /**
     * @description MT storing anonymous commitments
     */
    @state(Field) commitmentRoot = State<Field>();

    /**
     * @description MT storing actions' process state
     */
    @state(Field) processRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.PROCESSED]: Field,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.keyIndexRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.periodRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.commitmentCounter.set(Field(0));
        this.commitmentRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    /**
     * Initialize new threshold homomorphic encryption request
     * @param keyIndex Unique key index
     * @param startTimestamp Timestamp marks the start of the submission period
     * @param endTimestamp Timestamp marks the end of the submission period
     */
    @method createTask(
        keyIndex: Field,
        startTimestamp: UInt64,
        endTimestamp: UInt64
    ) {
        // Verify timestamp configuration
        startTimestamp.assertGreaterThanOrEqual(
            this.network.timestamp.getAndRequireEquals(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.createTask.name,
                ErrorEnum.REQUEST_PERIOD
            )
        );
        startTimestamp
            .add(REQUEST_MIN_PERIOD)
            .assertLessThanOrEqual(
                endTimestamp,
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    RequesterContract.prototype.createTask.name,
                    ErrorEnum.REQUEST_PERIOD
                )
            );

        // Create and dispatch action
        let action = new Action({
            taskId: Field(-1),
            keyIndex,
            startTimestamp,
            endTimestamp,
            R: new RequestVector(),
            M: new RequestVector(),
            commitments: new CommitmentArray(),
        });
        this.reducer.dispatch(action);
    }

    /**
     * Submit encryption vector
     * @param taskId Task Id
     * @param keyIndex Unique key index
     * @param secrets Secret values to be encrypted
     * @param randoms Random values for encryption
     * @param nullifiers Nullifier values for anonymous commitments
     * @param publicKey Encryption public key
     * @param startTimestamp Timestamp marks the start of the submission period
     * @param endTimestamp Timestamp marks the end of the submission period
     * @param publicKeyWitness Witness for proof of encryption public key
     * @param keyIndexWitness Witness for key index value
     * @param periodWitness Witness for proof of submission period
     * @param dkg Reference to Dkg Contract
     * @param rollup Reference to Rollup Contract
     *
     * @todo Verify dimension value
     */
    @method submit(
        taskId: Field,
        keyIndex: Field,
        secrets: SecretVector,
        randoms: RandomVector,
        nullifiers: NullifierArray,
        publicKey: Group,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        publicKeyWitness: DkgLevel1Witness,
        keyIndexWitness: Level1Witness,
        periodWitness: Level1Witness,
        dkg: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let timestamp = this.network.timestamp.getAndRequireEquals();

        let dimension = secrets.length;

        // Verify Dkg Contract address
        verifyZkApp(
            RequesterContract.name,
            dkg,
            zkAppRoot,
            Field(ZkAppEnum.DKG)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            RequesterContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );

        const dkgContract = new DkgContract(dkg.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify public key
        dkgContract.verifyKey(keyIndex, publicKey, publicKeyWitness);
        this.verifyKeyIndex(taskId, keyIndex, keyIndexWitness);

        // Verify submission period
        timestamp.assertGreaterThanOrEqual(startTimestamp);
        timestamp.assertLessThanOrEqual(endTimestamp);
        this.verifySubmissionPeriod(
            taskId,
            startTimestamp,
            endTimestamp,
            periodWitness
        );

        // Verify secret vectors
        dimension.assertEquals(
            randoms.length,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_VECTOR_DIM
            )
        );

        // Calculate encryption and commitments
        let R = RequestVector.empty(dimension);
        let M = RequestVector.empty(dimension);
        let commitments = new CommitmentArray();
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
            let index = Field(i);
            let random = randoms.get(index).toScalar();
            let secret = secrets.get(index);
            let nullifier = nullifiers.get(index);
            R.set(
                index,
                Provable.if(
                    Field(i).greaterThanOrEqual(dimension),
                    Group.zero,
                    Group.generator.scale(random)
                )
            );
            let Mi = Provable.if(
                secret.equals(CustomScalar.fromScalar(Scalar.from(0))),
                Group.zero.add(publicKey.scale(random)),
                Group.generator
                    .scale(secrets.get(Field(i)).toScalar())
                    .add(publicKey.scale(random))
            );
            M.set(
                index,
                Provable.if(
                    Field(i).greaterThanOrEqual(dimension),
                    Group.zero,
                    Mi
                )
            );
            commitments.push(
                Provable.if(
                    secrets
                        .get(index)
                        .equals(CustomScalar.fromScalar(Scalar.from(0))),
                    Field(0),
                    Poseidon.hash([nullifier, index, secret.toFields()].flat())
                )
            );
        }

        // Create and dispatch action
        let action = new Action({
            taskId: taskId,
            keyIndex: keyIndex,
            startTimestamp,
            endTimestamp,
            R,
            M,
            commitments,
        });
        this.reducer.dispatch(action);

        // Record action in Rollup Contract
        rollupContract.recordAction(action.hash(), this.address);
    }

    /**
     * Accumulate encryption submissions
     * @param proof Verification proof
     * @param accumulationWitness Witness for proof of accumulation data
     * @param rollup Reference to Rollup Contract
     */
    @method accumulate(
        proof: AccumulateEncryptionProof,
        accumulationWitness: Level1Witness,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let accumulationRoot = this.accumulationRoot.getAndRequireEquals();
        let commitmentCounter = this.commitmentCounter.getAndRequireEquals();
        let commitmentRoot = this.commitmentRoot.getAndRequireEquals();
        let processRoot = this.processRoot.getAndRequireEquals();

        // Verify Rollup Contract address
        verifyZkApp(
            RequesterContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );
        const rollupContract = new RollupContract(rollup.address);

        // Verify proof
        proof.verify();
        proof.publicOutput.address.assertEquals(this.address);
        proof.publicOutput.rollupRoot.assertEquals(
            rollupContract.rollupRoot.getAndRequireEquals(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.accumulate.name,
                ErrorEnum.ROLLUP_ROOT
            )
        );
        proof.publicOutput.initialCommitmentCounter.assertEquals(
            commitmentCounter,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.accumulate.name,
                ErrorEnum.COMMITMENT_COUNTER
            )
        );
        proof.publicOutput.initialCommitmentRoot.assertEquals(
            commitmentRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.accumulate.name,
                ErrorEnum.COMMITMENT_ROOT
            )
        );
        proof.publicOutput.initialProcessRoot.assertEquals(
            processRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.accumulate.name,
                ErrorEnum.PROCESS_ROOT
            )
        );
        proof.publicOutput.accumulationRoot.assertEquals(
            accumulationRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.accumulate.name,
                ErrorEnum.ACCUMULATION_ROOT
            )
        );
        proof.publicOutput.taskId.assertEquals(
            accumulationWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.accumulate.name,
                ErrorEnum.ACCUMULATION_INDEX
            )
        );

        let nextAccumulationRoot = accumulationWitness.calculateRoot(
            Poseidon.hash([
                proof.publicOutput.sumR.hash(),
                proof.publicOutput.sumM.hash(),
                proof.publicOutput.submissionCounter,
            ])
        );

        // Update state values
        this.accumulationRoot.set(nextAccumulationRoot);
        this.commitmentCounter.set(proof.publicOutput.nextCommitmentCounter);
        this.commitmentRoot.set(proof.publicOutput.nextCommitmentRoot);
        this.processRoot.set(proof.publicOutput.nextProcessRoot);
    }

    /**
     * Finalize the submission period of a task
     * @param taskId Task Id
     * @param keyIndex Unique key index
     * @param startTimestamp Timestamp marks the start of the submission period
     * @param endTimestamp Timestamp marks the end of the submission period
     * @param accumulatedR Accumulated R value
     * @param accumulatedM Accumulated M value
     * @param submissionCounter Total number of encryption submission
     * @param keyIndexWitness Witness for proof of key index value
     * @param periodWitness Witness for proof of submission period
     * @param accumulationWitness Witness for proof of accumulation data
     * @param request Reference to Request Contract
     */
    @method finalize(
        taskId: Field,
        keyIndex: Field,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        accumulatedR: RequestVector,
        accumulatedM: RequestVector,
        submissionCounter: Field,
        keyIndexWitness: Level1Witness,
        periodWitness: Level1Witness,
        accumulationWitness: Level1Witness,
        request: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let timestamp = this.network.timestamp.getAndRequireEquals();

        // Verify Request Contract address
        verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );
        const requestContract = new RequestContract(request.address);

        // Verify taskId
        this.verifyKeyIndex(taskId, keyIndex, keyIndexWitness);

        // Verify submission period

        this.verifySubmissionPeriod(
            taskId,
            startTimestamp,
            endTimestamp,
            periodWitness
        );

        // Verify accumulation data
        timestamp.assertGreaterThan(
            endTimestamp,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.finalize.name,
                ErrorEnum.REQUEST_PERIOD
            )
        );
        this.verifyAccumulationData(
            taskId,
            accumulatedR,
            accumulatedM,
            submissionCounter,
            accumulationWitness
        );

        // Initialize a request in Request Contract
        requestContract.initialize(
            taskId,
            keyIndex,
            this.address,
            accumulatedR,
            accumulatedM,
            UInt64.from(REQUEST_EXPIRATION)
        );
    }

    /**
     * Verify task's key index
     * @param taskId Task Id
     * @param keyIndex Corresponding key index
     * @param witness Witness for proof of key index value
     */
    verifyKeyIndex(taskId: Field, keyIndex: Field, witness: Level1Witness) {
        this.keyIndexRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(keyIndex),
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    RequesterContract.prototype.verifyKeyIndex.name,
                    ErrorEnum.KEY_INDEX_ROOT
                )
            );
        taskId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.verifyKeyIndex.name,
                ErrorEnum.KEY_INDEX_INDEX
            )
        );
    }

    /**
     * Verify the duration of a task's submission period
     * @param taskId Task Id
     * @param startTimestamp Timestamp marks the start of the submission period
     * @param endTimestamp Timestamp marks the end of the submission period
     * @param witness Witness for proof of submission period
     */
    verifySubmissionPeriod(
        taskId: Field,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        witness: Level1Witness
    ) {
        this.periodRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash(
                        [
                            startTimestamp.toFields(),
                            endTimestamp.toFields(),
                        ].flat()
                    )
                ),
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    RequesterContract.prototype.verifySubmissionPeriod.name,
                    ErrorEnum.REQUEST_PERIOD_ROOT
                )
            );
        taskId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.verifySubmissionPeriod.name,
                ErrorEnum.REQUEST_PERIOD_INDEX
            )
        );
    }

    /**
     * Verify accumulation data
     * @param requestId Request Id
     * @param accumulatedR Accumulated R value
     * @param accumulatedM Accumulated M value
     * @param submissionCounter Total number of encryption submission
     * @param witness Witness for proof of accumulation data
     */
    verifyAccumulationData(
        requestId: Field,
        accumulatedR: RequestVector,
        accumulatedM: RequestVector,
        submissionCounter: Field,
        witness: Level1Witness
    ) {
        this.accumulationRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash([
                        accumulatedR.hash(),
                        accumulatedM.hash(),
                        submissionCounter,
                    ])
                ),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    RequestContract.prototype.verifyAccumulationData.name,
                    ErrorEnum.ACCUMULATION_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                RequestContract.prototype.verifyAccumulationData.name,
                ErrorEnum.ACCUMULATION_INDEX
            )
        );
    }
}
