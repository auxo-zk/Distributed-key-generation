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
} from 'o1js';
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
import {
    BATCH_REQUEST_LIMITS,
    REQUEST_MAX_SIZE,
    ZkAppEnum,
    ZkProgramEnum,
} from '../constants.js';
import {
    RandomVector,
    RequestVector,
    SecretVector,
} from '../libs/Requester.js';
import { Rollup } from './Actions.js';
import {
    ActionWitness,
    EMPTY_ADDRESS_MT,
    ZkAppRef,
    verifyZkApp,
} from './SharedStorage.js';
import { ErrorEnum, EventEnum } from './constants.js';
import { RequestContract } from './Request.js';

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

export const RollupRequester = Rollup(ZkProgramEnum.RollupRequester, Action);

export class RollupRequesterProof extends ZkProgram.Proof(RollupRequester) {}

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
     * @description MT root storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

    /**
     * @description Number of initialized requests
     */
    @state(Field) requestCounter = State<Field>();

    /**
     * @description MT root storing global request Id
     */
    @state(Field) requestIdRoot = State<Field>();

    /**
     * @description MT root storing accumulated R | M values
     */
    @state(Field) accumulationRoot = State<Field>();

    /**
     * @description MT root storing anonymous commitments
     */
    @state(Field) commitmentRoot = State<Field>();

    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: Action });

    events = {
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
        this.requestCounter.set(Field(0));
        this.requestIdRoot.set(DKG_LEVEL_1_TREE().getRoot());
        this.accumulationRoot.set(EMPTY_ACTION_MT().getRoot());
        this.commitmentRoot.set(EMPTY_ACTION_MT().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

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

    @method attachRequestIds() {}

    @method cancelRequest() {}

    @method finalizedRequest() {}

    @method submit(
        committeeId: Field,
        keyId: Field,
        requestId: Field,
        secrets: SecretVector,
        randoms: RandomVector,
        publicKey: Group
    ) {
        let dimension = secrets.length;
        let R = new RequestVector();
        let M = new RequestVector();
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
            let random = randoms.get(Field(i)).toScalar();
            let secret = secrets.get(Field(i)).toFields();
            R.push(
                Provable.if(
                    Field(i).greaterThanOrEqual(dimension),
                    Group.zero,
                    Group.generator.scale(random)
                )
            );
            let M_i = Provable.if(
                Poseidon.hash(secret).equals(
                    Poseidon.hash(Group.zero.toFields())
                ),
                Group.zero.add(publicKey.scale(random)),
                Group.generator
                    .scale(secrets.get(Field(i)).toScalar())
                    .add(publicKey.scale(random))
            );
            M_i = Provable.if(
                Field(i).greaterThanOrEqual(dimension),
                Group.zero,
                M_i
            );
            M.push(M_i);
        }
        let emptySlots = Field(REQUEST_MAX_SIZE).sub(dimension);
        R.decrementLength(emptySlots);
        M.decrementLength(emptySlots);

        this.reducer.dispatch(
            new Action({
                committeeId,
                keyId,
                requestId,
                R,
                M,
            })
        );
    }

    @method rollup(proof: CreateReduceProof) {
        // Verify proof
        proof.verify();

        // assert initialActionState
        let actionState = this.actionState.getAndRequireEquals();
        proof.publicOutput.initialActionState.assertEquals(actionState);

        // assert initialActionStatus
        let actionStatus = this.actionStatus.getAndRequireEquals();
        proof.publicOutput.initialActionStatus.assertEquals(actionStatus);

        // assert finalActionState
        let lastActionState = this.account.actionState.getAndRequireEquals();
        lastActionState.assertEquals(proof.publicOutput.finalActionState);

        this.actionState.set(lastActionState);
        this.actionStatus.set(proof.publicOutput.finalActionStatus);
    }

    // to-do: adding N, T to check REQUEST_MAX_SIZE by interact with Committee contract
    // to-do: request to Request contract
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
