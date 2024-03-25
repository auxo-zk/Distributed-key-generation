export {
    ACTION_PROCESS_LIMITS,
    INDEX_SIZE,
    INSTANCE_LIMITS,
    ENCRYPTION_LIMITS,
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
const ACTION_PROCESS_LIMITS = 16;

/**
 * The size of an index value in bits for packing indexes array
 */
const INDEX_SIZE = 6;

/**
 * Maximum amount for each entity
 */
const INSTANCE_LIMITS = {
    ACTION: 2 ** 10,
    ADDRESS: 2 ** 8,
    MEMBER: 3,
    COMMITTEE: 2 ** 6,
    KEY: 2 ** 6,
    REQUEST: 2 ** 8,
    REQUESTER: 2 ** 3,
};

const ENCRYPTION_LIMITS = {
    DIMENSION: 3,
    FULL_DIMENSION: 2 ** 6,
    SUBMISSION: 2 ** 10,
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
