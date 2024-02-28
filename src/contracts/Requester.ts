/* eslint-disable @typescript-eslint/no-empty-function */
import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Group,
    Reducer,
    MerkleMapWitness,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    ZkProgram,
    Void,
    Scalar,
} from 'o1js';
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
import { REQUEST_MAX_SIZE, ZkAppEnum, ZkProgramEnum } from '../constants.js';
import {
    RandomVector,
    RequestVector,
    SecretVector,
} from '../libs/Requester.js';
import { RollupContract } from './Actions.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from './SharedStorage.js';
import {
    Level1Witness,
    EMPTY_LEVEL_1_TREE as REQUESTER_LEVEL_1_TREE,
} from './RequesterStorage.js';
import { ErrorEnum, EventEnum } from './constants.js';
import { RequestContract } from './Request.js';
import { CustomScalar } from '@auxo-dev/auxo-libs';
import { Level1Witness as DkgLevel1Witness } from './DKGStorage.js';
import { CommitteeContract } from './Committee.js';

export class Action extends Struct({
    taskId: Field,
    requestId: Field,
    R: RequestVector,
    M: RequestVector,
}) {
    static empty(): Action {
        return new Action({
            taskId: Field(0),
            requestId: Field(0),
            R: new RequestVector(),
            M: new RequestVector(),
        });
    }
    static fromFields(fields: Field[]): Action {
        return super.fromFields(fields) as Action;
    }
    hash(): Field {
        return Poseidon.hash(Action.toFields(this));
    }
}

export class AttachRequestOutput extends Struct({
    requestCounter: Field,
    initialRequestIdRoot: Field,
    nextRequestIdRoot: Field,
}) {}

export const AttachRequest = ZkProgram({
    name: ZkProgramEnum.AttachRequest,
    publicOutput: AttachRequestOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field],
            method(requestCounter: Field, initialRequestIdRoot: Field) {
                return new AttachRequestOutput({
                    requestCounter: requestCounter,
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
                    buildAssertMessage(
                        AttachRequest.name,
                        AttachRequest.nextStep.name,
                        ErrorEnum.REQUEST_ID_ROOT
                    )
                );

                // Verify a request has been initialized for this task
                earlierProof.publicOutput.requestCounter.assertGreaterThan(
                    taskId,
                    buildAssertMessage(
                        AttachRequest.name,
                        AttachRequest.nextStep.name,
                        ErrorEnum.REQUEST_ID_KEY
                    )
                );
                taskId.assertEquals(
                    witness.calculateIndex(),
                    buildAssertMessage(
                        AttachRequest.name,
                        AttachRequest.nextStep.name,
                        ErrorEnum.REQUEST_ID_KEY
                    )
                );

                let nextRequestIdRoot = witness.calculateRoot(requestId);

                return new AttachRequestOutput({
                    requestCounter: earlierProof.publicOutput.requestCounter,
                    initialRequestIdRoot:
                        earlierProof.publicOutput.initialRequestIdRoot,
                    nextRequestIdRoot: nextRequestIdRoot,
                });
            },
        },
    },
});

export class AttachRequestProof extends ZkProgram.Proof(AttachRequest) {}

export class AccumulateEncryptionInput extends Struct({
    previousActionState: Field,
    action: Action,
}) {}

export class AccumulateEncryptionOutput extends Struct({
    initialAccumulatedRRoot: Field,
    initialAccumulatedMRoot: Field,
    initialProcessRoot: Field,
    nextAccumulatedRRoot: Field,
    nextAccumulatedMRoot: Field,
    nextProcessRoot: Field,
    sumR: RequestVector,
    sumM: RequestVector,
    // cur_T: Field,        // unnecessary?
}) {}

