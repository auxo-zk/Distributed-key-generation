export enum EventEnum {
    ROLLUPED = 'actions-rolluped',
    PROCESSED = 'actions-processed',
}

export enum ErrorEnum {
    ACTION_TYPE = 'Incorrect action type',

    ZKAPP_ROOT = 'Incorrect zkApp MT root',
    ZKAPP_KEY = 'Incorrect zkApp MT key',

    CURRENT_ACTION_STATE = 'Incorrect current action state',
    LAST_ACTION_STATE = 'Incorrect last action state',

    ROLLUP_ROOT = 'Incorrect rollup MT root',
    ROLLUP_KEY = 'Incorrect rollup MT key',
    PROCESS_ROOT = 'Incorrect process MT root',
    PROCESS_KEY = 'Incorrect process MT key',

    NEXT_COMMITTEE_ID = 'Incorrect next committee Id',
    MEMBER_ROOT = 'Incorrect member MT root',
    MEMBER_KEY_L1 = 'Incorrect member MT level 1 key',
    MEMBER_KEY_L2 = 'Incorrect member MT level 2 key',
    SETTING_ROOT = 'Incorrect setting MT root',
    SETTING_KEY = 'Incorrect setting MT key',

    KEY_COUNTER_ROOT = 'Incorrect key counter MT root',
    KEY_COUNTER_KEY = 'Incorrect key counter MT key',
    KEY_COUNTER_LIMIT = 'Exceeding key counter limit',
    KEY_STATUS_ROOT = 'Incorrect key status MT root',
    KEY_STATUS_KEY = 'Incorrect key status MT key',
    KEY_STATUS_VALUE = 'Incorrect key status value',
}
