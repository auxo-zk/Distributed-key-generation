export const ADDRESS_MAX_SIZE = 8;
export const COMMITTEE_MAX_SIZE = 8;
export const REQUEST_MAX_SIZE = 16;
export const INSTANCE_LIMITS = {
  COMMITTEE: 2 ** 5,
  KEY: 2 ** 5,
  REQUEST: 2 ** 5,
};

export enum ZkAppEnum {
  COMMITTEE,
  DKG,
  ROUND1,
  ROUND2,
  RESPONSE,
  REQUEST,
}
