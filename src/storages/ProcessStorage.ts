import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    Provable,
    UInt8,
} from 'o1js';
import { FieldDynamicArray, Utils } from '@auxo-dev/auxo-libs';
import { ACTION_PROCESS_LIMITS, INSTANCE_LIMITS } from '../constants.js';
import { ErrorEnum } from '../contracts/constants.js';
import { GenericStorage, Witness } from './GenericStorage.js';

export {
    ProcessMT,
    ProcessWitness,
    ProcessedActions,
    ProcessLeaf,
    ProcessStorage,
    PROCESS_MT,
    PROCESS_WITNESS,
    processAction,
};

const PROCESS_TREE_HEIGHT = Math.ceil(Math.log2(INSTANCE_LIMITS.ACTION)) + 1;
class ProcessMT extends MerkleTree {}
class ProcessWitness extends MerkleWitness(PROCESS_TREE_HEIGHT) {}
const PROCESS_MT = () => new ProcessMT(PROCESS_TREE_HEIGHT);
const PROCESS_WITNESS = (witness: Witness) => new ProcessWitness(witness);

class ProcessedActions extends FieldDynamicArray(ACTION_PROCESS_LIMITS) {}

/**
 * @param actionState nextActionState
 * @param processCounter how many time this action has been processed
 */
type ProcessLeaf = {
    actionState: Field;
    processCounter: UInt8;
};
class ProcessStorage extends GenericStorage<ProcessLeaf> {
    constructor(
        leafs?: {
            level1Index: Field;
            leaf: ProcessLeaf | Field;
            isRaw: boolean;
        }[]
    ) {
        super(PROCESS_MT, PROCESS_WITNESS, undefined, undefined, leafs);
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

    getWitness(index: Field): ProcessWitness {
        return super.getWitness(index) as ProcessWitness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: ProcessLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }

    updateAction(index: Field, rawLeaf: ProcessLeaf): void {
        super.updateRawLeaf({ level1Index: index }, rawLeaf);
    }
}

function processAction(
    programName: string,
    actionId: Field,
    processCounter: UInt8,
    actionState: Field,
    previousRoot: Field,
    witness: ProcessWitness
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
