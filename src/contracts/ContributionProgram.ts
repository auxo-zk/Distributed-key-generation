import {
    Bool,
    Field,
    Group,
    Poseidon,
    PrivateKey,
    Provable,
    SelfProof,
    Struct,
    Void,
    ZkProgram,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import {
    ThresholdGroupArray,
    MemberFieldArray,
    MemberPublicKeyArray,
    MemberGroupArray,
} from '../libs/types.js';
import { ErrorEnum, ZkProgramEnum } from './constants.js';
import {
    EmptyMemberMT,
    KeyMemberWitness,
    KeyWitness,
    MemberWitness,
    MemberWitnesses,
} from '../storages/Merklized.js';
import { INST_LIMITS } from '../constants.js';
import {
    ContributionAction as Action,
    ContributionActionEnum as ActionEnum,
    CommitPolynomialActions,
    CommitShareActions,
    ContributeActions,
} from './Contribution.js';
import {
    calculateKeyIndex,
    EncryptionStorage,
    KeyStorage,
    PolynomialCommitmentStorage,
} from '../storages/KeyStorage.js';

export {
    BatchPolyCommitment,
    PolynomialCommitmentInput,
    BatchPolyCommitmentProof,
    BatchEncryption,
    BatchEncryptionInput,
    BatchEncryptionProof,
    BatchDecryption,
    BatchDecryptionInput,
    BatchDecryptionProof,
    RollupContribution,
    RollupContributionOutput,
    RollupContributionProof,
};

class PolynomialCommitmentInput extends Struct({
    C: ThresholdGroupArray,
    P: MemberGroupArray,
}) {}

const BatchPolyCommitment = ZkProgram({
    name: 'BatchPolyCommitment',
    publicInput: PolynomialCommitmentInput,
    methods: {
        commit: {
            privateInputs: [],
            async method(input: PolynomialCommitmentInput) {
                for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
                    let coef = Field(i).lessThan(input.P.length).toField();
                    let sum = input.C.get(Field(0));
                    for (let j = 1; j < INST_LIMITS.THRESHOLD; j++) {
                        let flag = Field(j).lessThan(input.C.length).toField();
                        coef = coef.mul(Field(i));
                        sum = sum.add(
                            input.C.get(Field(j)).scale(coef.mul(flag))
                        );
                    }
                    input.P.get(Field(i)).assertEquals(sum);
                }
            },
        },
    },
});

class BatchPolyCommitmentProof extends ZkProgram.Proof(BatchPolyCommitment) {}

class BatchEncryptionInput extends Struct({
    publicKeys: MemberPublicKeyArray,
    P: MemberGroupArray,
    c: MemberFieldArray,
    U: MemberGroupArray,
}) {}

const BatchEncryption = ZkProgram({
    name: ZkProgramEnum.BatchEncryption,
    publicInput: BatchEncryptionInput,
    methods: {
        encrypt: {
            privateInputs: [MemberFieldArray, MemberFieldArray],
            async method(
                input: BatchEncryptionInput,
                polynomialValues: MemberFieldArray,
                randomValues: MemberFieldArray
            ) {
                let length = input.publicKeys.length;
                for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
                    // Verify plaintext
                    let iField = Field(i);
                    let inRange = iField.lessThan(length).toField();
                    let sum = input.P.get(iField);
                    let plain = polynomialValues.get(iField);
                    sum.assertEquals(
                        Group.generator.scale(plain),
                        Utils.buildAssertMessage(
                            BatchEncryption.name,
                            'encrypt',
                            ErrorEnum.ELGAMAL_ENCRYPTION
                        )
                    );
                    // Encrypt
                    let random = randomValues.get(iField);
                    let U = Group.generator.scale(random.mul(inRange));
                    let V = input.publicKeys
                        .get(iField)
                        .toGroup()
                        .scale(random);
                    let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
                    let c = Utils.fieldXOR(k.mul(inRange), plain);
                    c.assertEquals(
                        input.c.get(iField),
                        Utils.buildAssertMessage(
                            BatchEncryption.name,
                            'encrypt',
                            ErrorEnum.ELGAMAL_ENCRYPTION
                        )
                    );
                    U.assertEquals(
                        input.U.get(iField),
                        Utils.buildAssertMessage(
                            BatchEncryption.name,
                            'encrypt',
                            ErrorEnum.ELGAMAL_ENCRYPTION
                        )
                    );
                }
            },
        },
    },
});

class BatchEncryptionProof extends ZkProgram.Proof(BatchEncryption) {}

