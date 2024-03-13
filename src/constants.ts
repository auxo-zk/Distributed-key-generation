export {
    ACTION_PROCESS_LIMITS,
    INDEX_SIZE,
    INSTANCE_LIMITS,
    REQUEST_FEE,
    REQUEST_MIN_PERIOD,
    REQUEST_EXPIRATION,
    ROLLUP_BATCH_MAX_SIZE,
    SECRET_MAX,
    SECRET_UNIT,
    ZkAppEnum,
    ZkProgramEnum,
    Contract,
};

/**
 * Indexes of zkApps in the address storage
 */
enum ZkAppEnum {
    COMMITTEE,
    DKG,
    ROUND1,
    ROUND2,
    REQUEST,
    RESPONSE,
    ROLLUP,
    REQUESTER_0,
    __LENGTH,
}

enum ZkProgramEnum {
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
enum Contract {
    COMMITTEE = 'committee',
    DKG = 'dkg',
    ROUND1 = 'round1',
    ROUND2 = 'round2',
    RESPONSE = 'response',
    REQUEST = 'request',
    ROLLUP = 'rollup',
}

/**
 * Maximum amount of action processed in a recursive proof
 */
const ACTION_PROCESS_LIMITS = 8;

/**
 * The size of an index value in bits for packing indexes array
 */
const INDEX_SIZE = 6;

/**
 * Maximum amount for each entity
 */
const INSTANCE_LIMITS = {
    ACTION: 2 ** 10,
    ADDRESS: ZkAppEnum.__LENGTH,
    COMMITTEE: 2 ** 6,
    MEMBER: 3,
    KEY: 2 ** 6,
    REQUEST: 2 ** 8,
    DIMENSION: 3,
};

/**
 * Fee charged for each request
 */
const REQUEST_FEE = 1e9;

/**
 * Minimum value for a request's period ~ 10 blocks
 */
const REQUEST_MIN_PERIOD = 30 * 60 * 1000;

/**
 * Waiting period before the expiration of a request ~ 100 blocks
 */
const REQUEST_EXPIRATION = 300 * 60 * 1000;

/**
 * Maximum value for number of contracts sharing rollup
 */
const ROLLUP_BATCH_MAX_SIZE = 8;

/**
 * Maximum value for the encrypted secret
 */
const SECRET_MAX = 1e12;

/**
 * Unit value for the encrypted secret
 */
const SECRET_UNIT = 1e7;
