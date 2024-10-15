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
import {
    ENC_LIMITS,
    INST_BIT_LIMITS,
    INST_LIMITS,
    REQUEST_EXPIRATION,
} from '../constants.js';
import { AddressMap, ZkAppRef } from '../storages/AddressStorage.js';
import {
    RequesterLevel1Witness,
    REQUESTER_LEVEL_1_TREE,
    RequesterCounters,
    COMMITMENT_TREE,
} from '../storages/RequesterStorage.js';
import { ErrorEnum, ZkAppAction, ZkProgramEnum } from './constants.js';
import { KeyContract, KeyInput } from './Key.js';
import { RequestContract } from './Request.js';
import { CommitmentWitnesses } from '../storages/RequesterStorage.js';
import {
    GroupVector,
    GroupVectorWitnesses,
    REQUEST_LEVEL_2_TREE,
} from '../storages/RequestStorage.js';
import {
    DimensionFieldArray,
    DimensionGroupArray,
    EncryptionConfig,
    SplitFieldArray,
    SplitGroupArray,
} from '../libs/types.js';
import {
    EmptyCommitmentMT,
    EmptyTaskMT,
    KeyWitness,
} from '../storages/Merklized.js';

export {
    Action as RequesterAction,
    RollupTaskInput,
    RollupTaskOutput,
    RollupTask,
    RollupTaskProof,
    AddressBook as RequesterAddressBook,
    RequesterContract,
    TaskManagerContract,
    SubmissionContract,
};

const { COMMITTEE, KEY, TASK } = INST_BIT_LIMITS;

