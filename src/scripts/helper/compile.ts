import fs from 'fs/promises';
import { Cache } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
// import { Rollup, RollupContract } from '../../contracts/Rollup.js';
import { CommitteeContract, RollupCommittee } from '../../zkapps/Committee.js';
import { KeyContract, RollupKey } from '../../zkapps/Key.js';
import {
    BatchDecryption,
    BatchEncryption,
    BatchPolyCommitment,
} from '../../zkapps/ContributionProgram.js';
// import { RollupContribution, Round1Contract } from '../../contracts/Round1.js';
// import { FinalizeRound2, Round2Contract } from '../../contracts/Round2.js';
import { ComputeResult, RollupRequest } from '../../zkapps/Request.js';
import { RequestContract } from '../../zkapps/Request.js';
import {
    RollupTask,
    RequesterContract,
    TaskManagerContract,
    SubmissionContract,
} from '../../zkapps/Requester.js';
import {
    ComputeResponse,
    FinalizeResponse,
    ResponseContract,
} from '../../zkapps/Response.js';
import {
    ContributionContract,
    RollupContribution,
} from '../../zkapps/Contribution.js';

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
                RollupCommittee,
                RollupKey,
                BatchPolyCommitment,
                BatchEncryption,
                BatchDecryption,
                RollupContribution,
                RollupRequest,
                RollupTask,
                ComputeResponse,
                FinalizeResponse,
                ComputeResult,
                CommitteeContract,
                KeyContract,
                ContributionContract,
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
