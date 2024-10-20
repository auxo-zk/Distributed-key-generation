// import { Rollup, RollupContract } from '../../contracts/Rollup.js';
import { CommitteeContract, RollupCommittee } from '../../zkapps/Committee.js';
import { KeyContract, RollupKey } from '../../zkapps/Key.js';
import {
    BatchDecryption,
    BatchEncryption,
    Elgamal,
} from '../../zkapps/ContributionProgram.js';
// import { RollupContribution, Round1Contract } from '../../contracts/Round1.js';
// import { FinalizeRound2, Round2Contract } from '../../contracts/Round2.js';
import { ComputeResult, RollupRequest } from '../../zkapps/Request.js';
import { RequestContract } from '../../zkapps/Request.js';
import { RollupTask, RequesterContract } from '../../zkapps/Requester.js';
import {
    ComputeResponse,
    FinalizeResponse,
    ResponseContract,
} from '../../zkapps/Response.js';
import { Utils } from '@auxo-dev/auxo-libs';

export async function analyze(programs: Utils.Program[] = []) {
    let info: {
        program: string;
        method: string;
        constraints: number;
        digest: string;
    }[] = [];
    let error: unknown[] = [];

    for (let i = 0; i < programs.length; i++) {
        let prg = programs[i];
        let analysis;
        try {
            analysis = await prg.analyzeMethods();
        } catch (err) {
            error.push(prg.name);
            console.error(err);
            continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(analysis).map(([key, value]: [string, any]) => {
            info.push({
                program: prg.name,
                method: key,
                constraints: value.rows,
                digest: value.digest,
            });
        });
    }

    console.log('Successfully compile:');
    console.table(info, ['program', 'method', 'constraints', 'digest']);
    console.log('Errors:', error);
}

async function main() {
    const programs = [
        // Rollup,
        RollupCommittee,
        RollupKey,
        Elgamal,
        BatchEncryption,
        BatchDecryption,
        // RollupContribution,
        // FinalizeRound2,
        RollupRequest,
        RollupTask,
        ComputeResponse,
        FinalizeResponse,
        ComputeResult,
    ];
    const contracts = [
        // RollupContract,
        CommitteeContract,
        KeyContract,
        // Round1Contract,
        // Round2Contract,
        RequestContract,
        RequesterContract,
        ResponseContract,
    ];

    await analyze(programs);
    await analyze(contracts);
}

// main()
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });
