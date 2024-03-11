import fs from 'fs/promises';
import { Cache } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { Rollup, RollupContract } from '../../contracts/Rollup.js';
import {
    CommitteeContract,
    UpdateCommittee,
} from '../../contracts/Committee.js';
import { DkgContract, UpdateKey } from '../../contracts/DKG.js';
import {
    BatchDecryption,
    BatchEncryption,
    Elgamal,
} from '../../contracts/Encryption.js';
import { FinalizeRound1, Round1Contract } from '../../contracts/Round1.js';
import { FinalizeRound2, Round2Contract } from '../../contracts/Round2.js';
import { RequestContract, UpdateRequest } from '../../contracts/Request.js';
import {
    AccumulateEncryption,
    RequesterContract,
} from '../../contracts/Requester.js';
import {
    FinalizeResponse,
    ResponseContract,
} from '../../contracts/Response.js';

async function main() {
    const cache = Cache.FileSystem('./caches');
    const logger: Utils.Logger = {
        memoryUsage: true,
        info: true,
    };
    const profilerName = 'compile-without-cache';
    const profiler = Utils.getProfiler(profilerName, fs);

    await Utils.compile(Rollup, cache, logger, profiler);
    await Utils.compile(UpdateCommittee, cache, logger, profiler);
    await Utils.compile(UpdateKey, cache, logger, profiler);
    await Utils.compile(Elgamal, cache, logger, profiler);
    await Utils.compile(BatchEncryption, cache, logger, profiler);
    await Utils.compile(BatchDecryption, cache, logger, profiler);
    await Utils.compile(FinalizeRound1, cache, logger, profiler);
    await Utils.compile(FinalizeRound2, cache, logger, profiler);
    await Utils.compile(UpdateRequest, cache, logger, profiler);
    await Utils.compile(AccumulateEncryption, cache, logger, profiler);
    await Utils.compile(FinalizeResponse, cache, logger, profiler);

    await Utils.compile(RollupContract, cache, logger, profiler);
    await Utils.compile(CommitteeContract, cache, logger, profiler);
    await Utils.compile(DkgContract, cache, logger, profiler);
    await Utils.compile(Round1Contract, cache, logger, profiler);
    await Utils.compile(Round2Contract, cache, logger, profiler);
    await Utils.compile(RequestContract, cache, logger, profiler);
    await Utils.compile(RequesterContract, cache, logger, profiler);
    await Utils.compile(ResponseContract, cache, logger, profiler);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
