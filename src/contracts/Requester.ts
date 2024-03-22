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
    UInt8,
    UInt32,
} from 'o1js';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import {
    ENCRYPTION_LIMITS,
    REQUEST_EXPIRATION,
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
import { rollup } from './Rollup.js';
import {
    EMPTY_ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import {
    Level1Witness,
    EMPTY_LEVEL_1_TREE as REQUESTER_LEVEL_1_TREE,
} from '../storages/RequestStorage.js';
import { ErrorEnum, ZkAppAction } from './constants.js';
import { Level1Witness as DkgLevel1Witness } from '../storages/DKGStorage.js';
import { DkgContract } from './DKG.js';
import { RequestContract } from './Request.js';
import {
    AccumulationWitnesses,
    CommitmentWitnesses,
} from '../storages/RequesterStorage.js';

export {
    Action as RequesterAction,
    UpdateTaskInput,
    UpdateTaskOutput,
    UpdateTask,
    UpdateTaskProof,
    RequesterContract,
};

class Action
    extends Struct({
        taskId: UInt32,
        keyIndex: Field,
        timestamp: UInt64,
        indexes: Field,
        R: RequestVector,
        M: RequestVector,
        commitments: CommitmentArray,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            taskId: UInt32.zero,
            keyIndex: Field(0),
            timestamp: UInt64.zero,
            indexes: Field(0),
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

class UpdateTaskInput extends Action {}

class UpdateTaskOutput extends Struct({
    taskId: UInt32,
    initialActionState: Field,
    initialKeyIndexRoot: Field,
    initialTimestampRoot: Field,
    initialAccumulationRoot: Field,
    initialCommitmentCounter: Field,
    initialCommitmentRoot: Field,
    nextActionState: Field,
    nextKeyIndexRoot: Field,
    nextTimestampRoot: Field,
    nextAccumulationRoot: Field,
    nextCommitmentCounter: Field,
    nextCommitmentRoot: Field,
    nextTimestamp: UInt64,
}) {}

const UpdateTask = ZkProgram({
    name: ZkProgramEnum.UpdateTask,
    publicInput: UpdateTaskInput,
    publicOutput: UpdateTaskOutput,
    methods: {
        init: {
            privateInputs: [UInt32, Field, Field, Field, Field, Field, Field],
            method(
                input: UpdateTaskInput,
                taskId: UInt32,
                initialActionState: Field,
                initialKeyIndexRoot: Field,
                initialTimestampRoot: Field,
                initialAccumulationRoot: Field,
                initialCommitmentCounter: Field,
                initialCommitmentRoot: Field
            ) {
                return new UpdateTaskOutput({
                    taskId,
                    initialActionState,
                    initialKeyIndexRoot,
                    initialTimestampRoot,
                    initialAccumulationRoot,
                    initialCommitmentCounter,
                    initialCommitmentRoot,
                    nextActionState: initialActionState,
                    nextKeyIndexRoot: initialKeyIndexRoot,
                    nextTimestampRoot: initialTimestampRoot,
                    nextAccumulationRoot: initialAccumulationRoot,
                    nextCommitmentCounter: initialCommitmentCounter,
                    nextCommitmentRoot: initialCommitmentRoot,
                    nextTimestamp: UInt64.zero,
                });
            },
        },
        create: {
            privateInputs: [
                SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                Level1Witness,
                Level1Witness,
            ],
            method(
                input: UpdateTaskInput,
                earlierProof: SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                keyIndexWitness: Level1Witness,
                timestampWitness: Level1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify task Id
                earlierProof.publicOutput.taskId.assertEquals(input.taskId);

                // Verify empty key Index
                earlierProof.publicOutput.nextKeyIndexRoot.assertEquals(
                    keyIndexWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        UpdateTask.create.name,
                        ErrorEnum.KEY_INDEX_ROOT
                    )
                );
                input.keyIndex.assertEquals(
                    keyIndexWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        UpdateTask.create.name,
                        ErrorEnum.KEY_INDEX_INDEX
                    )
                );

                // Verify empty timestamp
                earlierProof.publicOutput.nextTimestampRoot.assertEquals(
                    timestampWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        UpdateTask.create.name,
                        ErrorEnum.REQUEST_TIMESTAMP_ROOT
                    )
                );
                input.timestamp.value.assertEquals(
                    timestampWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        UpdateTask.create.name,
                        ErrorEnum.REQUEST_TIMESTAMP_INDEX
                    )
                );

                // Calculate new state values
                let nextKeyIndexRoot = keyIndexWitness.calculateRoot(
                    input.keyIndex
                );
                let nextTimestampRoot = timestampWitness.calculateRoot(
                    input.timestamp.value
                );

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return new UpdateTaskOutput({
                    ...earlierProof.publicOutput,
                    ...{ nextActionState, nextKeyIndexRoot, nextTimestampRoot },
                });
            },
        },
        accumulate: {
            privateInputs: [
                SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                Group,
                Group,
                Level1Witness,
                AccumulationWitnesses,
                AccumulationWitnesses,
                CommitmentWitnesses,
            ],

            method(
                input: UpdateTaskInput,
                earlierProof: SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                R: Group,
                M: Group,
                accumulationWitness: Level1Witness,
                accumulationWitnessesR: AccumulationWitnesses,
                accumulationWitnessesM: AccumulationWitnesses,
                commitmentWitnesses: CommitmentWitnesses
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify task Id
                earlierProof.publicOutput.taskId.assertEquals(input.taskId);

                let {
                    nextAccumulationRoot,
                    nextCommitmentCounter,
                    nextCommitmentRoot,
                } = earlierProof.publicOutput;
                for (let i = 0; i < ENCRYPTION_LIMITS.DIMENSION; i++) {
                    let Ri = input.R.get(Field(i));
                    let Mi = input.M.get(Field(i));
                    let commitment = input.commitments.get(Field(i));
                    let accumulationWitnessR = accumulationWitnessesR.get(
                        Field(i)
                    );
                    let accumulationWitnessM = accumulationWitnessesM.get(
                        Field(i)
                    );
                    let commitmentWitness = commitmentWitnesses.get(Field(i));
                    let index = Field.fromBits(
                        input.indexes.toBits().slice(i * 8, (i + 1) * 8)
                    );

                    // Verify accumulation data
                    earlierProof.publicOutput.nextAccumulationRoot.assertEquals(
                        accumulationWitness.calculateRoot(
                            Poseidon.hash([
                                accumulationWitnessR.calculateRoot(
                                    Poseidon.hash(R.toFields())
                                ),
                                accumulationWitnessM.calculateRoot(
                                    Poseidon.hash(M.toFields())
                                ),
                            ])
                        ),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            UpdateTask.accumulate.name,
                            ErrorEnum.ACCUMULATION_ROOT
                        )
                    );
                    input.taskId.value.assertEquals(
                        accumulationWitness.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            UpdateTask.accumulate.name,
                            ErrorEnum.ACCUMULATION_INDEX_L1
                        )
                    );
                    index.assertEquals(
                        accumulationWitnessR.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            UpdateTask.accumulate.name,
                            ErrorEnum.ACCUMULATION_INDEX_L2
                        )
                    );
                    index.assertEquals(
                        accumulationWitnessM.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            UpdateTask.accumulate.name,
                            ErrorEnum.ACCUMULATION_INDEX_L2
                        )
                    );

                    // Verify empty commitment
                    nextCommitmentRoot.assertEquals(
                        commitmentWitness.calculateRoot(Field(0)),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            UpdateTask.accumulate.name,
                            ErrorEnum.COMMITMENT_ROOT
                        )
                    );
                    nextCommitmentCounter.assertEquals(
                        commitmentWitness.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            UpdateTask.accumulate.name,
                            ErrorEnum.COMMITMENT_INDEX
                        )
                    );

                    // Calculate new values
                    R = R.add(Ri);
                    M = M.add(Mi);
                    nextAccumulationRoot = accumulationWitness.calculateRoot(
                        Poseidon.hash([
                            accumulationWitnessR.calculateRoot(
                                Poseidon.hash(R.toFields())
                            ),
                            accumulationWitnessM.calculateRoot(
                                Poseidon.hash(M.toFields())
                            ),
                        ])
                    );
                    nextCommitmentRoot = Provable.if(
                        commitment.equals(Field(0)),
                        nextCommitmentRoot,
                        commitmentWitness.calculateRoot(commitment)
                    );
                    nextCommitmentCounter = Provable.if(
                        commitment.equals(Field(0)),
                        nextCommitmentCounter,
                        nextCommitmentCounter.add(1)
                    );
                }

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return new UpdateTaskOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextActionState,
                        nextAccumulationRoot,
                        nextCommitmentCounter,
                        nextCommitmentRoot,
                        nextTimestamp: input.timestamp,
                    },
                });
            },
        },
    },
});

