import {
    Field,
    Poseidon,
    PublicKey,
    Reducer,
    SelfProof,
    SmartContract,
    State,
    Struct,
    ZkProgram,
    method,
    state,
} from 'o1js';
import { ErrorEnum, EventEnum } from './constants.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    RollupStatus,
} from '../storages/SharedStorage.js';
import { ZkProgramEnum } from '../constants.js';
import { EMPTY_ROLLUP_MT, RollupWitness } from '../storages/RollupStorage.js';
import {
    buildAssertMessage,
    requireCaller,
    updateActionState,
} from '../libs/utils.js';

export class Action extends Struct({
    address: PublicKey,
    actionHash: Field,
}) {}

export class RollupOutput extends Struct({
    initialCounterRoot: Field,
    initialRollupRoot: Field,
    initialActionState: Field,
    nextCounterRoot: Field,
    nextRollupRoot: Field,
    nextActionState: Field,
}) {}

export const Rollup = ZkProgram({
    name: ZkProgramEnum.RollupMulti,
    publicInput: Action,
    publicOutput: RollupOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field],
            method(
                input: Action,
                initialCounterRoot: Field,
                initialRollupRoot: Field,
                initialActionState: Field
            ) {
                return new RollupOutput({
                    initialCounterRoot: initialCounterRoot,
                    initialRollupRoot: initialRollupRoot,
                    initialActionState: initialActionState,
                    nextCounterRoot: initialCounterRoot,
                    nextRollupRoot: initialRollupRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<Action, RollupOutput>,
                Field,
                RollupWitness,
                ActionWitness,
            ],
            method(
                input: Action,
                earlierProof: SelfProof<Action, RollupOutput>,
                counter: Field,
                counterWitness: RollupWitness,
                rollupWitness: ActionWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                earlierProof.publicOutput.nextCounterRoot.assertEquals(
                    counterWitness.calculateRoot(counter),
                    buildAssertMessage(
                        Rollup.name,
                        Rollup.nextStep.name,
                        ErrorEnum.ACTION_COUNTER_ROOT
                    )
                );
                Poseidon.hash(input.address.toFields()).assertEquals(
                    counterWitness.calculateIndex(),
                    buildAssertMessage(
                        Rollup.name,
                        Rollup.nextStep.name,
                        ErrorEnum.ACTION_COUNTER_INDEX
                    )
                );
                let nextCounterRoot = counterWitness.calculateRoot(
                    counter.add(1)
                );

                let actionIndex = Poseidon.hash(
                    [input.address.toFields(), input.actionHash, counter].flat()
                );
                let [rollupRoot, rollupIndex] = rollupWitness.computeRootAndKey(
                    Field(RollupStatus.RECORDED)
                );
                earlierProof.publicOutput.nextRollupRoot.assertEquals(
                    rollupRoot,
                    buildAssertMessage(
                        Rollup.name,
                        Rollup.nextStep.name,
                        ErrorEnum.ROLLUP_ROOT
                    )
                );
                actionIndex.assertEquals(
                    rollupIndex,
                    buildAssertMessage(
                        Rollup.name,
                        Rollup.nextStep.name,
                        ErrorEnum.ROLLUP_INDEX
                    )
                );
                let [nextRollupRoot] = rollupWitness.computeRootAndKey(
                    Field(RollupStatus.ROLLUPED)
                );

                // Calculate corresponding action state
                let nextActionState = updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(input)]
                );

                return new RollupOutput({
                    initialCounterRoot:
                        earlierProof.publicOutput.initialCounterRoot,
                    initialRollupRoot:
                        earlierProof.publicOutput.initialRollupRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextCounterRoot: nextCounterRoot,
                    nextRollupRoot: nextRollupRoot,
                    nextActionState: nextActionState,
                });
            },
        },
    },
});

export class RollupProof extends ZkProgram.Proof(Rollup) {}

export class RollupContract extends SmartContract {
    /**
     * @description MT storing latest action state values
     */
    @state(Field) counterRoot = State<Field>();

    /**
     * @description MT storing actions' rollup state
     */
    @state(Field) rollupRoot = State<Field>();

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
        this.counterRoot.set(EMPTY_ROLLUP_MT().getRoot());
        this.rollupRoot.set(EMPTY_ACTION_MT().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    @method recordAction(actionHash: Field, address: PublicKey) {
        // Verify caller address
        requireCaller(address, this);

        // Create & dispatch action
        let action = new Action({
            actionHash,
            address,
        });
        this.reducer.dispatch(action);
    }

    @method rollup(proof: RollupProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let counterRoot = this.counterRoot.getAndRequireEquals();
        let rollupRoot = this.rollupRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        proof.publicOutput.initialActionState.assertEquals(
            curActionState,
            buildAssertMessage(
                RollupContract.name,
                RollupContract.prototype.rollup.name,
                ErrorEnum.CURRENT_ACTION_STATE
            )
        );
        proof.publicOutput.initialCounterRoot.assertEquals(
            counterRoot,
            buildAssertMessage(
                RollupContract.name,
                RollupContract.prototype.rollup.name,
                ErrorEnum.ACTION_COUNTER_ROOT
            )
        );
        proof.publicOutput.initialRollupRoot.assertEquals(
            rollupRoot,
            buildAssertMessage(
                RollupContract.name,
                RollupContract.prototype.rollup.name,
                ErrorEnum.ROLLUP_ROOT
            )
        );
        proof.publicOutput.nextActionState.assertEquals(
            lastActionState,
            buildAssertMessage(
                RollupContract.name,
                RollupContract.prototype.rollup.name,
                ErrorEnum.LAST_ACTION_STATE
            )
        );

        // Update new state values
        this.counterRoot.set(proof.publicOutput.nextCounterRoot);
        this.rollupRoot.set(proof.publicOutput.nextRollupRoot);
        this.actionState.set(proof.publicOutput.nextActionState);
    }
}
