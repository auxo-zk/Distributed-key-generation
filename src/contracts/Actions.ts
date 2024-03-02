import {
    Account,
    AccountUpdate,
    Bool,
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
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
import { ErrorEnum, EventEnum } from './constants.js';
import {
    ActionWitness,
    EMPTY_ACTION_MT,
    ProcessStatus,
    RollupStatus,
} from './SharedStorage.js';
import { BoolDynamicArray } from '@auxo-dev/auxo-libs';

export const ActionMask = (numActionTypes: number) => {
    return class _ActionMask extends BoolDynamicArray(numActionTypes) {
        static createMask(actionEnum: Field): _ActionMask {
            let emptyMask = _ActionMask.empty();
            emptyMask.set(actionEnum, Bool(true));
            return emptyMask;
        }
    };
};

export class RollupOutput extends Struct({
    initialActionState: Field,
    initialRollupRoot: Field,
    newActionState: Field,
    newRollupRoot: Field,
}) {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Rollup = (name: string, ActionType: any) =>
    ZkProgram({
        name: name,
        publicInput: ActionType,
        publicOutput: RollupOutput,
        methods: {
            firstStep: {
                privateInputs: [Field, Field],
                method(
                    input: typeof ActionType,
                    initialActionState: Field,
                    initialRollupRoot: Field
                ) {
                    return new RollupOutput({
                        initialActionState: initialActionState,
                        initialRollupRoot: initialRollupRoot,
                        newActionState: initialActionState,
                        newRollupRoot: initialRollupRoot,
                    });
                },
            },
            nextStep: {
                privateInputs: [
                    SelfProof<typeof ActionType, RollupOutput>,
                    ActionWitness,
                ],
                method(
                    input: typeof ActionType,
                    earlierProof: SelfProof<typeof ActionType, RollupOutput>,
                    rollupWitness: ActionWitness
                ) {
                    // Verify earlier proof
                    earlierProof.verify();

                    // Calculate corresponding action state
                    let newActionState = updateActionState(
                        earlierProof.publicOutput.newActionState,
                        [ActionType.toFields(input)]
                    );

                    // Check the non-existence of the action
                    let [root, key] = rollupWitness.computeRootAndKey(
                        Field(RollupStatus.RECORDED)
                    );
                    root.assertEquals(
                        earlierProof.publicOutput.newRollupRoot,
                        buildAssertMessage(
                            name,
                            'nextStep',
                            ErrorEnum.ROLLUP_ROOT
                        )
                    );
                    key.assertEquals(
                        newActionState,
                        buildAssertMessage(
                            name,
                            'nextStep',
                            ErrorEnum.ROLLUP_INDEX
                        )
                    );

                    return new RollupOutput({
                        initialActionState:
                            earlierProof.publicOutput.initialActionState,
                        initialRollupRoot:
                            earlierProof.publicOutput.initialRollupRoot,
                        newActionState: newActionState,
                        newRollupRoot: root,
                    });
                },
            },
        },
    });

export const rollup = (
    programName: string,
    proofOutput: RollupOutput,
    initialActionState: Field,
    initialRollupRoot: Field,
    newActionState: Field
) => {
    proofOutput.initialActionState.assertEquals(
        initialActionState,
        buildAssertMessage(
            programName,
            'rollup',
            ErrorEnum.CURRENT_ACTION_STATE
        )
    );
    proofOutput.initialRollupRoot.assertEquals(
        initialRollupRoot,
        buildAssertMessage(programName, 'rollup', ErrorEnum.ROLLUP_ROOT)
    );
    proofOutput.newActionState.assertEquals(
        newActionState,
        buildAssertMessage(programName, 'rollup', ErrorEnum.LAST_ACTION_STATE)
    );
};

export const verifyRollup = (
    programName: string,
    actionState: Field,
    root: Field,
    witness: ActionWitness
) => {
    let [rollupRoot, rollupIndex] = witness.computeRootAndKey(
        Field(RollupStatus.RECORDED)
    );
    root.assertEquals(
        rollupRoot,
        buildAssertMessage(programName, 'verifyRollup', ErrorEnum.ROLLUP_ROOT)
    );
    actionState.assertEquals(
        rollupIndex,
        buildAssertMessage(programName, 'verifyRollup', ErrorEnum.ROLLUP_INDEX)
    );
};

export const processAction = (
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
        buildAssertMessage(programName, 'process', ErrorEnum.PROCESS_ROOT)
    );
    key.assertEquals(
        actionState,
        buildAssertMessage(programName, 'process', ErrorEnum.PROCESS_INDEX)
    );

    return witness.computeRootAndKey(Field(ProcessStatus.PROCESSED))[0];
};

export class RollupAction extends Struct({
    actionHash: Field,
    contractAddress: PublicKey,
}) {}

export const RecursiveRollup = Rollup('RecursiveRollup', Field);

export class RollupProof extends ZkProgram.Proof(RecursiveRollup) {}

export class RollupContract extends SmartContract {
    /**
     * @description Latest rolluped action's state
     */
    @state(Field) actionState = State<Field>();

    /**
     * @description MT storing actions' rollup state
     */
    @state(Field) rollupRoot = State<Field>();

    /**
     * @description MT storing actions' counter values
     */
    @state(Field) counterRoot = State<Field>();

    reducer = Reducer({ actionType: RollupAction });

    events = {
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.actionState.set(Reducer.initialActionState);
        this.rollupRoot.set(EMPTY_ACTION_MT().getRoot());
    }

    @method recordAction(actionHash: Field, address: PublicKey) {
        // Verify whitelist address (optional)
        let update = AccountUpdate.create(address);

        // Create and dispatch action
        let action = new RollupAction({
            actionHash: actionHash,
            contractAddress: address,
        });
        this.reducer.dispatch(action);
    }

    @method rollup(proof: RollupProof) {
        // Get current state values
        let curActionState = this.actionState.getAndRequireEquals();
        let rollupRoot = this.rollupRoot.getAndRequireEquals();
        let lastActionState = this.account.actionState.getAndRequireEquals();

        // Verify proof
        proof.verify();
        rollup(
            RollupContract.name,
            proof.publicOutput,
            curActionState,
            rollupRoot,
            lastActionState
        );

        // Update state values
        this.rollupRoot.set(proof.publicOutput.newRollupRoot);

        // Emit events
        this.emitEvent(EventEnum.ROLLUPED, lastActionState);
    }
}
