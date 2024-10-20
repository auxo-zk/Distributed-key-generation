import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Group,
    Reducer,
    Struct,
    UInt32,
    PublicKey,
    Poseidon,
    UInt64,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { ENC_LIMITS, INST_LIMITS, NETWORK_LIMITS } from '../../constants.js';
import { ErrorEnum, EventEnum } from '../constants.js';
import { KeyContract, KeyInput } from '../key/index.js';
import { RequestContract } from '../request/index.js';
import { RequesterCounters, InfoStorage } from './storages.js';
import {
    SubVectorFieldArray,
    EncryptionConfig,
    SecretNote,
    EncryptionIndices,
} from '../../libs/types.js';
import {
    AddressMap,
    ZkAppRef,
    EmptyCommitmentMT,
    EmptyTaskMT,
    KeyWitness,
    TaskWitness,
    CommitmentWitness,
} from '../../merklized.js';
import { Action } from './actions.js';
import { RollupTaskProof } from './programs.js';

export {
    InfoInput,
    AccumulationInput,
    CommitmentInput,
    AddressBook,
    RequesterContract,
    TaskManagerContract,
    SubmissionContract,
};

enum AddressBook {
    TASK_MANAGER,
    SUBMISSION,
    KEY,
    REQUEST,
}

class InfoInput extends Struct({
    taskId: Field,
    committeeId: Field,
    keyId: Field,
    deadline: UInt32,
    config: EncryptionConfig,
    witness: TaskWitness,
}) {}

class AccumulationInput extends Struct({
    taskId: Field,
    rAccumulationRoot: Field,
    mAccumulationRoot: Field,
    rWitness: TaskWitness,
    mWitness: TaskWitness,
}) {}

