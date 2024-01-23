/**
 * The unit value for the funding amount
 */
export const FUNDING_UNIT = 1e7;

/**
 * The maximum value for the funding amount
 */
export const FUNDING_MAX = 1e12;

/**
 * Maximum amount of zkApp address in storage
 */
export const ADDRESS_MAX_SIZE = 8;

/**
 * Maximum amount of members in a committee
 */
export const COMMITTEE_MAX_SIZE = 3;

/**
 * Maximum dimension of a request
 */
export const REQUEST_MAX_SIZE = 5;

/**
 * Maximum amount for each entity
 */
export const INSTANCE_LIMITS = {
  COMMITTEE: 2 ** 3,
  KEY: 2 ** 3,
  REQUEST: 2 ** 3,
};

/**
 * The size of an index value in bits for packing indexes array
 */
export const INDEX_SIZE = 6;

/**
 * Indexes of zkApps in the address storage
 */
export enum ZkAppEnum {
  COMMITTEE,
  DKG,
  ROUND1,
  ROUND2,
  RESPONSE,
  REQUEST,
}

/**
 * All zkApp/smart contract names
 */
export enum Contract {
  COMMITTEE = 'committee',
  DKG = 'dkg',
  ROUND1 = 'round1',
  ROUND2 = 'round2',
  RESPONSE = 'response',
  REQUEST = 'request',
}
