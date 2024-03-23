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
import { UpdateTask, RequesterContract } from '../../contracts/Requester.js';
import {
    ComputeResponse,
    FinalizeResponse,
    ResponseContract,
} from '../../contracts/Response.js';

async function main() {
    const programs = [
        Rollup,
        UpdateCommittee,
        UpdateKey,
        Elgamal,
        BatchEncryption,
        BatchDecryption,
        FinalizeRound1,
        FinalizeRound2,
        UpdateRequest,
        UpdateTask,
        ComputeResponse,
        FinalizeResponse,
        ComputeResult,

        RollupContract,
        CommitteeContract,
        DkgContract,
        Round1Contract,
        Round2Contract,
        RequestContract,
        RequesterContract,
        ResponseContract,
    ];

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

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
