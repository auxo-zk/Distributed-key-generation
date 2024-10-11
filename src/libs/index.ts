import * as Committee from './Committee.js';
import * as Requester from './Requester.js';

export function getBitLength(N: number): number {
    return Math.floor(Math.log2(N)) + 1;
}

export { Committee, Requester };
