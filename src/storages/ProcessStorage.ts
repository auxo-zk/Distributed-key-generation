import { Field, Poseidon, Provable, UInt8 } from 'o1js';
import { FieldDynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { ACTION_PROCESS_LIMITS, INSTANCE_LIMITS } from '../constants.js';
import { ErrorEnum } from '../contracts/constants.js';
import {
    getBestHeight,
    OneLevelStorage,
} from '@auxo-dev/zkapp-offchain-storage';

export {
    processAction,
    EmptyMT as PROCESS_MT,
    MTWitness as ProcessWitness,
    ProcessedActions,
    ProcessLeaf,
    ProcessStorage,
};

const [MTWitness, NewMTWitness, EmptyMT] = getBestHeight(
    BigInt(INSTANCE_LIMITS.ACTION)
);

class ProcessedActions extends FieldDynamicArray(ACTION_PROCESS_LIMITS) {}

/**
 * @param actionState nextActionState
 * @param processCounter how many time this action has been processed
 */
type ProcessLeaf = {
    actionState: Field;
    processCounter: UInt8;
};
class ProcessStorage extends OneLevelStorage<ProcessLeaf, typeof MTWitness> {
    static readonly height = MTWitness.height;

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ProcessLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(EmptyMT, NewMTWitness, leafs);
    }

    get height(): number {
        return ProcessStorage.height;
    }

    get actionMap() {
        return this.level1;
    }

    get actions(): { [key: string]: { leaf: Field } } {
        return this.leafs;
    }

    static calculateLeaf(rawLeaf: ProcessLeaf): Field {
        let processCounter = rawLeaf.processCounter.value;
        return Provable.if(
            processCounter.greaterThan(0),
            Poseidon.hash([rawLeaf.actionState, processCounter]),
            rawLeaf.actionState
        );
    }

    calculateLeaf(rawLeaf: ProcessLeaf): Field {
        return ProcessStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(actionIndex: Field): Field {
        return actionIndex;
    }

    calculateLevel1Index(actionIndex: Field): Field {
        return ProcessStorage.calculateLevel1Index(actionIndex);
    }

    static calculateIndex(actionIndex: Field): Field {
        return ProcessStorage.calculateLevel1Index(actionIndex);
    }

    calculateIndex(actionIndex: Field): Field {
        return ProcessStorage.calculateIndex(actionIndex);
    }
}

function processAction(
    programName: string,
    actionId: Field,
    processCounter: UInt8,
    actionState: Field,
    previousRoot: Field,
    witness: typeof MTWitness
): Field {
    previousRoot.assertEquals(
        witness.calculateRoot(
            Provable.switch(
                [
                    processCounter.value.equals(0),
                    processCounter.value.equals(1),
                    processCounter.value.greaterThan(1),
                ],
                Field,
                [
                    Field(0),
                    actionState,
                    Poseidon.hash([actionState, processCounter.value.sub(1)]),
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
            processCounter.value.greaterThan(0),
            Poseidon.hash([actionState, processCounter.value]),
            actionState
        )
    );
}
