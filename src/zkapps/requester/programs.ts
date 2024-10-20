import {
    Field,
    Group,
    Poseidon,
    SelfProof,
    Struct,
    UInt32,
    UInt64,
    Void,
    ZkProgram,
} from 'o1js';
import { SubVectorGroupArray } from '../../libs/types.js';
import { Action, EncryptActions } from './actions.js';
import { ErrorEnum, ZkProgramEnum } from '../constants.js';
import {
    CipherWitness,
    CipherWitnesses,
    CommitmentWitness,
    CommitmentWitnesses,
    EmptyCipherMT,
    TaskWitness,
} from '../../merklized.js';
import { ENC_LIMITS, INST_LIMITS } from '../../constants.js';
import { Utils } from '@auxo-dev/auxo-libs';
import { InfoStorage, AccumulationStorage } from './storages.js';

export { RollupTask, RollupTaskOutput, RollupTaskProof };

class RollupTaskOutput extends Struct({
    initialActionState: Field,
    initialBlocknumber: UInt32,
    initialTaskCounter: UInt32,
    initialCommitmentCounter: UInt64,
    initialInfoRoot: Field,
    initialAccumulationRootsHash: Field,
    initialCommitmentRoot: Field,
    nextActionState: Field,
    nextBlocknumber: UInt32,
    nextTaskCounter: UInt32,
    nextCommitmentCounter: UInt64,
    nextInfoRoot: Field,
    nextAccumulationRootsHash: Field,
    nextCommitmentRoot: Field,
}) {}

