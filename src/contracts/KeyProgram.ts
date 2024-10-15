import {
    Bool,
    Field,
    Provable,
    SelfProof,
    Struct,
    Void,
    ZkProgram,
} from 'o1js';
import { ErrorEnum, ZkProgramEnum } from './constants.js';
import {
    KeyAction as Action,
    KeyActionEnum as ActionEnum,
    KeyStatus,
} from './Key.js';
import { Utils } from '@auxo-dev/auxo-libs';
import { CommitteeWitness, KeyWitness } from '../storages/Merklized';
import { calculateKeyIndex, KeyStorage } from '../storages/KeyStorage.js';

export { RollupKey, RollupKeyOutput, RollupKeyProof };

class RollupKeyOutput extends Struct({
    initialActionState: Field,
    initialKeyCounterRoot: Field,
    initialKeyStatusRoot: Field,
    initialKeyRoot: Field,
    initialKeyFeeRoot: Field,
    nextActionState: Field,
    nextKeyCounterRoot: Field,
    nextKeyStatusRoot: Field,
    nextKeyRoot: Field,
    nextKeyFeeRoot: Field,
}) {}

const RollupKey = ZkProgram({
    name: ZkProgramEnum.RollupKey,
    publicOutput: RollupKeyOutput,
    methods: {
        init: {
            privateInputs: [Field, Field, Field, Field, Field],
            async method(
                initialActionState: Field,
                initialKeyCounterRoot: Field,
                initialKeyStatusRoot: Field,
                initialKeyRoot: Field,
                initialKeyFeeRoot: Field
            ) {
                return new RollupKeyOutput({
                    initialActionState,
                    initialKeyCounterRoot,
                    initialKeyStatusRoot,
                    initialKeyRoot,
                    initialKeyFeeRoot,
                    nextActionState: initialActionState,
                    nextKeyCounterRoot: initialKeyCounterRoot,
                    nextKeyStatusRoot: initialKeyStatusRoot,
                    nextKeyRoot: initialKeyRoot,
                    nextKeyFeeRoot: initialKeyFeeRoot,
                });
            },
        },

        /**
         * Process GENERATE action
         * @param earlierProof Previous recursive proof
         * @param action Action to be processed
         * @param currKeyId Current key index
         * @param keyCounterWitness Witness for key counter MT
         * @param keyStatusWitness Witness for key status MT
         * @param keyFeeWitness Witness for key fee MT
         */
        generate: {
            privateInputs: [
                SelfProof<Void, RollupKeyOutput>,
                Action,
                Field,
                CommitteeWitness,
                KeyWitness,
                KeyWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupKeyOutput>,
                action: Action,
                currKeyId: Field,
                keyCounterWitness: CommitteeWitness,
                keyStatusWitness: KeyWitness,
                keyFeeWitness: KeyWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                action.actionType.assertNotEquals(
                    Field(ActionEnum.GENERATE),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Verify the key's previous index
                earlierProof.publicOutput.nextKeyCounterRoot.assertEquals(
                    keyCounterWitness.calculateRoot(currKeyId),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_COUNTER_ROOT
                    )
                );
                action.committeeId.assertEquals(
                    keyCounterWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_COUNTER_INDEX
                    )
                );

                let keyIndex = calculateKeyIndex(action.committeeId, currKeyId);
                // Verify the key's previous status
                earlierProof.publicOutput.nextKeyStatusRoot.assertEquals(
                    keyStatusWitness.calculateRoot(Field(KeyStatus.EMPTY)),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Verify empty key usage fee
                earlierProof.publicOutput.nextKeyFeeRoot.assertEquals(
                    keyFeeWitness.calculateRoot(Field(0)),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_FEE_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyFeeWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'generate',
                        ErrorEnum.KEY_FEE_INDEX
                    )
                );

                // Update keyCounterRoot
                let nextKeyCounterRoot = keyCounterWitness.calculateRoot(
                    currKeyId.add(Field(1))
                );

                // Update keyStatusRoot
                let nextKeyStatusRoot = keyStatusWitness.calculateRoot(
                    Field(KeyStatus.CONTRIBUTION)
                );

                // Update keyFeeRoot
                let nextKeyFeeRoot = keyFeeWitness.calculateRoot(action.fee);

                // Update action state
                let nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [Action.toFields(action)]
                );

                return new RollupKeyOutput({
                    ...earlierProof.publicOutput,
                    nextKeyCounterRoot,
                    nextKeyStatusRoot,
                    nextKeyFeeRoot,
                    nextActionState,
                });
            },
        },

        /**
         * Process FINALIZE & DEPRECATE action
         * @param earlierProof Previous recursive proof
         * @param action Action to be processed
         * @param keyStatusWitness Witness for key status MT
         * @param keyWitness Witness for key MT
         */
        update: {
            privateInputs: [
                SelfProof<Void, RollupKeyOutput>,
                Action,
                KeyWitness,
                KeyWitness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupKeyOutput>,
                action: Action,
                keyStatusWitness: KeyWitness,
                keyWitness: KeyWitness
            ) {
                // Verify earlier proof
                earlierProof.verify();

                // Verify action type
                action.actionType.assertNotEquals(
                    Field(ActionEnum.GENERATE),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'update',
                        ErrorEnum.ACTION_TYPE
                    )
                );

                // Skip invalid action
                let invalidAction = Bool(false);

                // Verify key status
                let keyStatus = Provable.switch(
                    [
                        action.actionType.equals(Field(ActionEnum.FINALIZE)),
                        action.actionType.equals(Field(ActionEnum.DEPRECATE)),
                    ],
                    Field,
                    [Field(KeyStatus.CONTRIBUTION), Field(KeyStatus.ACTIVE)]
                );

                // Verify the key's previous status
                // Invalid cause: key status is already finalized / deprecated
                let keyIndex = calculateKeyIndex(
                    action.committeeId,
                    action.keyId
                );
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyStatusRoot.equals(
                        keyStatusWitness.calculateRoot(keyStatus)
                    ),
                    Utils.buildInvalidActionMessage(
                        RollupKey.name,
                        'update',
                        ErrorEnum.KEY_STATUS_ROOT
                    )
                );
                keyIndex.assertEquals(
                    keyStatusWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'update',
                        ErrorEnum.KEY_STATUS_INDEX
                    )
                );

                // Verify empty key if CONTRIBUTION -> ACTIVE
                // Invalid cause: key is already finalized
                invalidAction = Utils.checkInvalidAction(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyRoot
                        .equals(keyWitness.calculateRoot(Field(0)))
                        .or(keyStatus.equals(Field(KeyStatus.ACTIVE))),
                    'Skip invalid action: ' +
                        Utils.buildAssertMessage(
                            RollupKey.name,
                            'update',
                            ErrorEnum.KEY_ROOT
                        )
                );
                keyIndex.assertEquals(
                    keyWitness.calculateIndex(),
                    Utils.buildAssertMessage(
                        RollupKey.name,
                        'update',
                        ErrorEnum.KEY_INDEX
                    )
                );

                // Update keyStatusRoot if action is valid
                let nextKeyStatusRoot = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextKeyStatusRoot,
                    keyStatusWitness.calculateRoot(keyStatus.add(1))
                );

                // Update keyRoot if action is valid and key is empty
                let nextKeyRoot = Provable.if(
                    keyStatus.equals(Field(KeyStatus.ACTIVE)).or(invalidAction),
                    earlierProof.publicOutput.nextKeyRoot,
                    keyWitness.calculateRoot(
                        KeyStorage.calculateLeaf(action.key)
                    )
                );

                // Update action state if action is valid
                let nextActionState = Provable.if(
                    invalidAction,
                    earlierProof.publicOutput.nextActionState,
                    Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [Action.toFields(action)]
                    )
                );

                return new RollupKeyOutput({
                    ...earlierProof.publicOutput,
                    nextActionState,
                    nextKeyStatusRoot,
                    nextKeyRoot,
                });
            },
        },
    },
});

class RollupKeyProof extends ZkProgram.Proof(RollupKey) {}
