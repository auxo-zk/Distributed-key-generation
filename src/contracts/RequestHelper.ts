import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Group,
    Reducer,
    MerkleMap,
    MerkleMapWitness,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    Void,
    ZkProgram,
} from 'o1js';
import { ScalarDynamicArray } from '@auxo-dev/auxo-libs';
import { updateActionState } from '../libs/utils.js';
import { REQUEST_MAX_SIZE } from '../constants.js';
import { RequestVector } from './Request.js';

const DefaultEmptyMerkleMapRoot = new MerkleMap().getRoot();

export const enum ActionStatus {
    NOT_EXISTED,
    REDUCED,
    ROLL_UPED,
}

export class CustomScalarArray extends ScalarDynamicArray(REQUEST_MAX_SIZE) {}

export class RequestHelperInput extends Struct({
    committeeId: Field,
    keyId: Field,
    requetsTime: Field,
    committeePublicKey: PublicKey,
    // to-do wintess to check if it the right publickey
    secretVector: CustomScalarArray,
    random: CustomScalarArray,
    // settingMerkleMapWitness: MerkleMapWitness,
}) {
    requestId(): Field {
        return Poseidon.hash([this.committeeId, this.keyId, this.requetsTime]);
    }
}

export class RequestHelperAction extends Struct({
    requestId: Field,
    R: RequestVector,
    M: RequestVector,
}) {
    toFields(): Field[] {
        return [this.requestId, this.R.toFields(), this.M.toFields()].flat();
    }

    hash(): Field {
        return Poseidon.hash(this.toFields());
    }

    static fromFields(action: Field[]): RequestHelperAction {
        return super.fromFields(action) as RequestHelperAction;
    }
}

export class ReduceOutput extends Struct({
    // Actually don't need initialActionState, since we check initialActionStatus and finalActionState on-chain
    // Do this to increase security: from finding x,y that hash(x,y) = Z to finding x that hash(x,Y) = Z
    initialActionState: Field,
    initialActionStatus: Field,
    finalActionState: Field,
    finalActionStatus: Field,
}) {}

export const CreateReduce = ZkProgram({
    name: 'create-rollup-status',
    publicOutput: ReduceOutput,
    methods: {
        // First action to rollup
        firstStep: {
            privateInputs: [Field, Field],
            method(
                initialActionState: Field,
                initialActionStatus: Field
            ): ReduceOutput {
                return new ReduceOutput({
                    initialActionState,
                    initialActionStatus,
                    finalActionState: initialActionState,
                    finalActionStatus: initialActionStatus,
                });
            },
        },
        // Next actions to rollup
        nextStep: {
            privateInputs: [
                SelfProof<Void, ReduceOutput>,
                RequestHelperAction,
                MerkleMapWitness,
            ],
            method(
                earlierProof: SelfProof<Void, ReduceOutput>,
                action: RequestHelperAction,
                rollupStatusWitness: MerkleMapWitness
            ): ReduceOutput {
                // Verify earlier proof
                earlierProof.verify();

                // Calculate new action state == action id in the tree
                let newActionState = updateActionState(
                    earlierProof.publicOutput.finalActionState,
                    [action.toFields()]
                );

                // Current value of the action hash should be NOT_EXISTED
                let [root, key] = rollupStatusWitness.computeRootAndKey(
                    Field(ActionStatus.NOT_EXISTED)
                );
                key.assertEquals(newActionState);
                root.assertEquals(earlierProof.publicOutput.finalActionStatus);

                // New value of the action hash = REDUCED
                [root] = rollupStatusWitness.computeRootAndKey(
                    Field(ActionStatus.REDUCED)
                );

                return new ReduceOutput({
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    initialActionStatus:
                        earlierProof.publicOutput.initialActionStatus,
                    finalActionState: newActionState,
                    finalActionStatus: root,
                });
            },
        },
    },
});
export class CreateReduceProof extends ZkProgram.Proof(CreateReduce) {}

export class RollupActionsOutput extends Struct({
    requestId: Field,
    sum_R: RequestVector,
    sum_M: RequestVector,
    cur_T: Field,
    initialStatusRoot: Field,
    finalStatusRoot: Field,
}) {
    hash(): Field {
        return Poseidon.hash(
            [
                this.requestId,
                this.sum_R.toFields(),
                this.sum_M.toFields(),
                this.cur_T,
                this.initialStatusRoot,
                this.finalStatusRoot,
            ].flat()
        );
    }
}