class CommitmentInput extends Struct({
    index: Field,
    commitment: Field,
    witness: CommitmentWitness,
}) {}

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
     * @description Packed counters = { lastBlocknumber, taskCounter, commitmentCounter }
     */
    @state(Field) counters = State<Field>(Field(0));

    /**
     * Slot 3
     * @description MT storing corresponding keys
     * @see InfoStorage for off-chain storage implementation
     */
    @state(Field) infoRoot = State<Field>(EmptyTaskMT().getRoot());

    /**
     * Slot 4
     * @description MT storing latest accumulation of Rs and Ms
     * @see AccumulationStorage for off-chain storage implementation
     */
    @state(Field) accumulationRootsHash = State<Field>(
        Poseidon.hash([EmptyTaskMT().getRoot(), EmptyTaskMT().getRoot()])
    );

    /**
     * Slot 5
     * @description MT storing anonymous commitments
     * @see CommitmentStorage for off-chain storage implementation
     */
    @state(Field) commitmentRoot = State<Field>(EmptyCommitmentMT().getRoot());

    reducer = Reducer({ actionType: Action });
    events = {
        [EventEnum.ROLLUPED]: Field,
    };

    /**
     * Initialize new threshold homomorphic encryption request
     * @param committeeId Committee Id
     * @param keyId Key Id
     * @param deadline Deadline blocknumber
     * @param config Encryption configuration
     * @param taskManagerRef Reference to Task Manager Contract
     */
    @method
    async createTask(
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        config: EncryptionConfig,
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
                Field(0),
                Field(INST_LIMITS.TASK),
                committeeId,
                keyId,
                config
            ),
            commitment: Field(0),
            R: Group.zero,
            M: Group.zero,
        });
        this.reducer.dispatch(action);
    }

    /**
     * Submit encryption vector
     * @param note Encryption note
     * @param secrets Secret values to be encrypted
     * @param randoms Random values for encryption
     * @param nullifiers Nullifier values for anonymous commitments
     * @param taskId Task Id
     * @param committeeId Committee Id
     * @param keyId Key Id
     * @param deadline Deadline blocknumber
     * @param config Encryption configuration
     * @param infoWitness Witness for proof of info data
     * @param encKey Encryption key
     * @param encKeyWitness Witness for proof of encryption public key
     * @param submission Reference to Submission Proxy Contract
     * @param key Reference to Key Contract
     */
    @method
    async submitEncryption(
        indices: EncryptionIndices,
        secrets: SubVectorFieldArray,
        randoms: SubVectorFieldArray,
        nullifiers: SubVectorFieldArray,
        taskId: Field,
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        config: EncryptionConfig,
        infoWitness: TaskWitness,
        encKey: Group,
        encKeyWitness: KeyWitness,
        submission: ZkAppRef,
        key: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let blocknumber = this.network.blockchainLength.getAndRequireEquals();

        // Verify Key Contract address
        AddressMap.verifyZkApp(
            RequesterContract.name,
            key,
            zkAppRoot,
            Field(RequesterContract.AddressBook.KEY)
        );
        const keyContract = new KeyContract(key.address);

        // Verify call from Submission Proxy Contract
        Utils.requireCaller(submission.address, this);
        AddressMap.verifyZkApp(
            RequesterContract.name,
            submission,
            zkAppRoot,
            Field(RequesterContract.AddressBook.SUBMISSION)
        );

        // Verify public key
        keyContract.verifyKey(
            new KeyInput({
                committeeId,
                keyId,
                key: encKey,
                witness: encKeyWitness,
            })
        );
        this.verifyInfo(
            new InfoInput({
                taskId,
                committeeId,
                keyId,
                deadline,
                config,
                witness: infoWitness,
            })
        );

        // Verify deadline has not passed
        blocknumber.assertLessThanOrEqual(deadline);

        // Verify encryption note
        for (let i = 0; i < ENC_LIMITS.SUB_DIMENSION; i++) {
            let iField = Field(i);
            let index = indices.get(iField);
            let secret = secrets.get(iField);
            let random = randoms.get(iField);
            let nullifier = nullifiers.get(iField);
            let R = Group.generator.scale(random);
            let M = Group.generator.scale(secret).add(encKey.scale(random));
            let commitment = SecretNote.calculateCommitment(
                this.address,
                nullifier,
                taskId,
                iField,
                secret
            );
            let packedData = Action.packData(
                blocknumber,
                index,
                taskId,
                committeeId,
                keyId,
                config
            );
            let action = new Action({ packedData, commitment, R, M });
            this.reducer.dispatch(action);
        }
    }

    /**
     * Accumulate encryption submissions
     * @param proof Verification proof
     */
    @method
    async rollup(proof: RollupTaskProof) {
        // Verify proof
        proof.verify();

        // Get on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();
        let counters = RequesterCounters.fromFields([
            this.counters.getAndRequireEquals(),
        ]);
        let infoRoot = this.infoRoot.getAndRequireEquals();
        let accumulationRootsHash =
            this.accumulationRootsHash.getAndRequireEquals();
        let commitmentRoot = this.commitmentRoot.getAndRequireEquals();

        // Update action state
        Utils.assertRollupActions(
            proof.publicOutput,
            curActionState,
            lastActionState,
            this.reducer.getActions({
                fromActionState: curActionState,
            }),
            NETWORK_LIMITS.ROLLUP_ACTIONS
        );
        this.actionState.set(proof.publicOutput.nextActionState);

        // Update on-chain states
        Utils.assertRollupFields(
            [
                proof.publicOutput.initialBlocknumber.value,
                proof.publicOutput.initialTaskCounter.value,
                proof.publicOutput.initialCommitmentCounter.value,
                proof.publicOutput.initialInfoRoot,
                proof.publicOutput.initialAccumulationRootsHash,
                proof.publicOutput.initialCommitmentRoot,
            ],
            [
                counters.lastBlocknumber.value,
                counters.taskCounter.value,
                counters.commitmentCounter.value,
                infoRoot,
                accumulationRootsHash,
                commitmentRoot,
            ],
            6
        );
        this.counters.set(
            new RequesterCounters({
                lastBlocknumber: proof.publicOutput.nextBlocknumber,
                taskCounter: proof.publicOutput.nextTaskCounter,
                commitmentCounter: proof.publicOutput.nextCommitmentCounter,
            }).toFields()[0]
        );
        this.infoRoot.set(proof.publicOutput.nextInfoRoot);
        this.accumulationRootsHash.set(
            proof.publicOutput.nextAccumulationRootsHash
        );
        this.commitmentRoot.set(proof.publicOutput.nextCommitmentRoot);
        this.emitEvent(EventEnum.ROLLUPED, proof.publicOutput.nextActionState);
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
        rAccumulationRoot: Field,
        mAccumulationRoot: Field,
        responseDeadline: UInt32,
        taskId: Field,
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        config: EncryptionConfig,
        fee: UInt64,
        infoWitness: TaskWitness,
        rAccumulationWitness: TaskWitness,
        mAccumulationWitness: TaskWitness,
        keyFeeWitness: KeyWitness,
        key: ZkAppRef,
        request: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let blocknumber = this.network.blockchainLength.getAndRequireEquals();
        let lastBlocknumber = RequesterCounters.fromFields([
            this.counters.getAndRequireEquals(),
        ]).lastBlocknumber;
        lastBlocknumber.assertLessThan(blocknumber);

        // Verify Request Contract address
        AddressMap.verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(AddressBook.REQUEST)
        );
        const requestContract = new RequestContract(request.address);

        // Verify taskId
        this.verifyInfo(
            new InfoInput({
                taskId,
                committeeId,
                keyId,
                deadline,
                config,
                witness: infoWitness,
            })
        );

        // Verify accumulation data
        this.verifyAccumulationData(
            new AccumulationInput({
                taskId,
                rAccumulationRoot,
                mAccumulationRoot,
                rWitness: rAccumulationWitness,
                mWitness: mAccumulationWitness,
            })
        );

        // Initialize a request in Request Contract
        await requestContract.initialize(
            committeeId,
            keyId,
            blocknumber.add(responseDeadline),
            taskId,
            this.address,
            config.d,
            rAccumulationRoot,
            mAccumulationRoot,
            fee,
            keyFeeWitness,
            key
        );
    }

    // @method
    // async deleteCommitments(nullifiers) {}

    // @method
    // async abortTask(taskId) {}

    verifyInfo(input: InfoInput) {
        this.infoRoot.getAndRequireEquals().assertEquals(
            input.witness.calculateRoot(
                InfoStorage.calculateLeaf({
                    committeeId: input.committeeId,
                    keyId: input.keyId,
                    deadline: input.deadline,
                    config: input.config as EncryptionConfig,
                })
            )
            // Utils.buildAssertMessage(
            //     RequesterContract.name,
            //     'verifyInfo',
            //     ErrorEnum.INFO_ROOT
            // )
        );
        input.taskId.assertEquals(
            input.witness.calculateIndex()
            // Utils.buildAssertMessage(
            //     RequesterContract.name,
            //     'verifyInfo',
            //     ErrorEnum.INFO_INDEX
            // )
        );
    }

    /**
     * Verify accumulation data
     * @param taskId Task Id
     * @param accumulationRootR Accumulated R value
     * @param accumulationRootM Accumulated M value
     * @param witness Witness for proof of accumulation data
     */
    verifyAccumulationData(input: AccumulationInput) {
        this.accumulationRootsHash
            .getAndRequireEquals()
            .assertEquals(
                Poseidon.hash([
                    input.rWitness.calculateRoot(input.rAccumulationRoot),
                    input.mWitness.calculateRoot(input.mAccumulationRoot),
                ]),
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    'verifyAccumulationData',
                    ErrorEnum.ACCUMULATION_ROOT
                )
            );
        input.taskId.assertEquals(
            input.rWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                'verifyAccumulationData',
                ErrorEnum.ACCUMULATION_INDEX_L1
            )
        );
        input.taskId.assertEquals(
            input.mWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequesterContract.name,
                'verifyAccumulationData',
                ErrorEnum.ACCUMULATION_INDEX_L1
            )
        );
    }

    verifyCommitment(input: CommitmentInput) {
        this.commitmentRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.calculateRoot(input.commitment),
                Utils.buildAssertMessage(
                    RequesterContract.name,
                    'verifyCommitment',
                    ErrorEnum.COMMITMENT_ROOT
                )
            );

        input.index.assertEquals(
            input.witness.calculateIndex(),
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

    @method
    async createTask(
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        config: EncryptionConfig,
        selfRef: ZkAppRef
    ) {
        let requesterContract = new RequesterContract(
            this.requesterAddress.getAndRequireEquals()
        );
        await requesterContract.createTask(
            committeeId,
            keyId,
            deadline,
            config,
            selfRef
        );
    }
}

class SubmissionContract extends SmartContract {
    @state(PublicKey) requesterAddress = State<PublicKey>();

    @method
    async submitEncryption(
        indices: EncryptionIndices,
        secrets: SubVectorFieldArray,
        randoms: SubVectorFieldArray,
        nullifiers: SubVectorFieldArray,
        taskId: Field,
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        config: EncryptionConfig,
        infoWitness: TaskWitness,
        encKey: Group,
        encKeyWitness: KeyWitness,
        selfRef: ZkAppRef,
        key: ZkAppRef
    ) {
        let requesterContract = new RequesterContract(
            this.requesterAddress.getAndRequireEquals()
        );
        await requesterContract.submitEncryption(
            indices,
            secrets,
            randoms,
            nullifiers,
            taskId,
            committeeId,
            keyId,
            deadline,
            config,
            infoWitness,
            encKey,
            encKeyWitness,
            selfRef,
            key
        );
    }
}
