export enum EventEnum {
    ROLLUPED = 'actions-rolluped',
    PROCESSED = 'actions-processed',
}

export enum ErrorEnum {
    // Address errors
    ZKAPP_ROOT = 'Incorrect zkApp MT root',
    ZKAPP_KEY = 'Incorrect zkApp MT key',

    // Action errors
    ACTION_TYPE = 'Incorrect action type',

    CURRENT_ACTION_STATE = 'Incorrect current action state',
    LAST_ACTION_STATE = 'Incorrect last action state',

    ROLLUP_ROOT = 'Incorrect rollup MT root',
    ROLLUP_KEY = 'Incorrect rollup MT key',
    PROCESS_ROOT = 'Incorrect process MT root',
    PROCESS_KEY = 'Incorrect process MT key',

    // CommitteeContract errors
    NEXT_COMMITTEE_ID = 'Incorrect next committee Id',
    MEMBER_ROOT = 'Incorrect member MT root',
    MEMBER_KEY_L1 = 'Incorrect member MT level 1 key',
    MEMBER_KEY_L2 = 'Incorrect member MT level 2 key',
    SETTING_ROOT = 'Incorrect setting MT root',
    SETTING_KEY = 'Incorrect setting MT key',

    // DkgContract errors
    KEY_COUNTER_ROOT = 'Incorrect key counter MT root',
    KEY_COUNTER_KEY = 'Incorrect key counter MT key',
    KEY_COUNTER_LIMIT = 'Exceeding key counter limit',
    KEY_STATUS_ROOT = 'Incorrect key status MT root',
    KEY_STATUS_KEY = 'Incorrect key status MT key',
    KEY_STATUS_VALUE = 'Incorrect key status value',

    // Round1Contract errors
    R1_CONTRIBUTION_THRESHOLD = 'Incorrect number of round 1 contributions',
    R1_CONTRIBUTION_VALUE = 'Incorrect round 1 contribution value',
    R1_CONTRIBUTION_KEY_INDEX = 'Incorrect key index',
    R1_CONTRIBUTION_ROOT = 'Incorrect round 1 contribution MT root',
    R1_CONTRIBUTION_KEY_L1 = 'Incorrect round 1 contribution MT level 1 key',
    R1_CONTRIBUTION_KEY_L2 = 'Incorrect round 1 contribution MT level 2 key',
    ENC_PUBKEY_ROOT = 'Incorrect round 1 public key MT root',
    ENC_PUBKEY_KEY_L1 = 'Incorrect round 1 public key MT level 1 key',
    ENC_PUBKEY_KEY_L2 = 'Incorrect round 1 public key MT level 2 key',

    // Round2Contract errors
    R2_CONTRIBUTION_ORDER = 'Incorrect contribution order',
    R2_CONTRIBUTION_THRESHOLD = 'Incorrect number of contributions',
    R2_CONTRIBUTION_VALUE = 'Incorrect contribution value',
    R2_CONTRIBUTION_KEY_INDEX = 'Incorrect key index',
    R2_CONTRIBUTION_ROOT = 'Incorrect contribution MT root',
    R2_CONTRIBUTION_KEY_L1 = 'Incorrect contribution MT level 1 key',
    R2_CONTRIBUTION_KEY_L2 = 'Incorrect contribution MT level 2 key',
    INITIAL_ENCRYPTION_HASHES = 'Incorrect initial encryption hash values',
    ENCRYPTION_ROOT = 'Incorrect public key MT root',
    ENCRYPTION_KEY_L1 = 'Incorrect public key MT level 1 key',
    ENCRYPTION_KEY_L2 = 'Incorrect public key MT level 2 key',

    // RequesterContract errors
    REQUEST_VECTOR_DIM = 'Incorrect dimension',
    REQUEST_COUNTER = 'Incorrect request counter',
    REQUEST_ID_ROOT = 'Incorrect request Id MT root',
    REQUEST_ID_KEY = 'Incorrect request Id MT key',
    ACCUMULATION_ROOT = 'Incorrect accumulation Id MT root',
    ACCUMULATION_KEY = 'Incorrect accumulation Id MT key',
    COMMITMENT_ROOT = 'Incorrect commitment Id MT root',
    COMMITMENT_KEY = 'Incorrect commitment Id MT key',

    // ResponseContract errors
    REQUEST_ID = 'Incorrect request Id',
    RES_CONTRIBUTION_ROOT = 'Incorrect contribution MT root',
    RES_CONTRIBUTION_KEY_L1 = 'Incorrect contribution MT level 1 key',
    RES_CONTRIBUTION_KEY_L2 = 'Incorrect contribution MT level 2 key',
    RES_CONTRIBUTION_DIMENSION = 'Incorrect contribution dimension',
    RES_CONTRIBUTION_THRESHOLD = 'Incorrect number of contributions',
}
