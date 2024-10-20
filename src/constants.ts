import { Utils } from '@auxo-dev/auxo-libs';

export {
    ACTION_PROCESS_LIMITS,
    INDEX_SIZE,
    INST_LIMITS,
    INST_BIT_LIMITS,
    ENC_LIMITS,
    ENC_BIT_LIMITS,
    NETWORK_LIMITS,
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
 * Minimum value for a request's period ~ 10 blocks
 */
// const REQUEST_MIN_PERIOD = 30 * 60 * 1000;
const REQUEST_MIN_PERIOD = 10;

/**
 * Waiting period before the expiration of a request ~ 100 blocks
 */
// const REQUEST_EXPIRATION = 300 * 60 * 1000;
const REQUEST_EXPIRATION = 100;

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
const INST_LIMITS = {
    ACTION: 2 ** 8,
    ADDRESS: 2 ** 3, // Devnet: 2**3 - Mainnet: 2**3
    MEMBER: 20, // Devnet: 16 - Mainnet: 20
    THRESHOLD: 15, // Devnet: 12 - Mainnet: 15
    COMMITTEE: 2 ** 16, // Devnet: 2**8 - Mainnet: 2**16
    KEY: 2 ** 16, // Devnet: 2**8 - Mainnet: 2**16
    REQUEST: 2 ** 12, // Devnet: 2**11 - Mainnet: 2**20
    REQUESTER: 2 ** 4, // Devnet: 2**3 - Mainnet: 2**4
    TASK: 2 ** 8, // Devnet: 2**8 - Mainnet: 2**16
};

const INST_BIT_LIMITS = {
    ADDRESS: Utils.getBitLength(INST_LIMITS.ADDRESS - 1),
    MEMBER: Utils.getBitLength(INST_LIMITS.MEMBER - 1),
    THRESHOLD: Utils.getBitLength(INST_LIMITS.THRESHOLD - 1),
    COMMITTEE: Utils.getBitLength(INST_LIMITS.COMMITTEE - 1),
    KEY: Utils.getBitLength(INST_LIMITS.KEY - 1),
    REQUEST: Utils.getBitLength(INST_LIMITS.REQUEST - 1),
    REQUESTER: Utils.getBitLength(INST_LIMITS.REQUESTER - 1),
    TASK: Utils.getBitLength(INST_LIMITS.TASK - 1),
};

const ENC_LIMITS = {
    DIMENSION: 1023, // Devnet: 128 - Mainnet: 1024
    SUB_DIMENSION: 16, // Devnet: 8  - Mainnet: 16
    RESOLUTION: 32, // Devnet: 16 - Mainnet: 32 // Must be a multiple of SUB_DIMENSION
    RESULT: 10 ** 10, // Devnet: 10**10 - Mainnet: 10**14
};

const ENC_BIT_LIMITS = {
    DIMENSION: Utils.getBitLength(ENC_LIMITS.DIMENSION - 1),
    RESULT: Utils.getBitLength(ENC_LIMITS.RESULT - 1),
};

const NETWORK_LIMITS = {
    ROLLUP_ACTIONS: 25, // Devnet: 25 - Mainnet: 100
};
