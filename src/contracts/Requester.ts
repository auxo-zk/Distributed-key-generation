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
    PublicKey,
} from 'o1js';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import { ENCRYPTION_LIMITS, REQUEST_EXPIRATION } from '../constants.js';
import {
    CommitmentArray,
    NullifierArray,
    RandomVector,
    RequestVector,
    SecretVector,
    calculateCommitment,
} from '../libs/Requester.js';
import { rollup } from './Rollup.js';
import {
    ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from '../storages/AddressStorage.js';
import {
    RequesterLevel1Witness,
    REQUESTER_LEVEL_1_TREE,
} from '../storages/RequesterStorage.js';
import {
    ErrorEnum,
    ZkAppAction,
    ZkAppIndex,
    ZkProgramEnum,
} from './constants.js';
import { DkgLevel1Witness } from '../storages/DkgStorage.js';
import { DkgContract } from './DKG.js';
import { RequestContract } from './Request.js';
import { CommitmentWitnesses } from '../storages/RequesterStorage.js';
import { GroupVectorWitnesses } from '../storages/RequestStorage.js';

export {
    Action as RequesterAction,
    UpdateTaskInput,
    UpdateTaskOutput,
    UpdateTask,
    UpdateTaskProof,
    AddressBook as RequesterAddressBook,
    RequesterContract,
    TaskManagerContract,
    SubmissionContract,
};

class Action
    extends Struct({
        taskId: UInt32,
        keyIndex: Field,
        timestamp: UInt64,
        indices: Field,
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
            indices: Field(0),
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
            async method(
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
                RequesterLevel1Witness,
                RequesterLevel1Witness,
            ],
            async method(
                input: UpdateTaskInput,
                earlierProof: SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                keyIndexWitness: RequesterLevel1Witness,
                timestampWitness: RequesterLevel1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify empty key Index
                earlierProof.publicOutput.nextKeyIndexRoot.assertEquals(
                    keyIndexWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
                        ErrorEnum.KEY_INDEX_ROOT
                    )
                );
                input.taskId.value.assertEquals(
                    keyIndexWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
                        ErrorEnum.KEY_INDEX_INDEX
                    )
                );

                // Verify empty timestamp
                earlierProof.publicOutput.nextTimestampRoot.assertEquals(
                    timestampWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
                        ErrorEnum.REQUEST_TIMESTAMP_ROOT
                    )
                );
                input.taskId.value.assertEquals(
                    timestampWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
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
                RequesterLevel1Witness,
                GroupVectorWitnesses,
                GroupVectorWitnesses,
                CommitmentWitnesses,
            ],

            async method(
                input: UpdateTaskInput,
                earlierProof: SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                R: Group,
                M: Group,
                accumulationWitness: RequesterLevel1Witness,
                accumulationWitnessesR: GroupVectorWitnesses,
                accumulationWitnessesM: GroupVectorWitnesses,
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
                        input.indices.toBits().slice(i * 8, (i + 1) * 8)
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
                            'accumulate',
                            ErrorEnum.ACCUMULATION_ROOT
                        )
                    );
                    input.taskId.value.assertEquals(
                        accumulationWitness.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            'accumulate',
                            ErrorEnum.ACCUMULATION_INDEX_L1
                        )
                    );
                    index.assertEquals(
                        accumulationWitnessR.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            'accumulate',
                            ErrorEnum.ACCUMULATION_INDEX_L2
                        )
                    );
                    index.assertEquals(
                        accumulationWitnessM.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            'accumulate',
                            ErrorEnum.ACCUMULATION_INDEX_L2
                        )
                    );

                    // Verify empty commitment
                    nextCommitmentRoot.assertEquals(
                        commitmentWitness.calculateRoot(Field(0)),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            'accumulate',
                            ErrorEnum.COMMITMENT_ROOT
                        )
                    );
                    nextCommitmentCounter.assertEquals(
                        commitmentWitness.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            'accumulate',
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
                    nextCommitmentRoot =
                        commitmentWitness.calculateRoot(commitment);
                    nextCommitmentCounter = nextCommitmentCounter.add(1);
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
    SUBMISSION,
    DKG,
}

class RequesterContract extends SmartContract {
    static readonly AddressBook = AddressBook;

    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description MT storing corresponding keys
     * @see RequesterKeyIndexStorage for off-chain storage implementation
     */
    @state(Field) keyIndexRoot = State<Field>();

    /**
     * @description MT storing finalize timestamps for tasks
     * @see TimestampStorage for off-chain storage implementation
     */
    @state(Field) timestampRoot = State<Field>();

    /**
     * @description MT storing latest accumulation data Hash(R | M)
     * @see RequesterAccumulationStorage for off-chain storage implementation
     */
    @state(Field) accumulationRoot = State<Field>();

    /**
     * @description Total number of commitments recorded
     */
    @state(Field) commitmentCounter = State<Field>();

    /**
     * @description MT storing anonymous commitments
     * @see CommitmentStorage for off-chain storage implementation
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
        this.zkAppRoot.set(ADDRESS_MT().getRoot());
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
    @method
    async createTask(
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
            Field(RequesterContract.AddressBook.TASK_MANAGER)
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
     */
    @method
    async submitEncryption(
        taskId: UInt32,
        keyIndex: Field,
        secrets: SecretVector,
        randoms: RandomVector,
        indices: Field,
        nullifiers: NullifierArray,
        publicKey: Group,
        publicKeyWitness: DkgLevel1Witness,
        keyIndexWitness: RequesterLevel1Witness,
        submission: ZkAppRef,
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
            Field(RequesterContract.AddressBook.DKG)
        );

