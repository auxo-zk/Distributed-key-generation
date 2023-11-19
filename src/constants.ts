import { Encoding, Field, Poseidon } from 'o1js';

export const COMMITTEE_MAX_SIZE = 8;
export const REQUEST_MAX_SIZE = 32;
export const REDUCE_MAX_SIZE = 32;

const getZkAppIndex = (name: string): Field =>
  Poseidon.hash(Encoding.stringToFields(name));

export const ZK_APP = {
  COMMITTEE: getZkAppIndex('committee'),
  DKG: getZkAppIndex('dkg'),
  ROUND_1: getZkAppIndex('round1'),
  ROUND_2: getZkAppIndex('round2'),
  RESPONSE: getZkAppIndex('response'),
  REQUEST: getZkAppIndex('request'),
};
