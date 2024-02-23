import { Field, Provable, SelfProof, Struct, ZkProgram } from 'o1js';
import { updateActionState } from '../libs/utils.js';
import { Action as DkgAction } from './DKG.js';
import { Action as Round1Action } from './Round1.js';
import { RollupDkg as RollupDkg1 } from './DKG.js';
import { compile } from '../scripts/helper/deploy.js';

export class RollupOutput extends Struct({
    initialActionState: Field,
    newActionState: Field,
}) {}

export const Rollup = (name: string, ActionType: any) =>
    ZkProgram({
        name: name,
        publicInput: ActionType,
        publicOutput: RollupOutput,
        methods: {
            firstStep: {
                privateInputs: [Field],
                method(input: typeof ActionType, initialActionState: Field) {
                    return new RollupOutput({
                        initialActionState: initialActionState,
                        newActionState: initialActionState,
                    });
                },
            },
            nextStep: {
                privateInputs: [SelfProof<typeof ActionType, RollupOutput>],
                method(
                    input: typeof ActionType,
                    earlierProof: SelfProof<typeof ActionType, RollupOutput>
                ) {
                    // Verify earlier proof
                    earlierProof.verify();

                    // Calculate corresponding action state
                    let newActionState = updateActionState(
                        earlierProof.publicOutput.newActionState,
                        [ActionType.toFields(input)]
                    );

                    return new RollupOutput({
                        initialActionState:
                            earlierProof.publicOutput.initialActionState,
                        newActionState: newActionState,
                    });
                },
            },
        },
    });

async function main() {
    const RollupDkg = Rollup('RollupDkg', DkgAction);

    Provable.log(await compile(RollupDkg));
    Provable.log(await compile(RollupDkg1));
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
