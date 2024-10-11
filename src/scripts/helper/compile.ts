import fs from 'fs/promises';
import { Cache } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
// import { Rollup, RollupContract } from '../../contracts/Rollup.js';
import {
    CommitteeContract,
    RollupCommittee,
} from '../../contracts/Committee.js';
import { KeyContract, RollupKey } from '../../contracts/Key.js';
import {
    BatchDecryption,
    BatchEncryption,
    Elgamal,
} from '../../contracts/Encryption.js';
// import { FinalizeRound1, Round1Contract } from '../../contracts/Round1.js';
// import { FinalizeRound2, Round2Contract } from '../../contracts/Round2.js';
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
        if (!programs || programs.length == 0) {
            programs = [
                // Rollup,
                RollupCommittee,
                RollupKey,
                Elgamal,
                BatchEncryption,
                BatchDecryption,
                // FinalizeRound1,
                // FinalizeRound2,
                UpdateRequest,
                UpdateTask,
                ComputeResponse,
                FinalizeResponse,
                ComputeResult,
                // RollupContract,
                CommitteeContract,
                KeyContract,
                // Round1Contract,
                // Round2Contract,
                RequestContract,
                TaskManagerContract,
                SubmissionContract,
                RequesterContract,
                ResponseContract,
            ];
        }
        for (let i = 0; i < programs.length; i++) {
            await Utils.compile(programs[i], { cache, profiler, logger });
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
