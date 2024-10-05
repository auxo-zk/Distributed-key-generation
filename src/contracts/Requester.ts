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
import { AddressMap, ZkAppRef } from '../storages/AddressStorage.js';
import {
    RequesterLevel1Witness,
    REQUESTER_LEVEL_1_TREE,
    RequesterCounters,
    COMMITMENT_TREE,
} from '../storages/RequesterStorage.js';
import { ErrorEnum, ZkAppAction, ZkProgramEnum } from './constants.js';
import { DkgLevel1Witness } from '../storages/DkgStorage.js';
import { DkgContract } from './DKG.js';
import { RequestContract } from './Request.js';
import { CommitmentWitnesses } from '../storages/RequesterStorage.js';
import {
    GroupVector,
    GroupVectorWitnesses,
    REQUEST_LEVEL_2_TREE,
} from '../storages/RequestStorage.js';

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
        timestamp: UInt64,
        keyIndex: Field,
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
            timestamp: UInt64.zero,
            keyIndex: Field(0),
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
    initialActionState: Field,
    initialTaskCounter: UInt32,
    initialKeyIndexRoot: Field,
    initialTimestampRoot: Field,
    initialAccumulationRoot: Field,
    initialCommitmentCounter: UInt64,
    initialCommitmentRoot: Field,
    nextActionState: Field,
    nextTaskCounter: UInt32,
    nextKeyIndexRoot: Field,
    nextTimestampRoot: Field,
    nextAccumulationRoot: Field,
    nextCommitmentCounter: UInt64,
    nextCommitmentRoot: Field,
    nextTimestamp: UInt64,
}) {}

