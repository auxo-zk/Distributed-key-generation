import { Field, SelfProof, Struct, ZkProgram } from 'o1js';
import { buildAssertMessage, updateActionState } from '../libs/utils.js';
import { ErrorEnum } from './shared.js';
import { ActionWitness, RollupStatus } from './SharedStorage.js';

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
                        Field(RollupStatus.NOT_EXISTED)
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
                            ErrorEnum.ROLLUP_KEY
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
