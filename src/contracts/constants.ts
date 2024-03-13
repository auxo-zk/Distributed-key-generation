import { Field } from 'o1js';

export type ZkAppAction = {
    hash(): Field;
};

export enum EventEnum {
    ROLLUPED = 'actions-rolluped',
    PROCESSED = 'actions-processed',
}

export enum ErrorEnum {
    // Address errors
    ZKAPP_ROOT = 'Incorrect zkApp MT root',
    ZKAPP_INDEX = 'Incorrect zkApp MT index',
    ZKAPP_ADDRESS = 'Incorrect zkApp address',

    // Action errors
    ACTION_TYPE = 'Incorrect action type',

    CURRENT_ACTION_STATE = 'Incorrect current action state',
    LAST_ACTION_STATE = 'Incorrect last action state',

    ROLLUP_ROOT = 'Incorrect rollup MT root',
    ROLLUP_INDEX = 'Incorrect rollup MT index',
    PROCESS_ROOT = 'Incorrect process MT root',
    PROCESS_INDEX = 'Incorrect process MT index',

    // Elgamal Encryption
    ELGAMAL_ENCRYPTION = 'Incorrect ElGamal encryption',
    ELGAMAL_DECRYPTION = 'Incorrect ElGamal decryption',
    ELGAMAL_BATCH_SIZE = 'Incorrect ElGamal batch size',
    ELGAMAL_KEY = 'Incorrect ElGamal key',

    // CommitteeContract errors
    COMMITTEE_THRESHOLD = 'Incorrect threshold setting',
    DUPLICATED_MEMBER = 'Existed member',
    NEXT_COMMITTEE_ID = 'Incorrect next committee Id',
    MEMBER_ROOT = 'Incorrect member MT root',
    MEMBER_INDEX_L1 = 'Incorrect member MT level 1  index',
    MEMBER_INDEX_L2 = 'Incorrect member MT level 2 index',
    SETTING_ROOT = 'Incorrect setting MT root',
    SETTING_INDEX = 'Incorrect setting MT index',

    // DkgContract errors
    KEY_COUNTER_ROOT = 'Incorrect key counter MT root',
    KEY_COUNTER_INDEX = 'Incorrect key counter MT index',
    KEY_COUNTER_LIMIT = 'Exceeding key counter limit',
    KEY_STATUS_ROOT = 'Incorrect key status MT root',
    KEY_STATUS_INDEX = 'Incorrect key status MT index',
    KEY_STATUS_VALUE = 'Incorrect key status value',
    KEY_ROOT = 'Incorrect key MT root',
    KEY_INDEX = 'Incorrect key MT index',

    // Round1Contract errors
    R1_CONTRIBUTION_THRESHOLD = 'Incorrect number of round 1 contributions',
    R1_CONTRIBUTION_VALUE = 'Incorrect round 1 contribution value',
    R1_CONTRIBUTION_KEY_INDEX = 'Incorrect key index',
    R1_CONTRIBUTION_ROOT = 'Incorrect round 1 contribution MT root',
    R1_CONTRIBUTION_INDEX_L1 = 'Incorrect round 1 contribution MT level 1  index',
    R1_CONTRIBUTION_INDEX_L2 = 'Incorrect round 1 contribution MT level 2 index',
    ENC_PUBKEY_ROOT = 'Incorrect round 1 public key MT root',
    ENC_PUBKEY_INDEX_L1 = 'Incorrect round 1 public key MT level 1  index',
    ENC_PUBKEY_INDEX_L2 = 'Incorrect round 1 public key MT level 2 index',

    // Round2Contract errors
    R2_CONTRIBUTION_ORDER = 'Incorrect contribution order',
    R2_CONTRIBUTION_THRESHOLD = 'Incorrect number of contributions',
    R2_CONTRIBUTION_VALUE = 'Incorrect contribution value',
    R2_CONTRIBUTION_KEY_INDEX = 'Incorrect key index',
    R2_CONTRIBUTION_ROOT = 'Incorrect contribution MT root',
    R2_CONTRIBUTION_INDEX_L1 = 'Incorrect contribution MT level 1  index',
    R2_CONTRIBUTION_INDEX_L2 = 'Incorrect contribution MT level 2 index',
    INITIAL_ENCRYPTION_HASHES = 'Incorrect initial encryption hash values',
    ENCRYPTION_ROOT = 'Incorrect public key MT root',
    ENCRYPTION_INDEX_L1 = 'Incorrect public key MT level 1  index',
    ENCRYPTION_INDEX_L2 = 'Incorrect public key MT level 2 index',

    // RequesterContract errors
    REQUEST_VECTOR_DIM = 'Incorrect dimension',
    REQUEST_COUNTER = 'Incorrect request counter',
    REQUEST_ID_ROOT = 'Incorrect request Id MT root',
    REQUEST_ID_INDEX = 'Incorrect request Id MT index',
    COMMITMENT_COUNTER = 'Incorrect commitment counter',
    COMMITMENT_ROOT = 'Incorrect commitment Id MT root',
    COMMITMENT_INDEX = 'Incorrect commitment Id MT index',
    REQUEST_PERIOD = 'Incorrect period for the request',
    REQUEST_PERIOD_ROOT = 'Incorrect request period MT root',
    REQUEST_PERIOD_INDEX = 'Incorrect request period MT index',

    // RequestContract errors
    TASK_ID = 'Incorrect request Id',
    TASK_ID_ROOT = 'Incorrect task Id MT root',
    TASK_ID_INDEX = 'Incorrect task Id MT index',
    KEY_INDEX_ROOT = 'Incorrect key index MT root',
    KEY_INDEX_INDEX = 'Incorrect key index MT index',
    REQUEST_STATUS = 'Incorrect request status',
    ACCUMULATION_ROOT = 'Incorrect accumulation Id MT root',
    ACCUMULATION_INDEX = 'Incorrect accumulation Id MT index',
    REQUEST_EXP_ROOT = 'Incorrect request expiration MT root',
    REQUEST_EXP_INDEX = 'Incorrect request expiration MT index',
    REQUEST_RESULT = 'Incorrect request result',
    REQUEST_RESULT_ROOT = 'Incorrect request result MT root',
    REQUEST_RESULT_INDEX = 'Incorrect request result MT index',

    // ResponseContract errors
    REQUEST_ID = 'Incorrect request Id',
    RES_CONTRIBUTION_ROOT = 'Incorrect contribution MT root',
    RES_CONTRIBUTION_INDEX_L1 = 'Incorrect contribution MT level 1  index',
    RES_CONTRIBUTION_INDEX_L2 = 'Incorrect contribution MT level 2 index',
    RES_CONTRIBUTION_DIMENSION = 'Incorrect contribution dimension',
    RES_CONTRIBUTION_THRESHOLD = 'Incorrect number of contributions',
    RES_D_ROOT = 'Incorrect D MT root',
    RES_D_INDEX = 'Incorrect D MT index',

    // RollupContract errors
    ACTION_COUNTER_ROOT = 'Incorrect rollup counter MT root',
    ACTION_COUNTER_INDEX = 'Incorrect rollup counter MT index',
}