export const AccumulateEncryption = ZkProgram({
    name: ZkProgramEnum.AccumulateEncryption,
    publicInput: AccumulateEncryptionInput,
    publicOutput: AccumulateEncryptionOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field],
            method(
                input: AccumulateEncryptionInput,
                initialAccumulatedRRoot: Field,
                initialAccumulatedMRoot: Field,
                initialProcessRoot: Field
            ) {
                return new AccumulateEncryptionOutput({
                    initialAccumulatedRRoot: initialAccumulatedRRoot,
                    initialAccumulatedMRoot: initialAccumulatedMRoot,
                    initialProcessRoot: initialProcessRoot,
                    nextAccumulatedRRoot: initialAccumulatedRRoot,
                    nextAccumulatedMRoot: initialAccumulatedMRoot,
                    nextProcessRoot: initialProcessRoot,
                    sumR: new RequestVector(),
                    sumM: new RequestVector(),
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<
                    AccumulateEncryptionInput,
                    AccumulateEncryptionOutput
                >,
                ActionWitness,
            ],

            method(
                input: AccumulateEncryptionInput,
                earlierProof: SelfProof<
                    AccumulateEncryptionInput,
                    AccumulateEncryptionOutput
                >,
                processRoot: ActionWitness
            ) {
                earlierProof.verify();
                let requestId = input.action.requestId;
                requestId.assertEquals(earlierProof.publicOutput.requestId);

                let actionState = updateActionState(preActionState, [
                    action.toFields(),
                ]);

                // It's status has to be REDUCED
                let [root, key] = rollupStatusWitness.computeRootAndKey(
                    Field(ActionStatus.REDUCED)
                );
                key.assertEquals(actionState);
                root.assertEquals(earlierProof.publicOutput.finalStatusRoot);

                // Update satus to ROLL_UPED
                let [newRoot] = rollupStatusWitness.computeRootAndKey(
                    Field(ActionStatus.ROLL_UPED)
                );

                let sumR = earlierProof.publicOutput.sumR;
                let sumM = earlierProof.publicOutput.sumM;

                for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
                    sumR.set(
                        Field(i),
                        sumR.get(Field(i)).add(action.R.get(Field(i)))
                    );
                    sumM.set(
                        Field(i),
                        sumM.get(Field(i)).add(action.M.get(Field(i)))
                    );
                }

                return new RollupActionsOutput({
                    requestId: requestId,
                    sumR,
                    sumM,
                    cur_T: earlierProof.publicOutput.cur_T.add(Field(1)),
                    initialStatusRoot:
                        earlierProof.publicOutput.initialStatusRoot,
                    finalStatusRoot: newRoot,
                });
            },
        },
    },
});

export class AccumulateEncryptionProof extends ZkProgram.Proof(
    AccumulateEncryption
) {}

export class RequesterContract extends SmartContract {
    /**
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description Number of initialized requests
     */
    @state(Field) requestCounter = State<Field>();

    /**
     * @description MT storing corresponding request
     */
    @state(Field) requestIdRoot = State<Field>();

    /**
     * @description MT storing submission counter values for requests
     */
    @state(Field) submissionCounterRoot = State<Field>();

    /**
     * @description MT storing accumulated R | M values
     */
    @state(Field) accumulationRoot = State<Field>();

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
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.requestCounter.set(Field(0));
        this.requestIdRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.commitmentRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
        this.processRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    /**
     * Initialize new threshold homomorphic encryption request
     * @param committeeId Global committee Id
     * @param keyId Committee's key Id
     * @param request Reference to Request Contract
     */
    @method initializeRequest(
        committeeId: Field,
        keyId: Field,
        request: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let requestCounter = this.requestCounter.getAndRequireEquals();

        // Verify Request Contract address
        verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );

        const requestContract = new RequestContract(request.address);

        // Create and dispatch action in Request Contract
        requestContract.initialize(committeeId, keyId, this.address);

