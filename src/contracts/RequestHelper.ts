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
    Void,
    ZkProgram,
} from 'o1js';
import { updateActionState } from '../libs/utils.js';
import { REQUEST_MAX_SIZE, ZkProgramEnum } from '../constants.js';
import {
    RandomVector,
    RequestVector,
    SecretVector,
} from '../libs/Requester.js';
import { Rollup } from './Rollup.js';
import { ActionWitness } from './SharedStorage.js';

export class Action extends Struct({
    committeeId: Field,
    keyId: Field,
    requestId: Field,
    R: RequestVector,
    M: RequestVector,
}) {
    static empty(): Action {
        return new Action({
            committeeId: Field(0),
            keyId: Field(0),
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
    sum_R: RequestVector,
    sum_M: RequestVector,
    // cur_T: Field,        // unnecessary?
}) {}

export const AccumulateEncryption = ZkProgram({
    name: ZkProgramEnum.AccumulateEncryption,
    publicInput: AccumulateEncryptionInput,
    publicOutput: AccumulateEncryptionOutput,
    methods: {
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

export class RequesterContract extends SmartContract {
    @state(Field) actionState = State<Field>();
    @state(Field) actionStatus = State<Field>();
    @state(Field) accumulatedRRoot = State<Field>();
    @state(Field) accumulatedMRoot = State<Field>();

    reducer = Reducer({ actionType: Action });

    init() {
        super.init();
        this.actionState.set(Reducer.initialActionState);
        this.actionStatus.set(DefaultEmptyMerkleMapRoot);
        this.accumulatedRRoot.set(DefaultEmptyMerkleMapRoot);
        this.accumulatedMRoot.set(DefaultEmptyMerkleMapRoot);
    }

    @method request(
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
            proof.publicOutput.sum_R.hash()
        );
        let [new_M_root] = M_witness.computeRootAndKey(
            proof.publicOutput.sum_M.hash()
        );

        // update on-chain state
        this.accumulatedRRoot.set(new_R_root);
        this.accumulatedMRoot.set(new_M_root);
        this.actionStatus.set(proof.publicOutput.finalStatusRoot);

        // to-do: request to Request contract
        //...
    }
}