class Action
    extends Struct({
        packedData: Field,
        commitmentHash: Field,
        R: Group,
        M: Group,
    })
    implements ZkAppAction
{
    static empty(): Action {
        return new Action({
            packedData: Field(0),
            commitmentHash: Field(0),
            R: Group.zero,
            M: Group.zero,
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    static packData(
        blocknumber: UInt32,
        startIndex: UInt8,
        numIndices: UInt8,
        curIndex: UInt8,
        taskId: Field,
        committeeId: Field,
        keyId: Field,
        config: EncryptionConfig
    ): Field {
        return Field.fromBits([
            ...blocknumber.value.toBits(32),
            ...startIndex.value.toBits(8),
            ...numIndices.value.toBits(8),
            ...curIndex.value.toBits(8),
            ...config.toBits(),
            ...taskId.toBits(TASK),
            ...committeeId.toBits(COMMITTEE),
            ...keyId.toBits(KEY),
        ]);
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
    get blocknumber(): UInt32 {
        return UInt32.Unsafe.fromField(
            Field.fromBits(this.packedData.toBits().slice(0, 32))
        );
    }
    get startIndex(): UInt8 {
        return UInt8.Unsafe.fromField(
            Field.fromBits(this.packedData.toBits().slice(32, 40))
        );
    }
    get numIndices(): UInt8 {
        return UInt8.Unsafe.fromField(
            Field.fromBits(this.packedData.toBits().slice(40, 48))
        );
    }
    get curIndex(): UInt8 {
        return UInt8.Unsafe.fromField(
            Field.fromBits(this.packedData.toBits().slice(48, 56))
        );
    }
    get taskId(): UInt32 {
        return UInt32.Unsafe.fromField(
            Field.fromBits(this.packedData.toBits().slice(56, 56 + TASK))
        );
    }
    get committeeId(): Field {
        return Field.fromBits(
            this.packedData.toBits().slice(56 + TASK, 56 + TASK + COMMITTEE)
        );
    }
    get keyId(): Field {
        return Field.fromBits(
            this.packedData
                .toBits()
                .slice(56 + TASK + COMMITTEE, 56 + TASK + COMMITTEE + KEY)
        );
    }
    get config(): EncryptionConfig {
        return EncryptionConfig.fromBits(
            this.packedData
                .toBits()
                .slice(
                    48 + TASK + COMMITTEE + KEY,
                    48 + TASK + COMMITTEE + KEY + EncryptionConfig.sizeInBits()
                )
        );
    }
}

class RollupTaskInput extends Action {}

class RollupTaskOutput extends Struct({
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

const RollupTask = ZkProgram({
    name: ZkProgramEnum.RollupTask,
    publicInput: RollupTaskInput,
    publicOutput: RollupTaskOutput,
    methods: {
        init: {
            privateInputs: [Field, UInt32, Field, Field, Field, UInt64, Field],
            async method(
                input: RollupTaskInput,
                initialActionState: Field,
                initialTaskCounter: UInt32,
                initialKeyIndexRoot: Field,
                initialTimestampRoot: Field,
                initialAccumulationRoot: Field,
                initialCommitmentCounter: UInt64,
                initialCommitmentRoot: Field
            ) {
                return new RollupTaskOutput({
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
                SelfProof<RollupTaskInput, RollupTaskOutput>,
                RequesterLevel1Witness,
                RequesterLevel1Witness,
                RequesterLevel1Witness,
            ],
            async method(
                input: RollupTaskInput,
                earlierProof: SelfProof<RollupTaskInput, RollupTaskOutput>,
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
                        RollupTask.name,
                        'create',
                        ErrorEnum.KEY_INDEX_ROOT
                    )
                );
                taskId.value.assertEquals(
                    keyIndexWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupTask.name,
                        'create',
                        ErrorEnum.KEY_INDEX_INDEX
                    )
                );

                // Verify empty timestamp
                earlierProof.publicOutput.nextTimestampRoot.assertEquals(
                    timestampWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        RollupTask.name,
                        'create',
                        ErrorEnum.REQUEST_TIMESTAMP_ROOT
                    )
                );
                taskId.value.assertEquals(
                    timestampWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupTask.name,
                        'create',
                        ErrorEnum.REQUEST_TIMESTAMP_INDEX
                    )
                );

                // Verify empty accumulation data
                earlierProof.publicOutput.nextAccumulationRoot.assertEquals(
                    accumulationWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        RollupTask.name,
                        'create',
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                taskId.value.assertEquals(
                    accumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupTask.name,
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

                return new RollupTaskOutput({
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
                SelfProof<RollupTaskInput, RollupTaskOutput>,
                GroupVector,
                GroupVector,
                RequesterLevel1Witness,
                GroupVectorWitnesses,
                GroupVectorWitnesses,
                CommitmentWitnesses,
            ],

            async method(
                input: RollupTaskInput,
                earlierProof: SelfProof<RollupTaskInput, RollupTaskOutput>,
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
                for (let i = 0; i < ENC_LIMITS.DIMENSION; i++) {
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
                            RollupTask.name,
                            'accumulate',
                            ErrorEnum.ACCUMULATION_ROOT
                        )
                    );
                    input.taskId.value.assertEquals(
                        accumulationWitness.calculateIndex(),
                        Utils.buildAssertMessage(
                            RollupTask.name,
                            'accumulate',
                            ErrorEnum.ACCUMULATION_INDEX_L1
                        )
                    );
                    index.assertEquals(
                        accumulationWitnessR.calculateIndex(),
                        Utils.buildAssertMessage(
                            RollupTask.name,
                            'accumulate',
                            ErrorEnum.ACCUMULATION_INDEX_L2
                        )
                    );
                    index.assertEquals(
                        accumulationWitnessM.calculateIndex(),
                        Utils.buildAssertMessage(
                            RollupTask.name,
                            'accumulate',
                            ErrorEnum.ACCUMULATION_INDEX_L2
                        )
                    );

                    // Verify empty commitment
                    nextCommitmentRoot.assertEquals(
                        commitmentWitness.calculateRoot(Field(0)),
                        Utils.buildAssertMessage(
                            RollupTask.name,
                            'accumulate',
                            ErrorEnum.COMMITMENT_ROOT
                        )
                    );
                    nextCommitmentCounter.value.assertEquals(
                        commitmentWitness.calculateIndex(),
                        Utils.buildAssertMessage(
                            RollupTask.name,
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

                return new RollupTaskOutput({
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

class RollupTaskProof extends ZkProgram.Proof(RollupTask) {}

enum AddressBook {
    TASK_MANAGER,
    SUBMISSION,
    KEY,
    REQUEST,
}

class RequesterContract extends SmartContract {
    static readonly AddressBook = AddressBook;

    /**
     * Slot 0
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * Slot 1
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>(Reducer.initialActionState);

    /**
     * Slot 2
     * @description Packed counters
     */
    @state(Field) counters = State<Field>(Field(0));

    /**
     * Slot 3
     * @description MT storing corresponding keys
     * @see RequesterKeyIndexStorage for off-chain storage implementation
     */
    @state(Field) keyIndexRoot = State<Field>(EmptyTaskMT().getRoot());

    /**
     * Slot 4
     * @description MT storing finalize blocknumber for tasks
     * @see BlocknumberStorage for off-chain storage implementation
     */
    @state(Field) blocknumberRoot = State<Field>(EmptyTaskMT().getRoot());

    /**
     * Slot 5
     * @description MT storing latest accumulation data Hash(R | M)
     * @see RequesterAccumulationStorage for off-chain storage implementation
     */
    @state(Field) accumulationRoot = State<Field>(EmptyTaskMT().getRoot());

    /**
     * Slot 6
     * @description MT storing anonymous commitments
     * @see CommitmentStorage for off-chain storage implementation
     */
    @state(Field) commitmentRoot = State<Field>(EmptyCommitmentMT().getRoot());

    /**
     * Slot 7
     * @description Timestamp of the latest processed action
     */
    @state(UInt64) lastTimestamp = State<UInt32>(UInt32.zero);

    reducer = Reducer({ actionType: Action });

    /**
     * Initialize new threshold homomorphic encryption request
     * @param keyIndex Unique key index
     */
    @method
    async createTask(
        config: EncryptionConfig,
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        taskManagerRef: ZkAppRef
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

        // Verify config
        config.assertCorrect();

        // Verify deadline
        this.network.blockchainLength.getAndRequireEquals().lessThan(deadline);

        // Create and dispatch action
        let action = new Action({
            packedData: Action.packData(
                deadline,
                UInt8.from(0),
                UInt8.from(0),
                Field(INST_LIMITS.TASK),
                committeeId,
                keyId,
                config
            ),
            commitmentHash: Field(0),
            R: Group.zero,
            M: Group.zero,
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
        config: EncryptionConfig,
        taskId: Field,
        committeeId: Field,
        keyId: Field,
        startIndex: UInt8,
        numIndices: UInt8,
        secrets: DimensionFieldArray,
        randoms: DimensionFieldArray,
        nullifiers: DimensionFieldArray,
        encKey: Group,
        encKeyWitness: KeyWitness,
        submission: ZkAppRef,
        key: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        // FIXME - "the permutation was not constructed correctly: final value" error
        // let timestamp = this.network.timestamp.getAndRequireEquals();
        let blocknumber = this.network.blockchainLength.getAndRequireEquals();

        // Verify Dkg Contract address
        AddressMap.verifyZkApp(
            RequesterContract.name,
            key,
            zkAppRoot,
            Field(RequesterContract.AddressBook.KEY)
        );

        // Verify call from Submission Proxy Contract
        Utils.requireCaller(submission.address, this);
        AddressMap.verifyZkApp(
            RequesterContract.name,
            submission,
            zkAppRoot,
            Field(RequesterContract.AddressBook.SUBMISSION)
        );

        const keyContract = new KeyContract(key.address);

        // Verify public key
        keyContract.verifyKey(
            new KeyInput({
                committeeId,
                keyId,
                key: encKey,
                witness: encKeyWitness,
            })
        );
        // this.verifyKeyIndex(taskId.value, keyIndex, keyIndexWitness);

        // Calculate encryption and commitments
        let RArr = new SplitGroupArray();
        let MArr = new SplitGroupArray();
        let commitments = new SplitFieldArray();
        let index = startIndex;
        let splitSize = UInt8.from(config.splitSize);
        Utils.divExact(startIndex.value, config.c.value).assertTrue();
        Utils.divExact(numIndices.value, config.splitSize).assertTrue();
        for (let i = 0; i < ENC_LIMITS.SPLIT; i++) {
            let inRangeI = index.lessThan(numIndices);
            let { quotient, remainder } = index.divMod(splitSize);
            let R = Group.zero;
            let M = Group.zero;
            for (let j = 0; j < ENC_LIMITS.SPLIT_SIZE; j++) {
                let random = randoms.get(Field(i));
                let secret = secrets.get(Field(i));
                let nullifier = nullifiers.get(Field(i));
                let inRangeJ = Field(j).lessThan(config.splitSize).toField();
                R = R.add(Group.generator.scale(random));
                M = M.add(
                    Group.generator
                        .scale(secret.mul(Field(config.base.toBigInt() ** j)))
                        .add(encKey.scale(random))
                );
                index = startIndex.add(UInt8.Unsafe.fromField(inRangeJ));
            }
            RArr.set(Field(i), Group.generator.scale(random));
            MArr.set(
                Field(i),
                Group.generator.scale(secret.mul()).add(publicKey.scale(random))
                // Provable.witness(Group, () =>
                //     Provable.if(
                //         CustomScalar.fromScalar(secret).equals(
                //             CustomScalar.fromScalar(Scalar.from(0))
                //         ),
                //         Group.zero,
                //         Group.generator.scale(secrets.get(Field(i)))
                //     ).add(publicKey.scale(random))
                // )
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
    async updateTasks(proof: RollupTaskProof) {
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
        request: ZkAppRef
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
        publicKeyWitness: typeof DkgLevel1Witness,
        keyIndexWitness: typeof RequesterLevel1Witness,
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
