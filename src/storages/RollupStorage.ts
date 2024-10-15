// import { Field, MerkleTree, MerkleWitness } from 'o1js';
// import { INST_LIMITS } from '../constants.js';
// import { getBestHeight } from '@auxo-dev/zkapp-offchain-storage';
// import {
//     AddressMT,
//     AddressWitness,
//     ADDRESS_MT,
//     ADDRESS_WITNESS,
// } from './AddressStorage.js';

// export {
//     ROLLUP_MT,
//     ROLLUP_WITNESS,
//     ROLLUP_COUNTER_MT,
//     ROLLUP_COUNTER_WITNESS,
//     calculateActionIndex,
// };

// export {
//     RollupMT,
//     RollupWitness,
//     RollupLeaf,
//     RollupStorage,
//     RollupCounterMT,
//     RollupCounterWitness,
//     RollupCounterLeaf,
//     RollupCounterStorage,
// };

// const [MTWitnessRollup, NewMTWitnessRollup, EmptyMTRollup] = getBestHeight(
//     BigInt(INST_LIMITS.ADDRESS * INST_LIMITS.ACTION)
// );

// const ROLLUP_TREE_HEIGHT =
//     Math.ceil(Math.log2(INST_LIMITS.ADDRESS * INST_LIMITS.ACTION)) + 1;
// class RollupMT extends MerkleTree {}
// class RollupWitness extends MerkleWitness(ROLLUP_TREE_HEIGHT) {}
// const ROLLUP_MT = () => new RollupMT(ROLLUP_TREE_HEIGHT);
// const ROLLUP_WITNESS = (witness: Witness) => new RollupWitness(witness);
// class RollupCounterMT extends AddressMT {}
// class RollupCounterWitness extends AddressWitness {}
// const ROLLUP_COUNTER_MT = ADDRESS_MT;
// const ROLLUP_COUNTER_WITNESS = ADDRESS_WITNESS;

// function calculateActionIndex(zkAppIndex: Field, actionId: Field): Field {
//     return Field.from(BigInt(INST_LIMITS.ACTION))
//         .mul(zkAppIndex)
//         .add(actionId);
// }

// type RollupLeaf = Field;

// class RollupStorage extends GenericStorage<RollupLeaf> {
//     constructor(
//         leafs?: {
//             level1Index: Field;
//             leaf: RollupLeaf | Field;
//             isRaw: boolean;
//         }[]
//     ) {
//         super(ROLLUP_MT, ROLLUP_WITNESS, undefined, undefined, leafs);
//     }

//     static calculateLeaf(actionHash: RollupLeaf): Field {
//         return actionHash;
//     }

//     calculateLeaf(actionHash: RollupLeaf): Field {
//         return RollupStorage.calculateLeaf(actionHash);
//     }

//     static calculateLevel1Index({
//         zkAppIndex,
//         actionId,
//     }: {
//         zkAppIndex: Field;
//         actionId: Field;
//     }): Field {
//         return calculateActionIndex(zkAppIndex, actionId);
//     }

//     calculateLevel1Index({
//         zkAppIndex,
//         actionId,
//     }: {
//         zkAppIndex: Field;
//         actionId: Field;
//     }): Field {
//         return RollupStorage.calculateLevel1Index({
//             zkAppIndex,
//             actionId,
//         });
//     }

//     getWitness(level1Index: Field): RollupWitness {
//         return super.getWitness(level1Index) as RollupWitness;
//     }

//     updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
//         super.updateLeaf({ level1Index }, leaf);
//     }

//     updateRawLeaf(
//         { level1Index }: { level1Index: Field },
//         rawLeaf: RollupLeaf
//     ): void {
//         super.updateRawLeaf({ level1Index }, rawLeaf);
//     }
// }

// type RollupCounterLeaf = Field;

// class RollupCounterStorage extends GenericStorage<RollupCounterLeaf> {
//     constructor(
//         leafs?: {
//             level1Index: Field;
//             leaf: RollupCounterLeaf | Field;
//             isRaw: boolean;
//         }[]
//     ) {
//         super(
//             ROLLUP_COUNTER_MT,
//             ROLLUP_COUNTER_WITNESS,
//             undefined,
//             undefined,
//             leafs
//         );
//     }

//     static calculateLeaf(counter: RollupCounterLeaf): Field {
//         return counter;
//     }

//     calculateLeaf(counter: RollupCounterLeaf): Field {
//         return RollupCounterStorage.calculateLeaf(counter);
//     }

//     static calculateLevel1Index(zkAppIndex: Field): Field {
//         return zkAppIndex;
//     }

//     calculateLevel1Index(zkAppIndex: Field): Field {
//         return RollupCounterStorage.calculateLevel1Index(zkAppIndex);
//     }

//     getWitness(level1Index: Field): RollupCounterWitness {
//         return super.getWitness(level1Index) as RollupCounterWitness;
//     }

//     updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
//         super.updateLeaf({ level1Index }, leaf);
//     }

//     updateRawLeaf(
//         { level1Index }: { level1Index: Field },
//         rawLeaf: RollupCounterLeaf
//     ): void {
//         super.updateRawLeaf({ level1Index }, rawLeaf);
//     }
// }
