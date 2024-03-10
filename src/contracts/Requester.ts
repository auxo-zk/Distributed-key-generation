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
    Void,
    Scalar,
    UInt64,
    PublicKey,
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

import { CommitteeContract } from './Committee.js';
import { RequestContract } from './Request.js';
import {
    Level1Witness as DkgLevel1Witness,
    calculateKeyIndex,
} from '../storages/DKGStorage.js';
import { DkgContract, KeyStatus, KeyStatusInput } from './DKG.js';

export {
    Action as RequesterAction,
    AttachRequestOutput,
    AttachRequest,
    AttachRequestProof,
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

class AttachRequestOutput extends Struct({
    taskCounter: Field,
    initialRequestIdRoot: Field,
    nextRequestIdRoot: Field,
}) {}

const AttachRequest = ZkProgram({
    name: ZkProgramEnum.AttachRequest,
    publicOutput: AttachRequestOutput,
    methods: {
        init: {
            privateInputs: [Field, Field],
            method(taskCounter: Field, initialRequestIdRoot: Field) {
                return new AttachRequestOutput({
                    taskCounter: taskCounter,
                    initialRequestIdRoot: initialRequestIdRoot,
                    nextRequestIdRoot: initialRequestIdRoot,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<Void, AttachRequestOutput>,
                Field,
                Field,
                Level1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, AttachRequestOutput>,
                taskId: Field,
                requestId: Field,
                witness: Level1Witness
            ) {
                // Verify this task has not been attached with another request
                earlierProof.publicOutput.nextRequestIdRoot.assertEquals(
                    witness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        AttachRequest.name,
                        AttachRequest.nextStep.name,
                        ErrorEnum.REQUEST_ID_ROOT
                    )
                );

                // Verify a request has been initialized for this task
                earlierProof.publicOutput.taskCounter.assertGreaterThan(
                    taskId,
                    Utils.buildAssertMessage(
                        AttachRequest.name,
                        AttachRequest.nextStep.name,
                        ErrorEnum.REQUEST_ID_INDEX
                    )
                );
                taskId.assertEquals(
                    witness.calculateIndex(),
                    Utils.buildAssertMessage(
                        AttachRequest.name,
                        AttachRequest.nextStep.name,
                        ErrorEnum.REQUEST_ID_INDEX
                    )
                );

                let nextRequestIdRoot = witness.calculateRoot(requestId);

                return new AttachRequestOutput({
                    taskCounter: earlierProof.publicOutput.taskCounter,
                    initialRequestIdRoot:
                        earlierProof.publicOutput.initialRequestIdRoot,
                    nextRequestIdRoot: nextRequestIdRoot,
                });
            },
        },
    },
});

class AttachRequestProof extends ZkProgram.Proof(AttachRequest) {}

class AccumulateEncryptionInput extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

class AccumulateEncryptionOutput extends Struct({
    address: PublicKey,
    rollupRoot: Field,
    requestId: Field,
    initialCommitmentRoot: Field,
    initialProcessRoot: Field,
    nextCommitmentRoot: Field,
    nextProcessRoot: Field,
    sumR: RequestVector,
    sumM: RequestVector,
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
                RequestVector,
                RequestVector,
            ],
            method(
                input: AccumulateEncryptionInput,
                address: PublicKey,
                requestId: Field,
                rollupRoot: Field,
                initialCommitmentRoot: Field,
                initialProcessRoot: Field,
                dimension: Field,
                sumR: RequestVector,
                sumM: RequestVector
            ) {
                sumR.length.assertEquals(
                    dimension,
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.init.name,
                        ErrorEnum.REQUEST_VECTOR_DIM
                    )
                );
                sumM.length.assertEquals(
                    dimension,
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.init.name,
                        ErrorEnum.REQUEST_VECTOR_DIM
                    )
                );
                return new AccumulateEncryptionOutput({
                    address,
                    requestId,
                    rollupRoot,
                    initialCommitmentRoot,
                    initialProcessRoot,
                    nextCommitmentRoot: initialCommitmentRoot,
                    nextProcessRoot: initialProcessRoot,
                    sumR,
                    sumM,
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
                requestIdWitness: Level1Witness,
                commitmentWitness: Level1Witness,
                rollupWitness: ActionWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let requestId = requestIdWitness.calculateIndex();

                requestId.assertEquals(
                    earlierProof.publicOutput.requestId,
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.accumulate.name,
                        ErrorEnum.REQUEST_ID
                    )
                );

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

                return new AccumulateEncryptionOutput({
                    address: earlierProof.publicOutput.address,
                    requestId: earlierProof.publicOutput.requestId,
                    rollupRoot: earlierProof.publicOutput.rollupRoot,
                    initialProcessRoot:
                        earlierProof.publicOutput.initialProcessRoot,
                    nextProcessRoot: nextProcessRoot,
                    sumR: sumR,
                    sumM: sumM,
                    processedActions: processedActions,
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
     * @param keyId Committee's key Id
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
     * @param secrets
     * @param randoms
     * @param nullifiers
     * @param publicKey
     * @param publicKeyWitness
     * @param keyIndexWitness
     * @param startTimestamp
     * @param endTimestamp
     * @param periodWitness
     * @param dkg
     * @param rollup
     *
     * @todo Verify dimension
     * @todo Verify encryption key
     */
    @method submit(
        secrets: SecretVector,
        randoms: RandomVector,
        nullifiers: NullifierArray,
        publicKey: Group,
        publicKeyWitness: DkgLevel1Witness,
        keyIndexWitness: Level1Witness,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        periodWitness: Level1Witness,
        dkg: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let timestamp = this.network.timestamp.getAndRequireEquals();

        let taskId = keyIndexWitness.calculateIndex();
        let keyIndex = publicKeyWitness.calculateIndex();
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
        // dkgContract.verifyKey();
        this.verifyKeyIndex(taskId, keyIndex, keyIndexWitness);

        // Verify submission period
        timestamp.assertGreaterThanOrEqual(startTimestamp);
        timestamp.assertLessThanOrEqual(endTimestamp);
        this.verifyTaskPeriod(
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

    @method accumulate(
        proof: AccumulateEncryptionProof,
        keyIndex: Field,
        keyIndexWitness: Level1Witness,
        request: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let taskId = keyIndexWitness.calculateIndex();

        // Verify Request Contract address
        verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );

        // Verify Rollup Contract address
        verifyZkApp(
            RequesterContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );

        const requestContract = new RequestContract(request.address);
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

        // Verify task's key index
        this.verifyKeyIndex(
            proof.publicInput.action.taskId,
            keyIndex,
            keyIndexWitness
        );

        // Initialize a request in Request Contract
        requestContract.initialize(
            taskId,
            keyIndex,
            this.address,
            proof.publicOutput.sumR,
            proof.publicOutput.sumM,
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

    verifyTaskPeriod(
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
                    RequesterContract.prototype.verifyTaskPeriod.name,
                    ErrorEnum.REQUEST_PERIOD_ROOT
                )
            );
        taskId.assertEquals(
            witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.verifyTaskPeriod.name,
                ErrorEnum.REQUEST_PERIOD_INDEX
            )
        );
    }
}
