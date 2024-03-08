import { Field, SelfProof, Struct, ZkProgram } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { ErrorEnum } from './constants.js';
import {
    ActionWitness,
    ProcessStatus,
    RollupStatus,
} from '../storages/SharedStorage.js';

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
                    let newActionState = Utils.updateActionState(
                        earlierProof.publicOutput.newActionState,
                        [ActionType.toFields(input)]
                    );

                    // Check the non-existence of the action
                    let [root, key] = rollupWitness.computeRootAndKey(
                        Field(RollupStatus.RECORDED)
                    );
                    root.assertEquals(
                        earlierProof.publicOutput.newRollupRoot,
                        Utils.buildAssertMessage(
                            name,
                            'nextStep',
                            ErrorEnum.ROLLUP_ROOT
                        )
                    );
                    key.assertEquals(
                        newActionState,
                        Utils.buildAssertMessage(
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
        Utils.buildAssertMessage(
            programName,
            'rollup',
            ErrorEnum.CURRENT_ACTION_STATE
        )
    );
    proofOutput.initialRollupRoot.assertEquals(
        initialRollupRoot,
        Utils.buildAssertMessage(programName, 'rollup', ErrorEnum.ROLLUP_ROOT)
    );
    proofOutput.newActionState.assertEquals(
        newActionState,
        Utils.buildAssertMessage(
            programName,
            'rollup',
            ErrorEnum.LAST_ACTION_STATE
        )
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
        Utils.buildAssertMessage(
            programName,
            'verifyRollup',
            ErrorEnum.ROLLUP_ROOT
        )
    );
    actionState.assertEquals(
        rollupIndex,
        Utils.buildAssertMessage(
            programName,
            'verifyRollup',
            ErrorEnum.ROLLUP_INDEX
        )
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
