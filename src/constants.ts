import { Utils } from '@auxo-dev/auxo-libs';

export {
    ACTION_PROCESS_LIMITS,
    INDEX_SIZE,
    INST_LIMITS,
    INST_BIT_LIMITS,
    ENC_LIMITS,
    NETWORK_LIMITS,
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
    ACTION: Utils.getBitLength(INST_LIMITS.ACTION),
    ADDRESS: Utils.getBitLength(INST_LIMITS.ADDRESS),
    MEMBER: Utils.getBitLength(INST_LIMITS.MEMBER),
    THRESHOLD: Utils.getBitLength(INST_LIMITS.THRESHOLD),
    COMMITTEE: Utils.getBitLength(INST_LIMITS.COMMITTEE),
    KEY: Utils.getBitLength(INST_LIMITS.KEY),
    REQUEST: Utils.getBitLength(INST_LIMITS.REQUEST),
    REQUESTER: Utils.getBitLength(INST_LIMITS.REQUESTER),
    TASK: Utils.getBitLength(INST_LIMITS.TASK),
};

const ENC_LIMITS = {
    DIMENSION: 400, // Devnet: 100 - Mainnet: 400
    SPLIT: 20, // Devnet: 10 - Mainnet: 20
    SPLIT_SIZE: 4, // Devnet: 2 - Mainnet: 4
    RESULT: 10 ** 10, // Devnet: 10**10 - Mainnet: 10**14
};

const NETWORK_LIMITS = {
    ROLLUP_ACTIONS: 25, // Devnet: 25 - Mainnet: 100
};
