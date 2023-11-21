import { Encoding, Field, Poseidon } from 'o1js';

export const MAIN_TREE_DEPTH = 16;
export const COMMITTEE_MAX_SIZE = 4;
export const REQUEST_MAX_SIZE = 10;
export const INSTANCE_LIMITS = {
  COMMITTEE: 2 ** 8,
  KEY: 2 ** 8,
  REQUEST: 2 ** 8,
};

export enum ZkAppEnum {
  COMMITTEE,
  DKG,
  ROUND1,
  ROUND2,
  RESPONSE,
  REQUEST,
}
