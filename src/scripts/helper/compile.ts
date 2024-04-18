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
import { ComputeResult, UpdateRequest } from '../../contracts/Request.js';
import { RequestContract } from '../../contracts/Request.js';
import {
    UpdateTask,
    RequesterContract,
    TaskManagerContract,
    SubmissionContract,
} from '../../contracts/Requester.js';
import {
    ComputeResponse,
    FinalizeResponse,
    ResponseContract,
} from '../../contracts/Response.js';

export { compile };

async function compile(
    cache = Cache.FileSystem('./caches'),
    programs: Utils.Program[] = [],
    profiler = Utils.getProfiler('compile', fs),
    logger?: Utils.Logger
) {
    try {
        if (programs.length > 0) {
            for (let i = 0; i < programs.length; i++) {
                await Utils.compile(programs[i], cache, profiler, logger);
            }
        } else {
            await Utils.compile(Rollup, cache, profiler, logger);
            await Utils.compile(UpdateCommittee, cache, profiler, logger);
            await Utils.compile(UpdateKey, cache, profiler, logger);
            await Utils.compile(Elgamal, cache, profiler, logger);
            await Utils.compile(BatchEncryption, cache, profiler, logger);
            await Utils.compile(BatchDecryption, cache, profiler, logger);
            await Utils.compile(FinalizeRound1, cache, profiler, logger);
            await Utils.compile(FinalizeRound2, cache, profiler, logger);
            await Utils.compile(UpdateRequest, cache, profiler, logger);
            await Utils.compile(UpdateTask, cache, profiler, logger);
            await Utils.compile(ComputeResponse, cache, profiler, logger);
            await Utils.compile(FinalizeResponse, cache, profiler, logger);
            await Utils.compile(ComputeResult, cache, profiler, logger);

            await Utils.compile(RollupContract, cache, profiler, logger);
            await Utils.compile(CommitteeContract, cache, profiler, logger);
            await Utils.compile(DkgContract, cache, profiler, logger);
            await Utils.compile(Round1Contract, cache, profiler, logger);
            await Utils.compile(Round2Contract, cache, profiler, logger);
            await Utils.compile(RequestContract, cache, profiler, logger);
            await Utils.compile(TaskManagerContract, cache, profiler, logger);
            await Utils.compile(SubmissionContract, cache, profiler, logger);
            await Utils.compile(RequesterContract, cache, profiler, logger);
            await Utils.compile(ResponseContract, cache, profiler, logger);
        }
    } catch (error) {
        console.error(error);
    } finally {
        profiler.store();
    }
}

// compile(undefined, [], undefined, {
//     error: true,
//     info: true,
//     memoryUsage: false,
// })
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
