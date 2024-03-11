/**
 * Unit value for the encrypted secret
 */
export const SECRET_UNIT = 1e7;

/**
 * Maximum value for the encrypted secret
 */
export const SECRET_MAX = 1e12;

/**
 * Fee charged for each request
 */
export const REQUEST_FEE = 1e9;

/**
 * Maximum amount of zkApp address in storage
 */
export const ADDRESS_MAX_SIZE = 8;

/**
 * Maximum amount of members in a committee
 */
export const COMMITTEE_MAX_SIZE = 3;

/**
 * Maximum dimension of a request
 */
export const REQUEST_MAX_SIZE = 5;

/**
 * Minimum value for a request's period ~ 10 blocks
 */
export const REQUEST_MIN_PERIOD = 30 * 60 * 1000;

/**
 * Waiting period before the expiration of a request ~ 100 blocks
 */
export const REQUEST_EXPIRATION = 300 * 60 * 1000;

/**
 * Maximum value for number of contracts sharing rollup
 */
export const ROLLUP_BATCH_MAX_SIZE = 8;

/**
 * Maximum amount for each entity
 */
export const INSTANCE_LIMITS = {
    COMMITTEE: 2 ** 3,
    KEY: 2 ** 3,
    REQUEST: 2 ** 3,
};

/**
 * Maximum amount of action processed in a recursive proof
 */
export const ACTION_PROCESS_LIMITS = 8;

/**
 * The size of an index value in bits for packing indexes array
 */
export const INDEX_SIZE = 6;

/**
 * Indexes of zkApps in the address storage
 */
export enum ZkAppEnum {
    COMMITTEE,
    DKG,
    ROUND1,
    ROUND2,
    REQUEST,
    RESPONSE,
    ROLLUP,
    __LENGTH,
}

export enum ZkProgramEnum {
    Elgamal = 'Elgamal',
    BatchEncryption = 'BatchEncryption',
    BatchDecryption = 'BatchDecryption',

    Rollup = 'Rollup',

    UpdateCommittee = 'UpdateCommittee',
    UpdateKey = 'UpdateKey',
    FinalizeRound1 = 'FinalizeRound1',
    FinalizeRound2 = 'FinalizeRound2',
    FinalizeResponse = 'FinalizeResponse',
    AttachRequest = 'AttachRequest',
    UpdateRequest = 'UpdateRequest',
    AccumulateEncryption = 'AccumulateEncryption',
}

/**
 * All zkApp/smart contract names
 */
export enum Contract {
    COMMITTEE = 'committee',
    DKG = 'dkg',
    ROUND1 = 'round1',
    ROUND2 = 'round2',
    RESPONSE = 'response',
    REQUEST = 'request',
    ROLLUP = 'rollup',
}