class BatchDecryptionInput extends Struct({
    c: MemberFieldArray,
    U: MemberGroupArray,
    memberId: Field,
    commitment: Field,
}) {}

const BatchDecryption = ZkProgram({
    name: ZkProgramEnum.BatchDecryption,
    publicInput: BatchDecryptionInput,
    methods: {
        decrypt: {
            privateInputs: [PrivateKey],
            async method(input: BatchDecryptionInput, privateKey: PrivateKey) {
                let length = input.c.length;
                input.U.length.assertEquals(
                    length,
                    Utils.buildAssertMessage(
                        BatchDecryption.name,
                        'decrypt',
                        ErrorEnum.ELGAMAL_BATCH_SIZE
                    )
                );
                let share = Field(0);
                for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
                    let iField = Field(i);
                    let inRange = iField.lessThan(length).toField();
                    let c = input.c.get(iField);
                    let U = input.U.get(iField);
                    let V = U.scale(privateKey.s);
                    let k = Poseidon.hash([U.toFields(), V.toFields()].flat());
                    let m = Utils.fieldXOR(k.mul(inRange), c);
                    share = share.add(m);
                }
                input.commitment.assertEquals(
                    Poseidon.hash([share, input.memberId]),
                    Utils.buildAssertMessage(
                        BatchDecryption.name,
                        'decrypt',
                        ErrorEnum.ELGAMAL_DECRYPTION
                    )
                );
            },
        },
    },
});

class BatchDecryptionProof extends ZkProgram.Proof(BatchDecryption) {}

class RollupContributionOutput extends Struct({
    initialActionState: Field,
    initialPolyComRoot: Field,
    initialKeyRoot: Field,
    initialEncryptionRoot: Field,
    initialShareComRoot: Field,
    nextActionState: Field,
    nextPolyComRoot: Field,
    nextKeyRoot: Field,
    nextEncryptionRoot: Field,
    nextShareComRoot: Field,
}) {}