const RollupTask = ZkProgram({
    name: ZkProgramEnum.RollupTask,
    publicOutput: RollupTaskOutput,
    methods: {
        init: {
            privateInputs: [Field, UInt32, UInt32, UInt64, Field, Field, Field],
            async method(
                initialActionState: Field,
                initialBlocknumber: UInt32,
                initialTaskCounter: UInt32,
                initialCommitmentCounter: UInt64,
                initialInfoRoot: Field,
                initialAccumulationRootsHash: Field,
                initialCommitmentRoot: Field
            ) {
                return new RollupTaskOutput({
                    initialActionState,
                    initialBlocknumber,
                    initialTaskCounter,
                    initialCommitmentCounter,
                    initialInfoRoot,
                    initialAccumulationRootsHash,
                    initialCommitmentRoot,
                    nextActionState: initialActionState,
                    nextBlocknumber: initialBlocknumber,
                    nextTaskCounter: initialTaskCounter,
                    nextCommitmentCounter: initialCommitmentCounter,
                    nextInfoRoot: initialInfoRoot,
                    nextAccumulationRootsHash: initialAccumulationRootsHash,
                    nextCommitmentRoot: initialCommitmentRoot,
                });
            },
        },

        create: {
            privateInputs: [
                SelfProof<Void, RollupTaskOutput>,
                Action,
                TaskWitness,
                TaskWitness,
                TaskWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupTaskOutput>,
                action: Action,
                infoWitness: TaskWitness,
                rAccumulationWitness: TaskWitness,
                mAccumulationWitness: TaskWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                action.taskId.assertEquals(INST_LIMITS.TASK);

                // Verify empty key info
                let taskId = earlierProof.publicOutput.nextTaskCounter;
                earlierProof.publicOutput.nextInfoRoot.assertEquals(
                    infoWitness.calculateRoot(Field(0))
                    // Utils.buildAssertMessage(
                    //     RollupTask.name,
                    //     'create',
                    //     ErrorEnum.KEY_INDEX_ROOT
                    // )
                );
                taskId.value.assertEquals(
                    infoWitness.calculateIndex()
                    // Utils.buildAssertMessage(
                    //     RollupTask.name,
                    //     'create',
                    //     ErrorEnum.KEY_INDEX_INDEX
                    // )
                );

                // Verify empty accumulation data
                earlierProof.publicOutput.nextAccumulationRootsHash.assertEquals(
                    Poseidon.hash([
                        rAccumulationWitness.calculateRoot(Field(0)),
                        mAccumulationWitness.calculateRoot(Field(0)),
                    ]),
                    Utils.buildAssertMessage(
                        RollupTask.name,
                        'create',
                        ErrorEnum.ACCUMULATION_ROOT
                    )
                );
                taskId.value.assertEquals(
                    rAccumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupTask.name,
                        'create',
                        ErrorEnum.ACCUMULATION_INDEX_L1
                    )
                );
                taskId.value.assertEquals(
                    mAccumulationWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupTask.name,
                        'create',
                        ErrorEnum.ACCUMULATION_INDEX_L1
                    )
                );

                // Calculate new state values
                let nextTaskCounter = taskId.add(1);
                let nextInfoRoot = infoWitness.calculateRoot(
                    InfoStorage.calculateLeaf({
                        committeeId: action.committeeId,
                        keyId: action.keyId,
                        deadline: action.blocknumber,
                        config: action.config,
                    })
                );
                let nextAccumulationRoot = Poseidon.hash([
                    rAccumulationWitness.calculateRoot(
                        EmptyCipherMT().getRoot()
                    ),
                    mAccumulationWitness.calculateRoot(
                        EmptyCipherMT().getRoot()
                    ),
                ]);

                // Calculate corresponding action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(action)]
                );

                return new RollupTaskOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextActionState,
                        nextTaskCounter,
                        nextInfoRoot,
                        nextAccumulationRoot,
                    },
                });
            },
        },

        accumulate: {
            privateInputs: [
                SelfProof<Void, RollupTaskOutput>,
                EncryptActions,
                SubVectorGroupArray,
                SubVectorGroupArray,
                TaskWitness,
                TaskWitness,
                CipherWitnesses,
                CipherWitnesses,
                CommitmentWitnesses,
            ],

            async method(
                earlierProof: SelfProof<Void, RollupTaskOutput>,
                actions: EncryptActions,
                R: SubVectorGroupArray,
                M: SubVectorGroupArray,
                rAccumulationWitness: TaskWitness,
                mAccumulationWitness: TaskWitness,
                rCipherWitnesses: CipherWitnesses,
                mCipherWitnesses: CipherWitnesses,
                commitmentWitnesses: CommitmentWitnesses
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let firstAction = actions.get(Field(0)) as Action;
                // Verify accumulation and commitment data
                let {
                    nextCommitmentCounter,
                    nextAccumulationRootsHash,
                    nextCommitmentRoot,
                } = earlierProof.publicOutput;
                for (let i = 0; i < ENC_LIMITS.SUB_DIMENSION; i++) {
                    let iField = Field(i);
                    let action = actions.get(iField) as Action;
                    let index = action.index;

                    // Verify accumulation data: {empty} or {R, M}
                    let emptyCipher = R.get(iField)
                        .equals(Group.zero)
                        .toField();
                    let rCipherWitness = rCipherWitnesses.get(
                        iField
                    ) as CipherWitness;
                    let mCipherWitness = mCipherWitnesses.get(
                        iField
                    ) as CipherWitness;
                    nextAccumulationRootsHash.assertEquals(
                        Poseidon.hash([
                            rAccumulationWitness.calculateRoot(
                                rCipherWitness.calculateRoot(
                                    AccumulationStorage.calculateLeaf(
                                        R.get(iField)
                                    ).mul(emptyCipher)
                                )
                            ),
                            mAccumulationWitness.calculateRoot(
                                mCipherWitness.calculateRoot(
                                    AccumulationStorage.calculateLeaf(
                                        M.get(iField)
                                    ).mul(emptyCipher)
                                )
                            ),
                        ])
                    );
                    index.assertEquals(rCipherWitness.calculateIndex());
                    index.assertEquals(mCipherWitness.calculateIndex());

                    // Verify commitment data: {empty}
                    let commitmentWitness = commitmentWitnesses.get(
                        iField
                    ) as CommitmentWitness;
                    nextCommitmentRoot.assertEquals(
                        commitmentWitness.calculateRoot(Field(0))
                    );
                    nextCommitmentCounter.value.assertEquals(
                        commitmentWitness.calculateIndex()
                    );

                    // Update accumulationRoot
                    nextAccumulationRootsHash = Poseidon.hash([
                        rAccumulationWitness.calculateRoot(
                            rCipherWitness.calculateRoot(
                                AccumulationStorage.calculateLeaf(
                                    R.get(iField).add(action.R)
                                )
                            )
                        ),
                        mAccumulationWitness.calculateRoot(
                            mCipherWitness.calculateRoot(
                                AccumulationStorage.calculateLeaf(
                                    M.get(iField).add(action.M)
                                )
                            )
                        ),
                    ]);

                    // Update commitmentRoot
                    nextCommitmentRoot = commitmentWitness.calculateRoot(
                        action.commitment
                    );

                    // Update commitmentCounter
                    nextCommitmentCounter = nextCommitmentCounter.add(1);
                }

                // Update blocknumber
                let nextBlocknumber = firstAction.blocknumber;

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    actions.values.map((action) => Action.toFields(action))
                );

                return new RollupTaskOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextActionState,
                        nextBlocknumber,
                        nextCommitmentCounter,
                        nextAccumulationRootsHash,
                        nextCommitmentRoot,
                    },
                });
            },
        },
    },
});

class RollupTaskProof extends ZkProgram.Proof(RollupTask) {}
