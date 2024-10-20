import {
    Bool,
    Field,
    Poseidon,
    SelfProof,
    Struct,
    Void,
    ZkProgram,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { ErrorEnum, ZkProgramEnum } from '../constants.js';
import { Action, ResolveActions } from './actions.js';
import {
    EmptyPlainMT,
    PlainWitness,
    PlainWitnesses,
    RequestWitness,
} from '../../merklized.js';
import { RequestInfoStorage } from './storages.js';
import { ENC_LIMITS } from '../../constants.js';

export { RollupRequest, RollupRequestOutput, RollupRequestProof };

class RollupRequestOutput extends Struct({
    initialActionState: Field,
    initialRequestCounter: Field,
    initialInfoRoot: Field,
    initialTaskRefRoot: Field,
    initialVectorEncryptionRootsHash: Field,
    initialResultRoot: Field,
    initialIndexCounterRoot: Field,
    nextActionState: Field,
    nextRequestCounter: Field,
    nextInfoRoot: Field,
    nextTaskRefRoot: Field,
    nextVectorEncryptionRootsHash: Field,
    nextResultRoot: Field,
    nextIndexCounterRoot: Field,
}) {}

/**
 * @todo Prevent failure for duplicated resolve actions
 */
const RollupRequest = ZkProgram({
    name: ZkProgramEnum.RollupRequest,
    publicOutput: RollupRequestOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field, Field, Field],
            async method(
                initialActionState: Field,
                initialRequestCounter: Field,
                initialInfoRoot: Field,
                initialTaskRefRoot: Field,
                initialVectorEncryptionRootsHash: Field,
                initialResultRoot: Field,
                initialIndexCounterRoot: Field
            ) {
                return new RollupRequestOutput({
                    initialActionState,
                    initialRequestCounter,
                    initialInfoRoot,
                    initialTaskRefRoot,
                    initialVectorEncryptionRootsHash,
                    initialResultRoot,
                    initialIndexCounterRoot,
                    nextActionState: initialActionState,
                    nextRequestCounter: initialRequestCounter,
                    nextInfoRoot: initialInfoRoot,
                    nextTaskRefRoot: initialTaskRefRoot,
                    nextVectorEncryptionRootsHash:
                        initialVectorEncryptionRootsHash,
                    nextResultRoot: initialResultRoot,
                    nextIndexCounterRoot: initialIndexCounterRoot,
                });
            },
        },
        initialize: {
            privateInputs: [
                SelfProof<Void, RollupRequestOutput>,
                Action,
                RequestWitness,
                RequestWitness,
                RequestWitness,
                RequestWitness,
                RequestWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupRequestOutput>,
                action: Action,
                infoWitness: RequestWitness,
                taskRefWitness: RequestWitness,
                vectorREncryptionWitness: RequestWitness,
                vectorMEncryptionWitness: RequestWitness,
                resultWitness: RequestWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Calculate request ID
                let requestId = earlierProof.publicOutput.nextRequestCounter;

                // Verify empty info
                earlierProof.publicOutput.nextInfoRoot.assertEquals(
                    infoWitness.calculateRoot(Field(0))
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.KEY_INDEX_ROOT
                    // )
                );
                requestId.assertEquals(
                    infoWitness.calculateIndex()
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.KEY_INDEX_INDEX
                    // )
                );

                // Verify empty task ref
                earlierProof.publicOutput.nextTaskRefRoot.assertEquals(
                    taskRefWitness.calculateRoot(Field(0))
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.TASK_ID_ROOT
                    // )
                );
                requestId.assertEquals(
                    taskRefWitness.calculateIndex()
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.TASK_ID_INDEX
                    // )
                );

                // Verify empty encryption data
                earlierProof.publicOutput.nextVectorEncryptionRootsHash.assertEquals(
                    Poseidon.hash([
                        vectorREncryptionWitness.calculateRoot(Field(0)),
                        vectorMEncryptionWitness.calculateRoot(Field(0)),
                    ])
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.ACCUMULATION_ROOT
                    // )
                );
                requestId.assertEquals(
                    vectorREncryptionWitness.calculateIndex()
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.ACCUMULATION_INDEX_L1
                    // )
                );
                requestId.assertEquals(
                    vectorMEncryptionWitness.calculateIndex()
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.ACCUMULATION_INDEX_L1
                    // )
                );

                // Verify empty result
                earlierProof.publicOutput.nextResultRoot.assertEquals(
                    resultWitness.calculateRoot(Field(0))
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.REQUEST_RESULT_ROOT
                    // )
                );
                requestId.assertEquals(
                    resultWitness.calculateIndex()
                    // Utils.buildAssertMessage(
                    //     RollupRequest.name,
                    //     'initialize',
                    //     ErrorEnum.REQUEST_RESULT_INDEX_L1
                    // )
                );

                // Update requestCounter
                let nextRequestCounter = requestId.add(1);

                // Update infoRoot
                let nextInfoRoot = infoWitness.calculateRoot(
                    RequestInfoStorage.calculateLeaf({
                        committeeId: action.committeeId,
                        keyId: action.keyId,
                        deadline: action.deadline,
                        dimension: action.index1,
                    })
                );

                // Update taskRefRoot
                let nextTaskRefRoot = taskRefWitness.calculateRoot(
                    action.taskRef
                );

                // Update vectorEncryptionRoot
                let nextVectorEncryptionRootsHash = Poseidon.hash([
                    vectorREncryptionWitness.calculateRoot(
                        action.rAccumulationRoot
                    ),
                    vectorMEncryptionWitness.calculateRoot(
                        action.mAccumulationRoot
                    ),
                ]);

                let nextResultRoot = resultWitness.calculateRoot(
                    EmptyPlainMT().getRoot()
                );

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(action)]
                );

                return new RollupRequestOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextRequestCounter,
                    nextInfoRoot,
                    nextTaskRefRoot,
                    nextVectorEncryptionRootsHash,
                    nextResultRoot,
                });
            },
        },
        resolve: {
            privateInputs: [
                SelfProof<Void, RollupRequestOutput>,
                ResolveActions,
                Field,
                RequestWitness,
                PlainWitnesses,
                RequestWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupRequestOutput>,
                actions: ResolveActions,
                indexCounter: Field,
                resultWitness: RequestWitness,
                plainWitnesses: PlainWitnesses,
                indexCounterWitness: RequestWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let invalidAction = Bool(false);
                let { nextResultRoot, nextIndexCounterRoot } =
                    earlierProof.publicOutput;

                // Verify index counter
                let requestId = resultWitness.calculateIndex();
                earlierProof.publicOutput.nextIndexCounterRoot.assertEquals(
                    indexCounterWitness.calculateRoot(indexCounter)
                );
                requestId.assertEquals(indexCounterWitness.calculateIndex());

                // Process actions
                for (let i = 0; i < ENC_LIMITS.SUB_DIMENSION / 2; i++) {
                    let action = actions.get(Field(i)) as Action;
                    for (let j = 0; j < Action.numResults; j++) {
                        // Verify empty result
                        let plainWitness = plainWitnesses.get(
                            Field(i + j)
                        ) as PlainWitness;
                        invalidAction = Utils.checkInvalidAction(
                            invalidAction,
                            nextResultRoot
                                .equals(
                                    resultWitness.calculateRoot(
                                        plainWitness.calculateRoot(Field(0))
                                    )
                                )
                                .and(
                                    indexCounter
                                        .add(Field(i + j))
                                        .lessThan(action.dimension)
                                ),
                            Utils.buildAssertMessage(
                                RollupRequest.name,
                                'resolve',
                                ErrorEnum.REQUEST_RESULT_ROOT
                            )
                        );
                        action.indices[j].assertEquals(
                            plainWitness.calculateIndex()
                        );
                        action.requestId.assertEquals(requestId);

                        // Update resultRoot
                        nextResultRoot = resultWitness.calculateRoot(
                            plainWitness.calculateRoot(
                                action.results[j].mul(
                                    invalidAction.not().toField()
                                )
                            )
                        );
                    }
                }
                // Update indexCounterRoot
                let nextIndexCounter = indexCounter.add(
                    Field(ENC_LIMITS.SUB_DIMENSION).mul(
                        invalidAction.not().toField()
                    )
                );

                // Update indexCounterRoot
                nextIndexCounterRoot =
                    indexCounterWitness.calculateRoot(nextIndexCounter);

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    actions.values.map((action) => Action.toFields(action))
                );

                return new RollupRequestOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextResultRoot,
                    nextIndexCounterRoot,
                });
            },
        },
    },
});

class RollupRequestProof extends ZkProgram.Proof(RollupRequest) {}
