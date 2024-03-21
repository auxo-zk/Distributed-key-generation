import {
    Field,
    Poseidon,
    Provable,
    Reducer,
    SelfProof,
    SmartContract,
    State,
    Struct,
    UInt8,
    ZkProgram,
    method,
    state,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import {
    EMPTY_ROLLUP_COUNTER_MT,
    EMPTY_ROLLUP_MT,
    RollupCounterWitness,
    RollupWitness,
    calculateActionIndex,
} from '../storages/RollupStorage.js';
import { ErrorEnum, EventEnum } from './constants.js';
import { ZkProgramEnum } from '../constants.js';
import { ZkAppRef } from '../storages/SharedStorage.js';

export {
    Action as RollupAction,
    RollupOutput,
    Rollup,
    RollupProof,
    RollupContract,
    rollup,
    rollupWithMT,
    verifyRollup,
    processAction,
};

class Action extends Struct({
    zkAppIndex: Field,
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
                RollupCounterWitness,
                RollupWitness,
            ],
            method(
                input: Action,
                earlierProof: SelfProof<Action, RollupOutput>,
                counter: Field,
                counterWitness: RollupCounterWitness,
                rollupWitness: RollupWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify zkApp's action counter
                earlierProof.publicOutput.nextCounterRoot.assertEquals(
                    counterWitness.calculateRoot(counter),
                    Utils.buildAssertMessage(
                        Rollup.name,
                        Rollup.rollup.name,
                        ErrorEnum.ACTION_COUNTER_ROOT
                    )
                );
                input.zkAppIndex.assertEquals(
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

                // Verify empty action
                let actionIndex = calculateActionIndex(
                    input.zkAppIndex,
                    counter
                );
                earlierProof.publicOutput.nextRollupRoot.assertEquals(
                    rollupWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        Rollup.name,
                        Rollup.rollup.name,
                        ErrorEnum.ROLLUP_ROOT
                    )
                );
                actionIndex.assertEquals(
                    rollupWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        Rollup.name,
                        Rollup.rollup.name,
                        ErrorEnum.ROLLUP_INDEX
                    )
                );
                let nextRollupRoot = rollupWitness.calculateRoot(
                    input.actionHash
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
     * @description MT storing addresses of other zkApps
     */
    @state(Field) zkAppRoot = State<Field>();

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
        this.counterRoot.set(EMPTY_ROLLUP_COUNTER_MT().getRoot());
        this.rollupRoot.set(EMPTY_ROLLUP_MT().getRoot());
        this.actionState.set(Reducer.initialActionState);
    }

    /**
     * Record an action from caller contract
     * @param actionHash Action's hash
     * @param address Caller's address
     */
    @method recordAction(actionHash: Field, zkApp: ZkAppRef) {
        // Verify registered caller address
        Utils.requireCaller(zkApp.address, this);
        this.zkAppRoot
            .getAndRequireEquals()
            .assertEquals(
                zkApp.witness.calculateRoot(
                    Poseidon.hash(zkApp.address.toFields())
                ),
                Utils.buildAssertMessage(
                    RollupContract.name,
                    'verifyZkApp',
                    ErrorEnum.ZKAPP_ROOT
                )
            );

        // Create & dispatch action
        let action = new Action({
            zkAppIndex: zkApp.witness.calculateIndex(),
            actionHash,
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

    /**
     * Verify an action has been rolluped
     * @param actionIndex Unique action index
     * @param actionHash Action's hash
     * @param witness Witness for proof of action rollup
     */
    verifyRollup(
        actionIndex: Field,
        actionHash: Field,
        witness: RollupWitness
    ) {
        verifyRollup(
            RollupContract.name,
            actionIndex,
            actionHash,
            this.rollupRoot.getAndRequireEquals(),
            witness
        );
    }
}

function rollup(
    programName: string,
    proofOutput: {
        initialActionState: Field;
        nextActionState: Field;
    },
    initialActionState: Field,
    nextActionState: Field
) {
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
}

function rollupWithMT(
    programName: string,
    proofOutput: {
        initialActionState: Field;
        nextActionState: Field;
        initialRollupRoot: Field;
    },
    initialActionState: Field,
    nextActionState: Field,
    initialRollupRoot: Field
) {
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
}

function verifyRollup(
    programName: string,
    actionIndex: Field,
    actionHash: Field,
    root: Field,
    witness: RollupWitness
) {
    root.assertEquals(
        witness.calculateRoot(actionHash),
        Utils.buildAssertMessage(
            programName,
            'verifyRollup',
            ErrorEnum.ROLLUP_ROOT
        )
    );
    actionIndex.assertEquals(
        witness.calculateIndex(),
        Utils.buildAssertMessage(
            programName,
            'verifyRollup',
            ErrorEnum.ROLLUP_INDEX
        )
    );
}

function processAction(
    programName: string,
    actionId: Field,
    processId: UInt8,
    actionState: Field,
    previousRoot: Field,
    witness: RollupWitness
): Field {
    previousRoot.assertEquals(
        witness.calculateRoot(
            Provable.switch(
                [
                    processId.value.equals(Field(0)),
                    processId.value.equals(Field(1)),
                    processId.greaterThan(1),
                ],
                Field,
                [
                    Field(0),
                    actionState,
                    Poseidon.hash([actionState, processId.sub(1).value]),
                ]
            )
        ),
        Utils.buildAssertMessage(programName, 'process', ErrorEnum.PROCESS_ROOT)
    );
    actionId.assertEquals(
        witness.calculateIndex(),
        Utils.buildAssertMessage(
            programName,
            'process',
            ErrorEnum.PROCESS_INDEX
        )
    );

    return witness.calculateRoot(
        Provable.if(
            processId.greaterThan(0),
            Poseidon.hash([actionState, processId.value]),
            actionState
        )
    );
}