export const CreateRollup = ZkProgram({
    name: 'rollup-actions',
    publicOutput: RollupActionsOutput,
    methods: {
        nextStep: {
            privateInputs: [
                SelfProof<Void, RollupActionsOutput>,
                RequestHelperAction,
                Field,
                MerkleMapWitness,
            ],

            method(
                earlierProof: SelfProof<Void, RollupActionsOutput>,
                action: RequestHelperAction,
                preActionState: Field,
                rollupStatusWitness: MerkleMapWitness
            ): RollupActionsOutput {
                earlierProof.verify();
                let requestId = action.requestId;
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

                let sum_R = earlierProof.publicOutput.sum_R;
                let sum_M = earlierProof.publicOutput.sum_M;

                for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
                    sum_R.set(
                        Field(i),
                        sum_R.get(Field(i)).add(action.R.get(Field(i)))
                    );
                    sum_M.set(
                        Field(i),
                        sum_M.get(Field(i)).add(action.M.get(Field(i)))
                    );
                }

                return new RollupActionsOutput({
                    requestId: requestId,
                    sum_R,
                    sum_M,
                    cur_T: earlierProof.publicOutput.cur_T.add(Field(1)),
                    initialStatusRoot:
                        earlierProof.publicOutput.initialStatusRoot,
                    finalStatusRoot: newRoot,
                });
            },
        },

        firstStep: {
            privateInputs: [Field, Field, Field],

            method(
                requestId: Field,
                REQUEST_MAX_SIZE: Field,
                initialStatusRoot: Field
            ): RollupActionsOutput {
                return new RollupActionsOutput({
                    requestId,
                    sum_R: RequestVector.empty(REQUEST_MAX_SIZE),
                    sum_M: RequestVector.empty(REQUEST_MAX_SIZE),
                    cur_T: Field(0),
                    initialStatusRoot,
                    finalStatusRoot: initialStatusRoot,
                });
            },
        },
    },
});

export class CreateRollupProof extends ZkProgram.Proof(CreateRollup) {}

export class RequestHelperContract extends SmartContract {
    @state(Field) actionState = State<Field>();
    @state(Field) actionStatus = State<Field>();
    @state(Field) R_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum R
    @state(Field) M_Root = State<Field>(); // hash(committeeId, keyId, requestTime) -> sum M

    reducer = Reducer({ actionType: RequestHelperAction });

    init() {
        super.init();
        this.actionState.set(Reducer.initialActionState);
        this.actionStatus.set(DefaultEmptyMerkleMapRoot);
        this.R_Root.set(DefaultEmptyMerkleMapRoot);
        this.M_Root.set(DefaultEmptyMerkleMapRoot);
    }

    @method request(requestInput: RequestHelperInput): {
        R: RequestVector;
        M: RequestVector;
    } {
        let requestId = requestInput.requestId();
        let dimension = requestInput.secretVector.length;
        let R = new RequestVector();
        let M = new RequestVector();
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
            let random = requestInput.random.get(Field(i)).toScalar();
            R.push(
                Provable.if(
                    Field(i).greaterThanOrEqual(dimension),
                    Group.fromFields([Field(0), Field(0)]),
                    Group.generator.scale(random)
                )
            );
            let M_i = Provable.if(
                Poseidon.hash(
                    requestInput.secretVector.get(Field(i)).toFields()
                ).equals(Poseidon.hash([Field(0), Field(0)])),
                Group.zero.add(
                    requestInput.committeePublicKey.toGroup().scale(random)
                ),
                Group.generator
                    .scale(requestInput.secretVector.get(Field(i)).toScalar())
                    .add(
                        requestInput.committeePublicKey.toGroup().scale(random)
                    )
            );
            M_i = Provable.if(
                Field(i).greaterThanOrEqual(dimension),
                Group.fromFields([Field(0), Field(0)]),
                M_i
            );
            M.push(M_i);
        }
        let dercementAmount = Field(REQUEST_MAX_SIZE).sub(dimension);
        R.decrementLength(dercementAmount);
        M.decrementLength(dercementAmount);

        this.reducer.dispatch(
            new RequestHelperAction({
                requestId,
                R,
                M,
            })
        );

        return { R, M };
    }

    @method rollupActionsState(proof: CreateReduceProof) {
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
    @method rollupRequest(
        proof: CreateRollupProof,
        R_wintess: MerkleMapWitness,
        M_wintess: MerkleMapWitness
    ) {
        proof.verify();

        let R_Root = this.R_Root.getAndRequireEquals();
        let M_Root = this.M_Root.getAndRequireEquals();
        let actionStatus = this.actionStatus.getAndRequireEquals();

        actionStatus.assertEquals(proof.publicOutput.initialStatusRoot);
        let [old_R_root, R_key] = R_wintess.computeRootAndKey(Field(0));
        let [old_M_root, M_key] = M_wintess.computeRootAndKey(Field(0));

        R_key.assertEquals(proof.publicOutput.requestId);
        M_key.assertEquals(proof.publicOutput.requestId);

        R_Root.assertEquals(old_R_root);
        M_Root.assertEquals(old_M_root);

        // to-do: adding check cur_T == T
        let [new_R_root] = R_wintess.computeRootAndKey(
            proof.publicOutput.sum_R.hash()
        );
        let [new_M_root] = M_wintess.computeRootAndKey(
            proof.publicOutput.sum_M.hash()
        );

        // update on-chain state
        this.R_Root.set(new_R_root);
        this.M_Root.set(new_M_root);
        this.actionStatus.set(proof.publicOutput.finalStatusRoot);

        // to-do: request to Request contract
        //...
    }
}
