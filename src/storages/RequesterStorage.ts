import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
    UInt64,
} from 'o1js';
import { ResponseContribution } from '../libs/Committee.js';
import { ENCRYPTION_LIMITS, INSTANCE_LIMITS } from '../constants.js';
import { GenericStorage } from './GenericStorage.js';
import { RequestVector } from '../libs/Requester.js';
import { StaticArray } from '@auxo-dev/auxo-libs';

export const LEVEL1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.REQUEST)) + 1;
export const LEVEL2_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.MEMBER)) + 1;
export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL1_TREE_HEIGHT) {}
export class Level2MT extends MerkleTree {}
export class Level2Witness extends MerkleWitness(LEVEL2_TREE_HEIGHT) {}
export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL1_TREE_HEIGHT);
export const EMPTY_LEVEL_2_TREE = () => new Level2MT(LEVEL2_TREE_HEIGHT);
export class FullMTWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}

export class AccumulationWitnesses extends StaticArray(
    Level2Witness,
    ENCRYPTION_LIMITS.DIMENSION
) {}

export class CommitmentWitnesses extends StaticArray(
    Level1Witness,
    ENCRYPTION_LIMITS.DIMENSION
) {}
