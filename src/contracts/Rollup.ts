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
import { Utils } from '@auxo-dev/auxo-libs';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    ProcessStatus,
    RollupStatus,
} from '../storages/SharedStorage.js';
import { EMPTY_ROLLUP_MT, RollupWitness } from '../storages/RollupStorage.js';
import { ErrorEnum, EventEnum } from './constants.js';
import { ZkProgramEnum } from '../constants.js';

export {
    Action as RollupAction,
    RollupOutput,
    Rollup,
    RollupProof,
    RollupContract,
    verifyRollup,
    rollup,
    rollupWithMT,
    processAction,
};

class Action extends Struct({
    address: PublicKey,
    actionHash: Field,
}) {}

class RollupOutput extends Struct({
    initialCounterRoot: Field,
    initialRollupRoot: Field,
    initialActionState: Field,
    nextCounterRoot: Field,
    nextRollupRoot: Field,
    nextActionState: Field,
}) {}

const Rollup = ZkProgram({
    name: ZkProgramEnum.Rollup,
    publicInput: Action,
    publicOutput: RollupOutput,
    methods: {
        init: {
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
        rollup: {
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
                    Utils.buildAssertMessage(
                        Rollup.name,
                        Rollup.rollup.name,
                        ErrorEnum.ACTION_COUNTER_ROOT
                    )
                );
                Poseidon.hash(input.address.toFields()).assertEquals(
                    counterWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        Rollup.name,
                        Rollup.rollup.name,
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
                    Utils.buildAssertMessage(
                        Rollup.name,
                        Rollup.rollup.name,
                        ErrorEnum.ROLLUP_ROOT
                    )
                );
                actionIndex.assertEquals(
                    rollupIndex,
                    Utils.buildAssertMessage(
                        Rollup.name,
                        Rollup.rollup.name,
                        ErrorEnum.ROLLUP_INDEX
                    )
                );
                let [nextRollupRoot] = rollupWitness.computeRootAndKey(
                    Field(RollupStatus.ROLLUPED)
                );

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
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

class RollupProof extends ZkProgram.Proof(Rollup) {}

class RollupContract extends SmartContract {
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

    /**
     * Record an action from caller contract
     * @param actionHash Action's hash
     * @param address Caller's address
     */
    @method recordAction(actionHash: Field, address: PublicKey) {
        // Verify caller address
        Utils.requireCaller(address, this);

        // Create & dispatch action
        let action = new Action({
            actionHash,
            address,
        });
        this.reducer.dispatch(action);
    }

    /**
     * Rollup actions to latest state
     * @param proof Verification proof
     */
    @method rollup(proof: RollupProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let counterRoot = this.counterRoot.getAndRequireEquals();
        let rollupRoot = this.rollupRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();

        // Verify rollup
        rollupWithMT(
            RollupContract.name,
            proof.publicOutput,
            curActionState,
            lastActionState,
            rollupRoot
        );

        // Verify counter value
        proof.publicOutput.initialCounterRoot.assertEquals(
            counterRoot,
            Utils.buildAssertMessage(
                RollupContract.name,
                RollupContract.prototype.rollup.name,
                ErrorEnum.ACTION_COUNTER_ROOT
            )
        );

        // Update new state values
        this.counterRoot.set(proof.publicOutput.nextCounterRoot);
        this.rollupRoot.set(proof.publicOutput.nextRollupRoot);
        this.actionState.set(proof.publicOutput.nextActionState);
    }
}

const verifyRollup = (
    programName: string,
    root: Field,
    actionIndex: Field,
    witness: ActionWitness
) => {
    let [rollupRoot, rollupIndex] = witness.computeRootAndKey(
        Field(RollupStatus.RECORDED)
    );
    root.assertEquals(
        rollupRoot,
        Utils.buildAssertMessage(
            programName,
            'verifyRollup',
            ErrorEnum.ROLLUP_ROOT
        )
    );
    actionIndex.assertEquals(
        rollupIndex,
        Utils.buildAssertMessage(
            programName,
            'verifyRollup',
            ErrorEnum.ROLLUP_INDEX
        )
    );
};

const rollup = (
    programName: string,
    proofOutput: {
        initialActionState: Field;
        nextActionState: Field;
    },
    initialActionState: Field,
    nextActionState: Field
) => {
    proofOutput.initialActionState.assertEquals(
        initialActionState,
        Utils.buildAssertMessage(
            programName,
            'rollup',
            ErrorEnum.CURRENT_ACTION_STATE
        )
    );
    proofOutput.nextActionState.assertEquals(
        nextActionState,
        Utils.buildAssertMessage(
            programName,
            'rollup',
            ErrorEnum.LAST_ACTION_STATE
        )
    );
};

const rollupWithMT = (
    programName: string,
    proofOutput: {
        initialActionState: Field;
        nextActionState: Field;
        initialRollupRoot: Field;
    },
    initialActionState: Field,
    nextActionState: Field,
    initialRollupRoot: Field
) => {
    proofOutput.initialActionState.assertEquals(
        initialActionState,
        Utils.buildAssertMessage(
            programName,
            'rollup',
            ErrorEnum.CURRENT_ACTION_STATE
        )
    );
    proofOutput.nextActionState.assertEquals(
        nextActionState,
        Utils.buildAssertMessage(
            programName,
            'rollup',
            ErrorEnum.LAST_ACTION_STATE
        )
    );
    proofOutput.initialRollupRoot.assertEquals(
        initialRollupRoot,
        Utils.buildAssertMessage(programName, 'rollup', ErrorEnum.ROLLUP_ROOT)
    );
};

const processAction = (
    programName: string,
    actionState: Field,
    previousRoot: Field,
    witness: ActionWitness
): Field => {
    let [root, key] = witness.computeRootAndKey(
        Field(ProcessStatus.NOT_PROCESSED)
    );
    root.assertEquals(
        previousRoot,
        Utils.buildAssertMessage(programName, 'process', ErrorEnum.PROCESS_ROOT)
    );
    key.assertEquals(
        actionState,
        Utils.buildAssertMessage(
            programName,
            'process',
            ErrorEnum.PROCESS_INDEX
        )
    );

    return witness.computeRootAndKey(Field(ProcessStatus.PROCESSED))[0];
};
