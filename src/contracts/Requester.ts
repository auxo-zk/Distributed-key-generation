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
import { REQUEST_MAX_SIZE, ZkAppEnum, ZkProgramEnum } from '../constants.js';
import {
    RandomVector,
    RequestVector,
    SecretVector,
} from '../libs/Requester.js';
import { RollupContract } from './Rollup.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    EMPTY_ADDRESS_MT,
    ProcessedActions,
    RollupStatus,
    ZkAppRef,
    verifyZkApp,
} from '../storages/SharedStorage.js';
import {
    Level1Witness,
    EMPTY_LEVEL_1_TREE as REQUESTER_LEVEL_1_TREE,
} from '../storages/RequestStorage.js';
import { ErrorEnum, EventEnum } from './constants.js';

import { CommitteeContract } from './Committee.js';
import { RequestContract } from './Request.js';
import { Level1Witness as DkgLevel1Witness } from '../storages/DKGStorage.js';
import { DkgContract, KeyStatus, KeyStatusInput } from './DKG.js';
import { processAction } from './Actions.js';

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
    taskCounter: Field,
    initialRequestIdRoot: Field,
    nextRequestIdRoot: Field,
}) {}

export const AttachRequest = ZkProgram({
    name: ZkProgramEnum.AttachRequest,
    publicOutput: AttachRequestOutput,
    methods: {
        firstStep: {
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

export class AttachRequestProof extends ZkProgram.Proof(AttachRequest) {}

export class AccumulateEncryptionInput extends Struct({
    previousActionState: Field,
    action: Action,
    actionId: Field,
}) {}

export class AccumulateEncryptionOutput extends Struct({
    address: PublicKey,
    requestId: Field,
    rollupRoot: Field,
    initialProcessRoot: Field,
    nextProcessRoot: Field,
    sumR: RequestVector,
    sumM: RequestVector,
    processedActions: ProcessedActions,
}) {}

export const AccumulateEncryption = ZkProgram({
    name: ZkProgramEnum.AccumulateEncryption,
    publicInput: AccumulateEncryptionInput,
    publicOutput: AccumulateEncryptionOutput,
    methods: {
        firstStep: {
            privateInputs: [PublicKey, Field, Field, Field],
            method(
                input: AccumulateEncryptionInput,
                address: PublicKey,
                requestId: Field,
                rollupRoot: Field,
                initialProcessRoot: Field
            ) {
                return new AccumulateEncryptionOutput({
                    address: address,
                    requestId: requestId,
                    rollupRoot: rollupRoot,
                    initialProcessRoot: initialProcessRoot,
                    nextProcessRoot: initialProcessRoot,
                    sumR: new RequestVector(),
                    sumM: new RequestVector(),
                    processedActions: new ProcessedActions(),
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
                ActionWitness,
            ],

            method(
                input: AccumulateEncryptionInput,
                earlierProof: SelfProof<
                    AccumulateEncryptionInput,
                    AccumulateEncryptionOutput
                >,
                rollupWitness: ActionWitness,
                processWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                input.action.requestId.assertEquals(
                    earlierProof.publicOutput.requestId,
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.nextStep.name,
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
                let [rollupRoot, rollupIndex] = rollupWitness.computeRootAndKey(
                    Field(RollupStatus.ROLLUPED)
                );
                earlierProof.publicOutput.rollupRoot.assertEquals(
                    rollupRoot,
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.nextStep.name,
                        ErrorEnum.ROLLUP_ROOT
                    )
                );
                actionIndex.assertEquals(
                    rollupIndex,
                    Utils.buildAssertMessage(
                        AccumulateEncryption.name,
                        AccumulateEncryption.nextStep.name,
                        ErrorEnum.ROLLUP_INDEX
                    )
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
    @state(Field) taskCounter = State<Field>();

    /**
     * @description MT storing corresponding requests
     */
    @state(Field) requestIdRoot = State<Field>();

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
        this.taskCounter.set(Field(0));
        this.requestIdRoot.set(REQUESTER_LEVEL_1_TREE().getRoot());
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
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        request: ZkAppRef,
        dkg: ZkAppRef,
        keyStatusWitness: DkgLevel1Witness
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let taskCounter = this.taskCounter.getAndRequireEquals();

        // Verify Dkg Contract address
        verifyZkApp(RequestContract.name, dkg, zkAppRoot, Field(ZkAppEnum.DKG));

        // Verify Request Contract address
        verifyZkApp(
            RequesterContract.name,
            request,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );

        const dkgContract = new DkgContract(dkg.address);
        const requestContract = new RequestContract(request.address);

        // Verify key status
        dkgContract.verifyKeyStatus(
            new KeyStatusInput({
                committeeId: committeeId,
                keyId: keyId,
                status: Field(KeyStatus.ACTIVE),
                witness: keyStatusWitness,
            })
        );

        // Create and dispatch action in Request Contract
        requestContract.initialize(
            committeeId,
            keyId,
            this.address,
            startTimestamp,
            endTimestamp
        );

        // Update state values
        this.taskCounter.set(taskCounter.add(1));
    }

    /**
     * Attach tasks to corresponding requests
     * Note: If a task is attached to the invalid request, following steps will fail
     * @param proof Verification proof
     */
    @method attachRequests(proof: AttachRequestProof) {
        // Get current state values
        let taskCounter = this.taskCounter.getAndRequireEquals();
        let requestIdRoot = this.requestIdRoot.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.taskCounter.assertEquals(
            taskCounter,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.attachRequests.name,
                ErrorEnum.REQUEST_COUNTER
            )
        );
        proof.publicOutput.initialRequestIdRoot.assertEquals(
            requestIdRoot,
            Utils.buildAssertMessage(
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
        requestContract.abort(requestId, this.address);
    }

    @method submit(
        requestId: Field,
        requestWitness: Level1Witness,
        secrets: SecretVector,
        randoms: RandomVector,
        publicKey: Group,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        committee: ZkAppRef,
        request: ZkAppRef,
        rollup: ZkAppRef,
        periodWitness: Level1Witness
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

        // TODO: Verify encryption key

        // TODO: Verify request period
        this.network.timestamp
            .getAndRequireEquals()
            .assertGreaterThanOrEqual(startTimestamp);
        this.network.timestamp
            .getAndRequireEquals()
            .assertLessThanOrEqual(endTimestamp);

        // Verify attached request
        requestIdRoot.assertEquals(
            requestWitness.calculateRoot(requestId),
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_ID_ROOT
            )
        );

        // Verify secret vectors
        secrets.length.assertEquals(
            randoms.length,
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_VECTOR_DIM
            )
        );

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
            Utils.buildAssertMessage(
                RequesterContract.name,
                RequesterContract.prototype.submit.name,
                ErrorEnum.REQUEST_VECTOR_DIM
            )
        );
        M.length.assertEquals(
            dimension,
            Utils.buildAssertMessage(
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
        proof: AccumulateEncryptionProof,
        requestId: Field,
        requestWitness: Level1Witness,
        startTimestamp: UInt64,
        endTimestamp: UInt64,
        request: ZkAppRef,
        rollup: ZkAppRef
    ) {
        // Get current state values
        let zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        let requestIdRoot = this.requestIdRoot.getAndRequireEquals();

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

        // TODO: request to Request contract
        // requestContract.finalize(
        //     requestId,
        //     this.address,
        //     startTimestamp,
        //     endTimestamp,
        //     proof.publicOutput.sumR,
        //     proof.publicOutput.sumM
        // );
    }
}
