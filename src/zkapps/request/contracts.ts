import {
    AccountUpdate,
    Field,
    method,
    Poseidon,
    Provable,
    PublicKey,
    Reducer,
    SmartContract,
    State,
    state,
    Struct,
    UInt32,
    UInt64,
    UInt8,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import {
    AddressMap,
    CommitteeWitness,
    EmptyRequestMT,
    KeyWitness,
    RequestPlainWitness,
    RequestWitness,
    ZkAppRef,
} from '../../merklized.js';
import { Action, RequestStatus } from './actions.js';
import { calculateTaskReference } from '../../libs/Requester.js';
import { ErrorEnum, ZkAppIndex } from '../constants.js';
import { ENC_LIMITS, INST_LIMITS, NETWORK_LIMITS } from '../../constants.js';
import {
    IndexCounterStorage,
    RequestInfoStorage,
    ResultStorage,
} from './storages.js';
import { ResolutionFieldArray } from '../../libs/types.js';
import { RollupRequestProof } from './programs.js';
import { KeyContract, KeyFeeInput } from '../key/contracts.js';
import {
    CommitteeConfigInput,
    CommitteeContract,
} from '../committee/contracts.js';

export {
    InfoInput,
    TaskRefInput,
    VectorEncryptionInput,
    StatusInput,
    ResultInput,
    IndexCounterInput,
    RequestContract,
};

class InfoInput extends Struct({
    requestId: Field,
    committeeId: Field,
    keyId: Field,
    deadline: UInt32,
    dimension: Field,
    infoWitness: RequestWitness,
}) {}

class TaskRefInput extends Struct({
    requestId: Field,
    address: PublicKey,
    taskId: Field,
    witness: RequestWitness,
}) {}

class VectorEncryptionInput extends Struct({
    requestId: Field,
    rEncryptionRoot: Field,
    mEncryptionRoot: Field,
    rWitness: RequestWitness,
    mWitness: RequestWitness,
}) {}

class StatusInput extends Struct({
    status: Field,
    requestId: Field,
    committeeId: Field,
    keyId: Field,
    deadline: UInt32,
    dimension: Field,
    indexCounter: Field,
    infoWitness: RequestWitness,
    indexCounterWitness: RequestWitness,
}) {}

class ResultInput extends Struct({
    requestId: Field,
    dimensionIndex: UInt8,
    result: Field,
    witness: RequestPlainWitness,
}) {}

class IndexCounterInput extends Struct({
    requestId: Field,
    indexCounter: Field,
    witness: RequestWitness,
}) {}

class RequestContract extends SmartContract {
    /**
     * Slot 0
     * @description MT storing addresses of other zkApps
     * @see AddressStorage for off-chain storage implementation
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * Slot 1
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>(Reducer.initialActionState);

    /**
     * Slot 2
     * @description Number of initialized requests
     */
    @state(Field) requestCounter = State<Field>(Field(0));

    /**
     * Slot 3
     * @description MT storing corresponding keys
     * @see RequestInfoStorage for off-chain storage implementation
     */
    @state(Field) infoRoot = State<Field>(EmptyRequestMT().getRoot());

    /**
     * Slot 4
     * @description MT storing corresponding keys
     * @see TaskRefStorage for off-chain storage implementation
     */
    @state(Field) taskRefRoot = State<Field>(EmptyRequestMT().getRoot());

    /**
     * Slot 5
     * @description MT storing accumulation data
     * Hash(R accumulation MT root | M accumulation MT root | dimension)
     * @see VectorEncryptionStorage for off-chain storage implementation
     */
    @state(Field) vectorEncryptionRootsHash = State<Field>(
        EmptyRequestMT().getRoot()
    );

    /**
     * Slot 6
     * @description MT storing result values
     * @see ResultStorage for off-chain storage implementation
     */
    @state(Field) resultRoot = State<Field>(EmptyRequestMT().getRoot());

    /**
     * Slot 7
     * @description MT storing resolved indices counters for requests
     * @see IndexCounterStorage for off-chain storage implementation
     */
    @state(Field) indexCounterRoot = State<Field>(EmptyRequestMT().getRoot());

    reducer = Reducer({ actionType: Action });

    // events = { [EventEnum.ResultArray]: ResultArrayEvent };

    /**
     * Initialize a threshold decryption request
     * @param keyIndex Unique key index
     * @param taskId Requester's taskId
     * @param expirationPeriod Waiting period before the expiration of unresolved request
     * @param accumulationRoot Accumulation data Hash(R root | M root | dimension)
     * @param requester Requester's address
     */
    @method
    async initialize(
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        taskId: Field,
        requester: PublicKey,
        dimension: Field,
        rAccumulationRoot: Field,
        mAccumulationRoot: Field,
        fee: UInt64,
        keyFeeWitness: KeyWitness,
        key: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Key Contract address
        AddressMap.verifyZkApp(
            RequestContract.name,
            key,
            zkAppRoot,
            Field(ZkAppIndex.KEY)
        );
        const keyContract = new KeyContract(key.address);

        // Verify fee
        keyContract.verifyKeyFee(
            new KeyFeeInput({
                committeeId,
                keyId,
                fee: fee.value,
                witness: keyFeeWitness,
            })
        );

        // Verify caller
        Utils.requireCaller(requester, this);
        let packedData = Action.pack(
            deadline,
            Field(INST_LIMITS.REQUEST * INST_LIMITS.REQUESTER),
            committeeId,
            keyId,
            Field(0),
            Field(0),
            Field(0),
            Field(0)
        );
        let f1 = calculateTaskReference(requester, taskId);
        let f2 = dimension;
        let f3 = rAccumulationRoot;
        let f4 = mAccumulationRoot;
        let action = new Action({ packedData, f1, f2, f3, f4 });
        this.reducer.dispatch(action);

        this.send({
            to: AccountUpdate.create(this.address),
            amount: UInt64.from(fee).mul(
                UInt64.Unsafe.fromField(action.dimension)
            ),
        });
    }

    /**
     * Resolve a request and update result
     * @param proof Verification proof
     * @param expirationTimestamp Timestamp for the expiration of the request
     * @param accumulationRoot Accumulation data MT root
     * @param responseRoot Response data MT root
     * @param resultRoot Decryption result MT root
     * @param expirationWitness Witness for proof of expiration timestamp
     * @param accumulationWitness Witness for proof of accumulation data
     * @param responseWitness Witness for proof of response data
     * @param resultWitness Witness for proof of result
     * @param response Reference to Response Contract
     */
    @method
    async resolve(
        indices: ResolutionFieldArray,
        results: ResolutionFieldArray,
        requestId: Field,
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        dimension: Field,
        indexCounter: Field,
        fee: UInt64,
        infoWitness: RequestWitness,
        indexCounterWitness: RequestWitness,
        response: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Response Contract address
        Utils.requireCaller(response.address, this);
        AddressMap.verifyZkApp(
            RequestContract.name,
            response,
            zkAppRoot,
            Field(ZkAppIndex.RESPONSE)
        );

        // Verify request status (and info)
        this.verifyRequestStatus(
            new StatusInput({
                status: Field(RequestStatus.INITIALIZED),
                requestId,
                committeeId,
                keyId,
                deadline,
                dimension,
                indexCounter,
                infoWitness,
                indexCounterWitness,
            })
        );

        // Create and dispatch actions
        for (let i = 0; i < ENC_LIMITS.RESOLUTION / Action.numResults; i++) {
            let idx1 = Field(i * Action.numResults);
            let idx2 = Field(i * Action.numResults + 1);
            let idx3 = Field(i * Action.numResults + 2);
            let idx4 = Field(i * Action.numResults + 3);

            let packedData = Action.pack(
                deadline,
                requestId,
                committeeId,
                keyId,
                indices.get(idx1),
                indices.get(idx2),
                indices.get(idx3),
                indices.get(idx4)
            );
            let action = new Action({
                packedData,
                f1: results.get(idx1),
                f2: results.get(idx2),
                f3: results.get(idx3),
                f4: results.get(idx4),
            });
            this.reducer.dispatch(action);
        }
    }

    /**
     * Update requests by rollup to the latest actions
     * @param proof Verification proof
     */
    @method
    async update(proof: RollupRequestProof) {
        // Verify proof
        proof.verify();

        // Get on-chain states
        let curActionState = this.actionState.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();
        let requestCounter = this.requestCounter.getAndRequireEquals();
        let infoRoot = this.infoRoot.getAndRequireEquals();
        let taskRefRoot = this.taskRefRoot.getAndRequireEquals();
        let vectorEncryptionRootsHash =
            this.vectorEncryptionRootsHash.getAndRequireEquals();
        let resultRoot = this.resultRoot.getAndRequireEquals();
        let indexCounterRoot = this.indexCounterRoot.getAndRequireEquals();

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
                proof.publicOutput.nextRequestCounter,
                proof.publicOutput.nextInfoRoot,
                proof.publicOutput.nextTaskRefRoot,
                proof.publicOutput.nextVectorEncryptionRootsHash,
                proof.publicOutput.nextResultRoot,
                proof.publicOutput.nextIndexCounterRoot,
            ],
            [
                requestCounter,
                infoRoot,
                taskRefRoot,
                vectorEncryptionRootsHash,
                resultRoot,
                indexCounterRoot,
            ],
            6
        );
        this.requestCounter.set(proof.publicOutput.nextRequestCounter);
        this.infoRoot.set(proof.publicOutput.nextInfoRoot);
        this.taskRefRoot.set(proof.publicOutput.nextTaskRefRoot);
        this.vectorEncryptionRootsHash.set(
            proof.publicOutput.nextVectorEncryptionRootsHash
        );
        this.resultRoot.set(proof.publicOutput.nextResultRoot);
        this.indexCounterRoot.set(proof.publicOutput.nextIndexCounterRoot);
    }

    /**
     * Refund fee for a expired request
     * @param requestId
     * @param taskId
     * @param receiver
     */
    @method
    async refund(
        requestId: Field,
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        dimension: Field,
        indexCounter: Field,
        taskId: Field,
        receiver: PublicKey,
        fee: UInt64,
        infoWitness: RequestWitness,
        indexCounterWitness: RequestWitness,
        keyFeeWitness: KeyWitness,
        key: ZkAppRef
    ) {
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Key Contract address
        AddressMap.verifyZkApp(
            RequestContract.name,
            key,
            zkAppRoot,
            Field(ZkAppIndex.KEY)
        );
        const keyContract = new KeyContract(key.address);

        // Verify fee
        keyContract.verifyKeyFee(
            new KeyFeeInput({
                committeeId,
                keyId,
                fee: fee.value,
                witness: keyFeeWitness,
            })
        );

        // Verify request status
        this.verifyRequestStatus(
            new StatusInput({
                status: Field(RequestStatus.EXPIRED),
                requestId,
                committeeId,
                keyId,
                deadline,
                dimension,
                indexCounter,
                infoWitness,
                indexCounterWitness,
            })
        );

        // Verify task reference
        this.verifyTaskRef(
            new TaskRefInput({
                requestId,
                address: receiver,
                taskId,
                witness: infoWitness,
            })
        );

        // Refund fee
        this.send({
            to: receiver,
            amount: UInt64.from(fee).mul(UInt64.Unsafe.fromField(dimension)),
        });
    }

    /**
     * Claim fee for a resolved request
     * @param requestId
     * @param committeeId
     * @param receiver
     */
    @method
    async claimFee(
        requestId: Field,
        committeeId: Field,
        keyId: Field,
        deadline: UInt32,
        dimension: Field,
        indexCounter: Field,
        receiver: PublicKey,
        fee: UInt64,
        T: Field,
        N: Field,
        infoWitness: RequestWitness,
        indexCounterWitness: RequestWitness,
        settingWitness: CommitteeWitness,
        keyFeeWitness: KeyWitness,
        committee: ZkAppRef,
        key: ZkAppRef,
        response: ZkAppRef
    ) {
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        // Verify Committee Contract address
        AddressMap.verifyZkApp(
            RequestContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppIndex.COMMITTEE)
        );
        const committeeContract = new CommitteeContract(committee.address);

        // Verify Key Contract address
        AddressMap.verifyZkApp(
            RequestContract.name,
            key,
            zkAppRoot,
            Field(ZkAppIndex.KEY)
        );
        const keyContract = new KeyContract(key.address);

        // Verify Response Contract address
        Utils.requireCaller(response.address, this);
        AddressMap.verifyZkApp(
            RequestContract.name,
            response,
            zkAppRoot,
            Field(ZkAppIndex.RESPONSE)
        );

        // Verify request status
        this.verifyRequestStatus(
            new StatusInput({
                status: Field(RequestStatus.RESOLVED),
                requestId,
                committeeId,
                keyId,
                deadline,
                dimension,
                indexCounter,
                infoWitness,
                indexCounterWitness,
            })
        );

        // Verify committee setting
        committeeContract.verifySetting(
            new CommitteeConfigInput({
                N,
                T,
                committeeId,
                settingWitness,
            })
        );

        // Verify key fee
        keyContract.verifyKeyFee(
            new KeyFeeInput({
                committeeId,
                keyId,
                fee: fee.value,
                witness: keyFeeWitness,
            })
        );

        // Send shared fee
        // @todo Consider between this.sender or requester
        this.send({
            to: receiver,
            amount: UInt64.from(fee)
                .mul(UInt64.Unsafe.fromField(T))
                .div(UInt64.Unsafe.fromField(N)),
        });
    }

    /**
     * Get request's current status
     * @param requestId Request Id
     * @param expirationTimestamp Timestamp for the expiration of the request
     * @param expirationWitness Witness for proof of expiration timestamp
     * @param resultWitness Witness for proof of result
     * @returns
     */
    getRequestStatus(
        deadline: UInt32,
        indexCounter: Field,
        dimension: Field
    ): Field {
        let isResolved = indexCounter.equals(dimension);
        let isExpired = this.network.blockchainLength
            .getAndRequireEquals()
            .greaterThan(deadline);
        return Provable.switch(
            [
                isResolved.or(isExpired).not(),
                isResolved,
                isResolved.not().and(isExpired),
            ],
            Field,
            [
                Field(RequestStatus.INITIALIZED),
                Field(RequestStatus.RESOLVED),
                Field(RequestStatus.EXPIRED),
            ]
        );
    }

    verifyRequestInfo(input: InfoInput) {
        this.infoRoot.getAndRequireEquals().assertEquals(
            input.infoWitness.calculateRoot(
                RequestInfoStorage.calculateLeaf({
                    committeeId: input.committeeId,
                    keyId: input.keyId,
                    deadline: input.deadline,
                    dimension: input.dimension,
                })
            )
            // Utils.buildAssertMessage(
            //     RequestContract.name,
            //     'verifyRequestInfo',
            //     ErrorEnum.REQUEST_INFO_ROOT
            // )
        );
        input.requestId.assertEquals(
            input.infoWitness.calculateIndex()
            // Utils.buildAssertMessage(
            //     RequestContract.name,
            //     'verifyRequestInfo',
            //     ErrorEnum.REQUEST_INFO_INDEX
            // )
        );
    }

    /**
     * Verify requester's address
     * @param requestId Request Id
     * @param address Requester's address
     * @param taskId Requester's taskId
     * @param witness Witness for proof of requester's address
     */
    verifyTaskRef(input: TaskRefInput) {
        this.taskRefRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.calculateRoot(
                    calculateTaskReference(input.address, input.taskId)
                ),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    'verifyTaskId',
                    ErrorEnum.TASK_ID_ROOT
                )
            );
        input.requestId.assertEquals(
            input.witness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyTaskId',
                ErrorEnum.TASK_ID_INDEX
            )
        );
    }

    /**
     * Verify request's status
     * @param requestId Request Id
     * @param status Expected status
     * @param expirationTimestamp Timestamp for the expiration of the request
     * @param expirationWitness Witness for proof of expiration timestamp
     * @param resultWitness Witness for proof of result
     */
    verifyRequestStatus(input: StatusInput) {
        this.verifyRequestInfo(
            new InfoInput({
                requestId: input.requestId,
                committeeId: input.committeeId,
                keyId: input.keyId,
                deadline: input.deadline,
                dimension: input.dimension,
                infoWitness: input.infoWitness,
            })
        );
        this.verifyIndexCounter(
            new IndexCounterInput({
                requestId: input.requestId,
                indexCounter: input.indexCounter,
                witness: input.indexCounterWitness,
            })
        );
        input.status.assertEquals(
            this.getRequestStatus(
                input.deadline,
                input.dimension,
                input.indexCounter
            ),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyRequestStatus',
                ErrorEnum.REQUEST_STATUS
            )
        );
    }

    /**
     * Verify accumulation data
     * @param requestId Request Id
     * @param accumulatedRRoot Accumulation root of R
     * @param accumulatedMRoot Accumulation root of M
     * @param dimension Full dimension of the encryption vector
     * @param witness Witness for proof of accumulation data
     */
    verifyAccumulationData(input: VectorEncryptionInput) {
        this.vectorEncryptionRootsHash
            .getAndRequireEquals()
            .assertEquals(
                Poseidon.hash([
                    input.rWitness.calculateRoot(input.rEncryptionRoot),
                    input.mWitness.calculateRoot(input.mEncryptionRoot),
                ]),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    'verifyAccumulationData',
                    ErrorEnum.ACCUMULATION_ROOT
                )
            );
        input.requestId.assertEquals(
            input.rWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyAccumulationData',
                ErrorEnum.ACCUMULATION_INDEX_L1
            )
        );
        input.requestId.assertEquals(
            input.mWitness.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyAccumulationData',
                ErrorEnum.ACCUMULATION_INDEX_L1
            )
        );
    }

    /**
     * Verify result value
     * @param requestId Request Id
     * @param dimensionIndex Dimension index in the full result vector
     * @param result Decrypted result value
     * @param witness Witness for proof of result vector
     * @param scalarWitness Witness for proof of result value
     */
    verifyResult(input: ResultInput) {
        this.resultRoot
            .getAndRequireEquals()
            .assertEquals(
                input.witness.level1.calculateRoot(
                    input.witness.level2.calculateRoot(
                        ResultStorage.calculateLeaf(input.result)
                    )
                ),
                Utils.buildAssertMessage(
                    RequestContract.name,
                    'verifyResult',
                    ErrorEnum.REQUEST_RESULT_ROOT
                )
            );
        input.requestId.assertEquals(
            input.witness.level1.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyResult',
                ErrorEnum.REQUEST_RESULT_INDEX_L1
            )
        );
        input.dimensionIndex.value.assertEquals(
            input.witness.level2.calculateIndex(),
            Utils.buildAssertMessage(
                RequestContract.name,
                'verifyResult',
                ErrorEnum.REQUEST_RESULT_INDEX_L2
            )
        );
    }

    /**
     * Verify resolved indices counter
     * @param requestId Request Id
     * @param indexCounter Resolved indices counter
     * @param witness Witness for proof of resolved indices counter
     */
    verifyIndexCounter(input: IndexCounterInput) {
        this.indexCounterRoot.getAndRequireEquals().assertEquals(
            input.witness.calculateRoot(
                IndexCounterStorage.calculateLeaf(input.indexCounter)
            )
            // Utils.buildAssertMessage(
            //     RequestContract.name,
            //     'verifyIndexCounter',
            //     ErrorEnum.INDEX_COUNTER_ROOT
            // )
        );
        input.requestId.assertEquals(
            input.witness.calculateIndex()
            // Utils.buildAssertMessage(
            //     RequestContract.name,
            //     'verifyIndexCounter',
            //     ErrorEnum.INDEX_COUNTER_INDEX
            // )
        );
    }
}
