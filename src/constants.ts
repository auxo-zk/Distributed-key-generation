export const ADDRESS_MAX_SIZE = 8;
export const COMMITTEE_MAX_SIZE = 3;
export const REQUEST_MAX_SIZE = 5;
export const INSTANCE_LIMITS = {
  COMMITTEE: 2 ** 3,
  KEY: 2 ** 3,
  REQUEST: 2 ** 3,
};

export enum ZkAppEnum {
  COMMITTEE,
  DKG,
  ROUND1,
  ROUND2,
  RESPONSE,
  REQUEST,
}

export enum Contract {
  COMMITTEE = 'committee',
  DKG = 'dkg',
  ROUND1 = 'round1',
  ROUND2 = 'round2',
  RESPONSE = 'response',
  REQUEST = 'request',
}
