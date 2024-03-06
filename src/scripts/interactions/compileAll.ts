import { Cache } from 'o1js';
import { compile } from '../helper/deploy.js';
import { DkgContract, RollupDkg } from '../../contracts/DKG.js';
import {
    FinalizeRound1,
    ReduceRound1,
    Round1Contract,
} from '../../contracts/Round1.js';
import {
    FinalizeRound2,
    ReduceRound2,
    Round2Contract,
} from '../../contracts/Round2.js';
import {
    BatchDecryption,
    BatchEncryption,
} from '../../contracts/Encryption.js';
import {
    FinalizeResponse,
    ReduceResponse,
    ResponseContract,
} from '../../contracts/Response.js';
import {
    CommitteeContract,
    RollupCommittee,
} from '../../contracts/Committee.js';
import { CreateRequest, RequestContract } from '../../contracts/Request.js';

async function main() {
    const cache = Cache.FileSystem('./caches');
    // const cache = "";
    await compile(RollupCommittee, cache);

    await compile(RollupDkg, cache);

    await compile(ReduceRound1, cache);
    await compile(FinalizeRound1, cache);

    await compile(ReduceRound2, cache);
    await compile(BatchEncryption, cache);
    await compile(FinalizeRound2, cache);

    await compile(ReduceResponse, cache);
    await compile(BatchDecryption, cache);
    await compile(FinalizeResponse, cache);

    await compile(CreateRequest, cache);

    await compile(CommitteeContract, cache);
    await compile(DkgContract, cache);
    await compile(Round1Contract, cache);
    await compile(Round2Contract, cache);
    await compile(ResponseContract, cache);
    await compile(RequestContract, cache);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