const RollupContribution = ZkProgram({
    name: ZkProgramEnum.RollupContribution,
    publicOutput: RollupContributionOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field],
            async method(
                initialActionState: Field,
                initialPolyComRoot: Field,
                initialKeyRoot: Field,
                initialEncryptionRoot: Field,
                initialShareComRoot: Field
            ) {
                return new RollupContributionOutput({
                    initialActionState,
                    initialPolyComRoot,
                    initialKeyRoot,
                    initialEncryptionRoot,
                    initialShareComRoot,
                    nextActionState: initialActionState,
                    nextPolyComRoot: initialPolyComRoot,
                    nextKeyRoot: initialKeyRoot,
                    nextEncryptionRoot: initialEncryptionRoot,
                    nextShareComRoot: initialShareComRoot,
                });
            },
        },

        /**
         * Process COMMIT_POLY actions
         * @param earlierProof Previous recursive proof
         * @param actions Commit poly actions dynamic array with length of numbers of non-empty actions
         * @param polyComWitness Witness for polynomial commitment
         * @param keyWitness Witness for public key
         * @param CArr Polynomial coefficients commitments
         * @param currentKey Current accumulated key value
         */
        commitPoly: {
            privateInputs: [
                SelfProof<Void, RollupContributionOutput>,
                CommitPolynomialActions,
                KeyMemberWitness,
                KeyWitness,
                ThresholdGroupArray,
                Group,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupContributionOutput>,
                actions: CommitPolynomialActions,
                polyComWitness: KeyMemberWitness,
                keyWitness: KeyWitness,
                CArr: ThresholdGroupArray,
                currentKey: Group
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let firstAction = actions.get(Field(0)) as Action;
                let keyIndex = calculateKeyIndex(
                    firstAction.committeeId,
                    firstAction.keyId
                );
                let T = CArr.length;
                let emptyMemberMTRoot = EmptyMemberMT().getRoot();
                let isFirstMember = earlierProof.publicOutput.nextPolyComRoot
                    .equals(polyComWitness.level1.calculateRoot(Field(0)))
                    .and(
                        emptyMemberMTRoot.equals(
                            polyComWitness.level2.calculateRoot(Field(0))
                        )
                    )
                    .and(
                        earlierProof.publicOutput.nextKeyRoot.equals(
                            keyWitness.calculateRoot(Field(0))
                        )
                    )
                    .and(currentKey.equals(Group.zero));

                // Verify action type
                firstAction.actionType.assertEquals(
                    Field(ActionEnum.COMMIT_POLY),
                    Utils.buildAssertMessage(
                        RollupContribution.name,
                        'commitPoly',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                let invalidAction = Bool(false);

                // Verify empty commitment
                // Invalid cause:
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextPolyComRoot
                        .equals(
                            polyComWitness.level1.calculateRoot(
                                polyComWitness.level2.calculateRoot(Field(0))
                            )
                        )
                        .or(isFirstMember)
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitPoly',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                keyIndex.assertEquals(
                    polyComWitness.level1.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitPoly',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                firstAction.memberId.assertEquals(
                    polyComWitness.level2.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitPoly',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );

                // Verify empty public key
                // Invalid cause:
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyRoot
                        .equals(
                            keyWitness.calculateRoot(
                                KeyStorage.calculateLeaf(currentKey)
                            )
                        )
                        .or(isFirstMember)
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitPoly',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                keyIndex.assertEquals(
                    keyWitness.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitPoly',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );

                // Create new polyComMT and publicKeyMT
                for (let i = 0; i < INST_LIMITS.THRESHOLD; i++) {
                    let action = actions.get(Field(i)) as Action;
                    action.T.assertEquals(T);
                    action.G.assertEquals(CArr.get(Field(i)));
                }

                // Update nextPolyComRoot
                let nextPolyComRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextPolyComRoot,
                    polyComWitness.level1.calculateRoot(
                        polyComWitness.level2.calculateRoot(
                            PolynomialCommitmentStorage.calculateLeaf(CArr)
                        )
                    )
                );

                // Update nextKeyRoot
                let nextKeyRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyRoot,
                    keyWitness.calculateRoot(
                        KeyStorage.calculateLeaf(
                            currentKey.add(CArr.get(Field(0)))
                        )
                    )
                );

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    actions.values.map((action) => Action.toFields(action))
                );

                return new RollupContributionOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextPolyComRoot,
                    nextKeyRoot,
                });
            },
        },

        contribute: {
            privateInputs: [
                SelfProof<Void, RollupContributionOutput>,
                Field,
                ContributeActions,
                KeyMemberWitness,
                KeyMemberWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupContributionOutput>,
                actionType: Field,
                actions: ContributeActions,
                polyComWitness: KeyMemberWitness,
                encryptionWitness: KeyMemberWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let firstAction = new Action(actions.get(Field(0)));
                let keyIndex = calculateKeyIndex(
                    firstAction.committeeId,
                    firstAction.keyId
                );
                let N = firstAction.N;
                let polyCom = firstAction.f;
                let emptyMemberMTRoot = EmptyMemberMT().getRoot();
                let isFirstMember = earlierProof.publicOutput.nextEncryptionRoot
                    .equals(encryptionWitness.level1.calculateRoot(Field(0)))
                    .and(
                        emptyMemberMTRoot.equals(
                            encryptionWitness.level2.calculateRoot(Field(0))
                        )
                    );

                // Verify action type
                actionType
                    .equals(Field(ActionEnum.COMMIT_SHARE))
                    .and(firstAction.actionType.equals(actionType))
                    .assertTrue(
                        Utils.buildAssertMessage(
                            RollupContribution.name,
                            'contribute',
                            ErrorEnum.ACTION_TYPE
                        )
                    );

                let invalidAction = Bool(false);

                // Verify empty encryption
                // Invalid cause:
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextEncryptionRoot
                        .equals(
                            encryptionWitness.level1.calculateRoot(
                                encryptionWitness.level2.calculateRoot(Field(0))
                            )
                        )
                        .or(isFirstMember)
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'contribute',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                keyIndex.assertEquals(
                    encryptionWitness.level1.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'contribute',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                firstAction.memberId.assertEquals(
                    encryptionWitness.level2.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'contribute',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );

                // Verify polynomial commitment
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextPolyComRoot
                        .equals(
                            polyComWitness.level1.calculateRoot(
                                polyComWitness.level2.calculateRoot(polyCom)
                            )
                        )
                        .or(isFirstMember)
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'contribute',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                keyIndex.assertEquals(
                    polyComWitness.level1.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'contribute',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                firstAction.memberId.assertEquals(
                    polyComWitness.level2.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'contribute',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );

                // Create new encryptionMT
                let encryptionMT = EmptyMemberMT();
                for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
                    let action = new Action(actions.get(Field(i)));
                    let inRange = Field(i).lessThan(N).toField();
                    let value = EncryptionStorage.calculateLeaf({
                        c: action.c,
                        U: action.G,
                    }).mul(inRange);
                    encryptionMT.setLeaf(BigInt(i), value);
                }

                // Update encryptionRoot
                let nextEncryptionRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextEncryptionRoot,
                    encryptionWitness.level1.calculateRoot(
                        encryptionWitness.level2.calculateRoot(
                            encryptionMT.getRoot()
                        )
                    )
                );

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    actions.values.map((action) => Action.toFields(action))
                );

                return new RollupContributionOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextEncryptionRoot,
                });
            },
        },
        commitShare: {
            privateInputs: [
                SelfProof<Void, RollupContributionOutput>,
                Field,
                CommitShareActions,
                KeyMemberWitness,
                KeyWitness,
                MemberWitnesses,
                MemberWitnesses,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupContributionOutput>,
                actionType: Field,
                actions: CommitShareActions,
                shareComWitness: KeyMemberWitness,
                encryptionWitness: KeyWitness,
                memberWitnesses: MemberWitnesses,
                targetMemberWitnesses: MemberWitnesses
            ) {
                // Verify earlier proof
                earlierProof.verify();

                let firstAction = new Action(actions.get(Field(0)));
                let keyIndex = calculateKeyIndex(
                    firstAction.committeeId,
                    firstAction.keyId
                );
                let N = firstAction.N;
                let shareCom = firstAction.f;
                let emptyMemberMTRoot = EmptyMemberMT().getRoot();
                let isFirstMember = earlierProof.publicOutput.nextEncryptionRoot
                    .equals(shareComWitness.level1.calculateRoot(Field(0)))
                    .and(
                        emptyMemberMTRoot.equals(
                            shareComWitness.level2.calculateRoot(Field(0))
                        )
                    );

                // Verify action type
                actionType
                    .equals(Field(ActionEnum.COMMIT_SHARE))
                    .and(firstAction.actionType.equals(actionType))
                    .assertTrue(
                        Utils.buildAssertMessage(
                            RollupContribution.name,
                            'commitShare',
                            ErrorEnum.ACTION_TYPE
                        )
                    );

                let invalidAction = Bool(false);

                // Verify empty share commitment
                // Invalid cause:
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextShareComRoot
                        .equals(
                            shareComWitness.level1.calculateRoot(
                                shareComWitness.level2.calculateRoot(Field(0))
                            )
                        )
                        .or(isFirstMember)
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitShare',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                keyIndex.assertEquals(
                    shareComWitness.level1.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitShare',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                firstAction.memberId.assertEquals(
                    shareComWitness.level2.calculateIndex()
                    // Utils.buildInvalidActionMessage(
                    //     RollupContribution.name,
                    //     'commitShare',
                    //     ErrorEnum.MEMBER_ROOT
                    // )
                );
                keyIndex.assertEquals(encryptionWitness.calculateIndex());

                for (let i = 0; i < INST_LIMITS.MEMBER; i++) {
                    let action = new Action(actions.get(Field(i)));
                    let inRange = Field(i).lessThan(N).toField();
                    let memberWitness = memberWitnesses.get(
                        Field(i)
                    ) as MemberWitness;
                    let targetMemberWitness = targetMemberWitnesses.get(
                        Field(i)
                    ) as MemberWitness;

                    // Verify decryption
                    // Invalid cause:
                    invalidAction = Utils.checkInvalidAction(
                        invalidAction,
                        earlierProof.publicOutput.nextEncryptionRoot.equals(
                            encryptionWitness.calculateRoot(
                                memberWitness.calculateRoot(
                                    targetMemberWitness
                                        .calculateRoot(
                                            EncryptionStorage.calculateLeaf({
                                                c: action.c,
                                                U: action.G,
                                            })
                                        )
                                        .mul(inRange)
                                )
                            )
                        )
                        // Utils.buildInvalidActionMessage(
                        //     RollupContribution.name,
                        //     'commitShare',
                        //     ErrorEnum.DECRYPTION
                        // )
                    );
                    action.memberId.assertEquals(
                        memberWitness.calculateIndex()
                    );
                    action.targetId.assertEquals(
                        targetMemberWitness.calculateIndex()
                    );
                }

                // Update shareComMT
                let nextShareComRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextShareComRoot,
                    shareComWitness.level1.calculateRoot(
                        shareComWitness.level2.calculateRoot(shareCom)
                    )
                );

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    actions.values.map((action) => Action.toFields(action))
                );

                return new RollupContributionOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextShareComRoot,
                });
            },
        },
    },
});

class RollupContributionProof extends ZkProgram.Proof(RollupContribution) {}