        // Verify call from Submission Proxy Contract
        Utils.requireCaller(submission.address, this);
        verifyZkApp(
            RequesterContract.name,
            submission,
            zkAppRoot,
            Field(RequesterContract.AddressBook.SUBMISSION)
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
            let index = Field.fromBits(
                indices.toBits().slice(i * 8, (i + 1) * 8)
            );
            let random = randoms.get(Field(i)).toScalar();
            let secret = secrets.get(Field(i));
            let nullifier = nullifiers.get(Field(i));
            R.set(Field(i), Group.generator.scale(random));
            M.set(
                Field(i),
                Provable.if(
                    secret.equals(CustomScalar.fromScalar(Scalar.from(0))),
                    Group.zero,
                    Group.generator.scale(secrets.get(Field(i)).toScalar())
                ).add(publicKey.scale(random))
            );
            commitments.set(
                Field(i),
                calculateCommitment(
                    nullifier,
                    taskId,
                    UInt8.from(index),
                    secret
                )
            );
        }

        // Create and dispatch action
        let action = new Action({
            taskId,
            keyIndex,
            timestamp,
            indices,
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
    @method
    async updateTasks(proof: UpdateTaskProof) {
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
                'updateTasks',
                ErrorEnum.KEY_INDEX_ROOT
            )
        );
        proof.publicOutput.nextTimestampRoot.assertEquals(
            timestampRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                'updateTasks',
                ErrorEnum.REQUEST_TIMESTAMP_ROOT
            )
        );
        proof.publicOutput.initialAccumulationRoot.assertEquals(
            accumulationRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                'updateTasks',
                ErrorEnum.ACCUMULATION_ROOT
            )
        );
        proof.publicOutput.initialCommitmentCounter.assertEquals(
            commitmentCounter,
            Utils.buildAssertMessage(
                RequesterContract.name,
                'updateTasks',
                ErrorEnum.COMMITMENT_COUNTER
            )
        );
        proof.publicOutput.initialCommitmentRoot.assertEquals(
            commitmentRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                'updateTasks',
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
    @method
    async finalizeTask(
        taskId: UInt32,
        dimension: UInt8,
        keyIndex: Field,
        accumulationRootR: Field,
        accumulationRootM: Field,
        keyIndexWitness: RequesterLevel1Witness,
        accumulationWitness: RequesterLevel1Witness,
        request: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Request Contract address
        verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
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
        await requestContract.initialize(
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
    verifyKeyIndex(
        taskId: Field,
        keyIndex: Field,
        witness: RequesterLevel1Witness
    ) {
        this.keyIndexRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(keyIndex),
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    'verifyKeyIndex',
                    ErrorEnum.KEY_INDEX_ROOT
                )
            );
        taskId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                'verifyKeyIndex',
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
        witness: RequesterLevel1Witness
    ) {
        this.accumulationRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(
                    Poseidon.hash([accumulationRootR, accumulationRootM])
                ),
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    'verifyAccumulationData',
                    ErrorEnum.ACCUMULATION_ROOT
                )
            );
        requestId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                'verifyAccumulationData',
                ErrorEnum.ACCUMULATION_INDEX_L1
            )
        );
    }

    verifyCommitment(
        index: Field,
        commitment: Field,
        witness: RequesterLevel1Witness
    ) {
        this.commitmentRoot
            .getAndRequireEquals()
            .assertEquals(
                witness.calculateRoot(commitment),
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    'verifyCommitment',
                    ErrorEnum.COMMITMENT_ROOT
                )
            );

        index.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                'verifyCommitment',
                ErrorEnum.COMMITMENT_INDEX
            )
        );
    }
}

class TaskManagerContract extends SmartContract {
    @state(PublicKey) requesterAddress = State<PublicKey>();

    init() {
        super.init();
    }

    @method
    async createTask(keyIndex: Field, timestamp: UInt64, selfRef: ZkAppRef) {
        let requesterContract = new RequesterContract(
            this.requesterAddress.getAndRequireEquals()
        );
        await requesterContract.createTask(keyIndex, timestamp, selfRef);
    }
}

class SubmissionContract extends SmartContract {
    @state(PublicKey) requesterAddress = State<PublicKey>();

    init() {
        super.init();
    }

    @method
    async submitEncryption(
        taskId: UInt32,
        keyIndex: Field,
        secrets: SecretVector,
        randoms: RandomVector,
        indices: Field,
        nullifiers: NullifierArray,
        publicKey: Group,
        publicKeyWitness: DkgLevel1Witness,
        keyIndexWitness: RequesterLevel1Witness,
        submission: ZkAppRef,
        dkg: ZkAppRef
    ) {
        let requesterContract = new RequesterContract(
            this.requesterAddress.getAndRequireEquals()
        );
        await requesterContract.submitEncryption(
            taskId,
            keyIndex,
            secrets,
            randoms,
            indices,
            nullifiers,
            publicKey,
            publicKeyWitness,
            keyIndexWitness,
            submission,
            dkg
        );
    }
}
