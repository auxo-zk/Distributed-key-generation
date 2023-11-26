export const ADDRESS_MAX_SIZE = 8;
export const COMMITTEE_MAX_SIZE = 4;
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
