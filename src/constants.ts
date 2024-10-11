export {
    ACTION_PROCESS_LIMITS,
    INDEX_SIZE,
    INSTANCE_LIMITS,
    ENC_LIMITS,
    REQUEST_FEE,
    REQUEST_MIN_PERIOD,
    REQUEST_EXPIRATION,
    ROLLUP_BATCH_MAX_SIZE,
    SECRET_MAX,
    SECRET_UNIT,
};

/**
 * Maximum amount of action processed in a recursive proof
 */
const ACTION_PROCESS_LIMITS = 10;

/**
 * The size of an index value in bits for packing indices array
 */
const INDEX_SIZE = 6;

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

/**
 * Maximum amount for each entity
 */
const INSTANCE_LIMITS = {
    ACTION: 2 ** 8,
    ADDRESS: 2 ** 4,
    MEMBER: 2 ** 3,
    COMMITTEE: 2 ** 8,
    KEY: 2 ** 8,
    REQUEST: 2 ** 8,
    REQUESTER: 2 ** 3,
};

const ENC_LIMITS = {
    RESULT: 10 ** 8, // Devnet: 10**4 - Mainnet: 10**7
    SPLIT: 16, // Devnet: 16 - Mainnet: 64
    DIMENSION: 32, // Devnet: 32 - Mainnet: 128
};