        // Update state values
        this.requestCounter.set(requestCounter.add(1));
    }

    /**
     * Attach tasks to corresponding requests
     * Note: If a task is attached to the invalid request, following steps will fail
     * @param proof Verification proof
     */
    @method attachRequests(proof: AttachRequestProof) {
        // Get current state values
        let requestCounter = this.requestCounter.getAndRequireEquals();
        let requestIdRoot = this.requestIdRoot.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.requestCounter.assertEquals(
            requestCounter,
            buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.attachRequests.name,
                ErrorEnum.REQUEST_COUNTER
            )
        );
        proof.publicOutput.initialRequestIdRoot.assertEquals(
            requestIdRoot,
            buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.attachRequests.name,
                ErrorEnum.REQUEST_COUNTER
            )
        );

        // Update state values
        this.requestIdRoot.set(proof.publicOutput.nextRequestIdRoot);
    }

    @method abortRequest(requestId: Field, request: ZkAppRef) {
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

        // Create and dispatch action in Request Contract
        requestContract.abort(requestId);
    }

    @method submit(
        requestId: Field,
        requestWitness: Level1Witness,
        secrets: SecretVector,
        randoms: RandomVector,
        publicKey: Group,
        committee: ZkAppRef,
        request: ZkAppRef,
        rollup: ZkAppRef,
        keyWitness: DkgLevel1Witness,
        requestStatusWitness: Level1Witness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let requestIdRoot = this.requestIdRoot.getAndRequireEquals();

        // Verify Committee Contract address
        verifyZkApp(
            RequesterContract.name,
            committee,
            zkAppRoot,
            Field(ZkAppEnum.COMMITTEE)
        );
        verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );
        verifyZkApp(
            RequesterContract.name,
            rollup,
            zkAppRoot,
            Field(ZkAppEnum.ROLLUP)
        );

        const committeeContract = new CommitteeContract(committee.address);
        const requestContract = new RequestContract(request.address);
        const rollupContract = new RollupContract(rollup.address);

        // Verify encryption key

        // Verify attached request
        requestIdRoot.assertEquals(
            requestWitness.calculateRoot(requestId),
            buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_ID_ROOT
            )
        );

        // Verify secret vectors
        secrets.length.assertEquals(
            randoms.length,
            buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_VECTOR_DIM
            )
        );

        // TO-DO requestContract.verifyRequestStatus(...)

        // Calculate encryption
        let dimension = secrets.length;
        let R = Provable.witness(
            RequestVector,
            () =>
                new RequestVector(
                    [...Array(Number(dimension)).keys()].map(() => Group.zero)
                )
        );
        let M = Provable.witness(
            RequestVector,
            () =>
                new RequestVector(
                    [...Array(Number(dimension)).keys()].map(() => Group.zero)
                )
        );
        R.length.assertEquals(
            dimension,
            buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_VECTOR_DIM
            )
        );
        M.length.assertEquals(
            dimension,
            buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_VECTOR_DIM
            )
        );
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
            let index = Field(i);
            let random = randoms.get(index).toScalar();
            let secret = secrets.get(index);
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
            Mi = Provable.if(
                Field(i).greaterThanOrEqual(dimension),
                Group.zero,
                Mi
            );
            M.set(index, Mi);
        }

        // Create and dispatch action
        let action = new Action({
            taskId: requestWitness.calculateIndex(),
            requestId: requestId,
            R,
            M,
        });
        this.reducer.dispatch(action);
        rollupContract.recordAction(action.hash(), this.address);
    }

    @method accumulate(
        proof: CreateRollupProof,
        R_witness: MerkleMapWitness,
        M_witness: MerkleMapWitness
    ) {
        proof.verify();

        let accumulatedRRoot = this.accumulatedRRoot.getAndRequireEquals();
        let accumulatedMRoot = this.accumulatedMRoot.getAndRequireEquals();
        let actionStatus = this.actionStatus.getAndRequireEquals();

        actionStatus.assertEquals(proof.publicOutput.initialStatusRoot);
        let [old_R_root, R_key] = R_witness.computeRootAndKey(Field(0));
        let [old_M_root, M_key] = M_witness.computeRootAndKey(Field(0));

        R_key.assertEquals(proof.publicOutput.requestId);
        M_key.assertEquals(proof.publicOutput.requestId);

        accumulatedRRoot.assertEquals(old_R_root);
        accumulatedMRoot.assertEquals(old_M_root);

        // to-do: adding check cur_T == T
        let [new_R_root] = R_witness.computeRootAndKey(
            proof.publicOutput.sumR.hash()
        );
        let [new_M_root] = M_witness.computeRootAndKey(
            proof.publicOutput.sumM.hash()
        );

        // update on-chain state
        this.accumulatedRRoot.set(new_R_root);
        this.accumulatedMRoot.set(new_M_root);
        this.actionStatus.set(proof.publicOutput.finalStatusRoot);

        // to-do: request to Request contract
        //...
    }
}
