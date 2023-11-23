export const ADDRESS_MAX_SIZE = 8;
export const COMMITTEE_MAX_SIZE = 15;
export const REQUEST_MAX_SIZE = 30;
export const INSTANCE_LIMITS = {
  COMMITTEE: 2 ** 16,
  KEY: 2 ** 16,
  REQUEST: 2 ** 16,
};

export enum ZkAppEnum {
  COMMITTEE,
  DKG,
  ROUND1,
  ROUND2,
  RESPONSE,
  REQUEST,
}