class UpdateTaskProof extends ZkProgram.Proof(UpdateTask) {}

enum AddressBook {
    TASK_MANAGER,
    SUBMISSION_PROXY,
    DKG,
}

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
     * @description MT storing finalize timestamps for tasks
     */
    @state(Field) timestampRoot = State<Field>();

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
     * @description Timestamp of the latest processed action
     */
    @state(UInt64) lastTimestamp = State<UInt64>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: Action });

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.keyIndexRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.timestampRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.commitmentCounter.set(Field(0));
        this.commitmentRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.lastTimestamp.set(UInt64.zero);
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Initialize new threshold homomorphic encryption request
     * @param keyIndex Unique key index
     */
    @method createTask(
        keyIndex: Field,
        timestamp: UInt64,
        taskManagerRef: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify call from Task Manager Contract
        Utils.requireCaller(taskManagerRef.address, this);
        verifyZkApp(
            RequesterContract.name,
            taskManagerRef,
            zkAppRoot,
            Field(AddressBook.TASK_MANAGER)
        );

        // Create and dispatch action
        let action = new Action({
            ...Action.empty(),
            ...{ taskId: UInt32.MAXINT(), keyIndex, timestamp },
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
     * @param publicKeyWitness Witness for proof of encryption public key
     * @param keyIndexWitness Witness for key index value
     * @param dkg Reference to Dkg Contract
     *
     * @todo Verify dimension value
     */
    @method submitEncryption(
        taskId: UInt32,
        keyIndex: Field,
        secrets: SecretVector,
        randoms: RandomVector,
        indexes: Field,
        nullifiers: NullifierArray,
        publicKey: Group,
        publicKeyWitness: DkgLevel1Witness,
        keyIndexWitness: Level1Witness,
        submissionProxy: ZkAppRef,
        dkg: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let timestamp = this.network.timestamp.getAndRequireEquals();

        // Verify Dkg Contract address
        verifyZkApp(
            RequesterContract.name,
            dkg,
            zkAppRoot,
            Field(AddressBook.DKG)
        );

        // Verify call from Submission Proxy Contract
        Utils.requireCaller(submissionProxy.address, this);
        verifyZkApp(
            RequesterContract.name,
            submissionProxy,
            zkAppRoot,
            Field(AddressBook.SUBMISSION_PROXY)
        );

        const dkgContract = new DkgContract(dkg.address);

        // Verify public key
        dkgContract.verifyKey(keyIndex, publicKey, publicKeyWitness);
        this.verifyKeyIndex(taskId.value, keyIndex, keyIndexWitness);

        // Calculate encryption and commitments
        let R = new RequestVector();
        let M = new RequestVector();
        let commitments = new CommitmentArray();
        for (let i = 0; i < ENCRYPTION_LIMITS.DIMENSION; i++) {
            let index = Field(i);
            let random = randoms.get(index).toScalar();
            let secret = secrets.get(index);
            let nullifier = nullifiers.get(index);
            R.set(index, Group.generator.scale(random));
            M.set(
                index,
                Provable.if(
                    secret.equals(CustomScalar.fromScalar(Scalar.from(0))),
                    Group.zero,
                    Group.generator.scale(secrets.get(Field(i)).toScalar())
                ).add(publicKey.scale(random))
            );
            commitments.set(
                index,
                Provable.if(
                    secret.equals(CustomScalar.fromScalar(Scalar.from(0))),
                    Field(0),
                    Poseidon.hash([nullifier, index, secret.toFields()].flat())
                )
            );
        }

        // Create and dispatch action
        let action = new Action({
            taskId,
            keyIndex,
            timestamp,
            indexes,
            R,
            M,
            commitments,
        });
        this.reducer.dispatch(action);
    }

    /**
     * Accumulate encryption submissions
     * @param proof Verification proof
     */
    @method updateTasks(proof: UpdateTaskProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let keyIndexRoot = this.keyIndexRoot.getAndRequireEquals();
        let timestampRoot = this.timestampRoot.getAndRequireEquals();
        let accumulationRoot = this.accumulationRoot.getAndRequireEquals();
        let commitmentCounter = this.commitmentCounter.getAndRequireEquals();
        let commitmentRoot = this.commitmentRoot.getAndRequireEquals();
        let lastTimestamp = this.lastTimestamp.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        rollup(
            RequesterContract.name,
            proof.publicOutput,
            curActionState,
            lastActionState
        );
        proof.publicOutput.nextKeyIndexRoot.assertEquals(
            keyIndexRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.updateTasks.name,
                ErrorEnum.KEY_INDEX_ROOT
            )
        );
        proof.publicOutput.nextTimestampRoot.assertEquals(
            timestampRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.updateTasks.name,
                ErrorEnum.REQUEST_TIMESTAMP_ROOT
            )
        );
        proof.publicOutput.initialAccumulationRoot.assertEquals(
            accumulationRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.updateTasks.name,
                ErrorEnum.ACCUMULATION_ROOT
            )
        );
        proof.publicOutput.initialCommitmentCounter.assertEquals(
            commitmentCounter,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.updateTasks.name,
                ErrorEnum.COMMITMENT_COUNTER
            )
        );
        proof.publicOutput.initialCommitmentRoot.assertEquals(
            commitmentRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.updateTasks.name,
                ErrorEnum.COMMITMENT_ROOT
            )
        );

        // Update state values
        this.actionState.set(proof.publicOutput.nextActionState);
        this.keyIndexRoot.set(proof.publicOutput.nextKeyIndexRoot);
        this.timestampRoot.set(proof.publicOutput.nextTimestampRoot);
        this.accumulationRoot.set(proof.publicOutput.nextAccumulationRoot);
        this.commitmentCounter.set(proof.publicOutput.nextCommitmentCounter);
        this.commitmentRoot.set(proof.publicOutput.nextCommitmentRoot);
        this.lastTimestamp.set(
            Provable.if(
                proof.publicOutput.nextTimestamp.equals(UInt64.zero),
                lastTimestamp,
                proof.publicOutput.nextTimestamp
            )
        );
    }

    /**
     * Finalize the submission period of a task
     * @param taskId Task Id
     * @param keyIndex Unique key index
     * @param accumulatedR Accumulated R value
     * @param accumulatedM Accumulated M value
     * @param keyIndexWitness Witness for proof of key index value
     * @param accumulationWitness Witness for proof of accumulation data
     * @param request Reference to Request Contract
     */
    @method finalizeTask(
        taskId: UInt32,
        dimension: UInt8,
        keyIndex: Field,
        accumulationRootR: Field,
        accumulationRootM: Field,
        keyIndexWitness: Level1Witness,
        accumulationWitness: Level1Witness,
        request: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Request Contract address
        verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );
        const requestContract = new RequestContract(request.address);

        // Verify taskId
        this.verifyKeyIndex(taskId.value, keyIndex, keyIndexWitness);

        // Verify accumulation data
        this.verifyAccumulationData(
            taskId.value,
            accumulationRootR,
            accumulationRootM,
            accumulationWitness
        );

        // Initialize a request in Request Contract
        requestContract.initialize(
            keyIndex,
            taskId,
            UInt64.from(REQUEST_EXPIRATION),
            Poseidon.hash([
                accumulationRootR,
                accumulationRootM,
                dimension.value,
            ]),
            this.address
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
     * Verify accumulation data
     * @param requestId Request Id
     * @param accumulationRootR Accumulated R value
     * @param accumulationRootM Accumulated M value
     * @param witness Witness for proof of accumulation data
     */
    verifyAccumulationData(
        requestId: Field,
        accumulationRootR: Field,
        accumulationRootM: Field,
        witness: Level1Witness
    ) {
        this.accumulationRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash([accumulationRootR, accumulationRootM])
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
                ErrorEnum.ACCUMULATION_INDEX_L1
            )
        );
    }
}