const UpdateTask = ZkProgram({
    name: ZkProgramEnum.UpdateTask,
    publicInput: UpdateTaskInput,
    publicOutput: UpdateTaskOutput,
    methods: {
        init: {
            privateInputs: [Field, UInt32, Field, Field, Field, UInt64, Field],
            async method(
                input: UpdateTaskInput,
                initialActionState: Field,
                initialTaskCounter: UInt32,
                initialKeyIndexRoot: Field,
                initialTimestampRoot: Field,
                initialAccumulationRoot: Field,
                initialCommitmentCounter: UInt64,
                initialCommitmentRoot: Field
            ) {
                return new UpdateTaskOutput({
                    initialActionState,
                    initialTaskCounter,
                    initialKeyIndexRoot,
                    initialTimestampRoot,
                    initialAccumulationRoot,
                    initialCommitmentCounter,
                    initialCommitmentRoot,
                    nextActionState: initialActionState,
                    nextTaskCounter: initialTaskCounter,
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
                RequesterLevel1Witness,
            ],
            async method(
                input: UpdateTaskInput,
                earlierProof: SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                keyIndexWitness: typeof RequesterLevel1Witness,
                timestampWitness: typeof RequesterLevel1Witness,
                accumulationWitness: typeof RequesterLevel1Witness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let taskId = earlierProof.publicOutput.nextTaskCounter;

                // Verify empty key Index
                earlierProof.publicOutput.nextKeyIndexRoot.assertEquals(
                    keyIndexWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
                        ErrorEnum.KEY_INDEX_ROOT
                    )
                );
                taskId.value.assertEquals(
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
                taskId.value.assertEquals(
                    timestampWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
                        ErrorEnum.REQUEST_TIMESTAMP_INDEX
                    )
                );

                // Verify empty accumulation data
                earlierProof.publicOutput.nextAccumulationRoot.assertEquals(
                    accumulationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                taskId.value.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        UpdateTask.name,
                        'create',
                        ErrorEnum.ACCUMULATION_INDEX_L1
                    )
                );

                // Calculate new state values
                let nextTaskCounter = taskId.add(1);
                let nextKeyIndexRoot = keyIndexWitness.calculateRoot(
                    input.keyIndex
                );
                let nextTimestampRoot = timestampWitness.calculateRoot(
                    input.timestamp.value
                );
                let nextAccumulationRoot = accumulationWitness.calculateRoot(
                    Poseidon.hash([
                        REQUEST_LEVEL_2_TREE().getRoot(),
                        REQUEST_LEVEL_2_TREE().getRoot(),
                    ])
                );

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return new UpdateTaskOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextActionState,
                        nextTaskCounter,
                        nextKeyIndexRoot,
                        nextTimestampRoot,
                        nextAccumulationRoot,
                    },
                });
            },
        },
        accumulate: {
            privateInputs: [
                SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                GroupVector,
                GroupVector,
                RequesterLevel1Witness,
                GroupVectorWitnesses,
                GroupVectorWitnesses,
                CommitmentWitnesses,
            ],

            async method(
                input: UpdateTaskInput,
                earlierProof: SelfProof<UpdateTaskInput, UpdateTaskOutput>,
                sumR: GroupVector,
                sumM: GroupVector,
                accumulationWitness: typeof RequesterLevel1Witness,
                accumulationWitnessesR: GroupVectorWitnesses,
                accumulationWitnessesM: GroupVectorWitnesses,
                commitmentWitnesses: CommitmentWitnesses
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let {
                    nextAccumulationRoot,
                    nextCommitmentCounter,
                    nextCommitmentRoot,
                } = earlierProof.publicOutput;
                for (let i = 0; i < ENCRYPTION_LIMITS.DIMENSION; i++) {
                    let sumRi = sumR.get(Field(i));
                    let sumMi = sumM.get(Field(i));
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
                    nextAccumulationRoot.assertEquals(
                        accumulationWitness.calculateRoot(
                            Poseidon.hash([
                                accumulationWitnessR.calculateRoot(
                                    Provable.if(
                                        sumRi.equals(Group.zero),
                                        Field(0),
                                        Poseidon.hash(sumRi.toFields())
                                    )
                                ),
                                accumulationWitnessM.calculateRoot(
                                    Provable.if(
                                        sumMi.equals(Group.zero),
                                        Field(0),
                                        Poseidon.hash(sumMi.toFields())
                                    )
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
                    nextCommitmentCounter.value.assertEquals(
                        commitmentWitness.calculateIndex(),
                        Utils.buildAssertMessage(
                            UpdateTask.name,
                            'accumulate',
                            ErrorEnum.COMMITMENT_INDEX
                        )
                    );

                    // Calculate new values
                    sumRi = sumRi.add(Ri);
                    sumMi = sumMi.add(Mi);
                    sumR.set(Field(i), sumRi);
                    sumM.set(Field(i), sumMi);
                    nextAccumulationRoot = accumulationWitness.calculateRoot(
                        Poseidon.hash([
                            accumulationWitnessR.calculateRoot(
                                Poseidon.hash(sumRi.toFields())
                            ),
                            accumulationWitnessM.calculateRoot(
                                Poseidon.hash(sumMi.toFields())
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
    REQUEST,
}

class RequesterContract extends SmartContract {
    static readonly AddressBook = AddressBook;

    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description
     */
    @state(Field) counters = State<Field>();

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
        this.zkAppRoot.set(new AddressMap().addressMap.getRoot());
        this.counters.set(RequesterCounters.empty().toFields()[0]);
        this.keyIndexRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.timestampRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.commitmentRoot.set(COMMITMENT_TREE().getRoot());
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
        taskManagerRef: InstanceType<typeof ZkAppRef>
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify call from Task Manager Contract
        Utils.requireCaller(taskManagerRef.address, this);
        AddressMap.verifyZkApp(
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
        publicKeyWitness: typeof DkgLevel1Witness,
        keyIndexWitness: typeof RequesterLevel1Witness,
        submission: InstanceType<typeof ZkAppRef>,
        dkg: InstanceType<typeof ZkAppRef>
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        // FIXME - "the permutation was not constructed correctly: final value" error
        // let timestamp = this.network.timestamp.getAndRequireEquals();
        let timestamp = UInt64.from(0);

        // Verify Dkg Contract address
        AddressMap.verifyZkApp(
            RequesterContract.name,
            dkg,
            zkAppRoot,
            Field(RequesterContract.AddressBook.DKG)
        );

        // Verify call from Submission Proxy Contract
        Utils.requireCaller(submission.address, this);
        AddressMap.verifyZkApp(
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
            let random = randoms.get(Field(i));
            let secret = secrets.get(Field(i));
            let nullifier = nullifiers.get(Field(i));
            R.set(Field(i), Group.generator.scale(random));
            M.set(
                Field(i),
                Provable.witness(Group, () =>
                    Provable.if(
                        CustomScalar.fromScalar(secret).equals(
                            CustomScalar.fromScalar(Scalar.from(0))
                        ),
                        Group.zero,
                        Group.generator.scale(secrets.get(Field(i)))
                    ).add(publicKey.scale(random))
                )
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
        let counters = RequesterCounters.fromFields([
            this.counters.getAndRequireEquals(),
        ]);
        let keyIndexRoot = this.keyIndexRoot.getAndRequireEquals();
        let timestampRoot = this.timestampRoot.getAndRequireEquals();
        let accumulationRoot = this.accumulationRoot.getAndRequireEquals();
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
        proof.publicOutput.initialTaskCounter.value.assertEquals(
            counters.taskCounter.value,
            Utils.buildAssertMessage(
                RequesterContract.name,
                'updateTasks',
                ErrorEnum.TASK_COUNTER
            )
        );
        proof.publicOutput.initialKeyIndexRoot.assertEquals(
            keyIndexRoot,
            Utils.buildAssertMessage(
                RequesterContract.name,
                'updateTasks',
                ErrorEnum.KEY_INDEX_ROOT
            )
        );
        proof.publicOutput.initialTimestampRoot.assertEquals(
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
        proof.publicOutput.initialCommitmentCounter.value.assertEquals(
            counters.commitmentCounter.value,
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
        this.counters.set(
            new RequesterCounters({
                taskCounter: proof.publicOutput.nextTaskCounter,
                commitmentCounter: proof.publicOutput.nextCommitmentCounter,
            }).toFields()[0]
        );
        this.keyIndexRoot.set(proof.publicOutput.nextKeyIndexRoot);
        this.timestampRoot.set(proof.publicOutput.nextTimestampRoot);
        this.accumulationRoot.set(proof.publicOutput.nextAccumulationRoot);
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
        keyIndexWitness: typeof RequesterLevel1Witness,
        accumulationWitness: typeof RequesterLevel1Witness,
        request: InstanceType<typeof ZkAppRef>
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Request Contract address
        AddressMap.verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(AddressBook.REQUEST)
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
        witness: typeof RequesterLevel1Witness
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
        witness: typeof RequesterLevel1Witness
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
        witness: typeof RequesterLevel1Witness
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
    async createTask(
        keyIndex: Field,
        timestamp: UInt64,
        selfRef: InstanceType<typeof ZkAppRef>
    ) {
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
        publicKeyWitness: typeof DkgLevel1Witness,
        keyIndexWitness: typeof RequesterLevel1Witness,
        submission: InstanceType<typeof ZkAppRef>,
        dkg: InstanceType<typeof ZkAppRef>
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
