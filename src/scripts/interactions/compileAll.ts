import { Cache } from 'o1js';
import { compile } from '../helper/deploy.js';
import { DkgContract, RollupDkg } from '../../contracts/DKG.js';
import {
    FinalizeRound1,
    RollupRound1,
    Round1Contract,
} from '../../contracts/Round1.js';
import {
    FinalizeRound2,
    RollupRound2,
    Round2Contract,
} from '../../contracts/Round2.js';
import {
    BatchDecryption,
    BatchEncryption,
} from '../../contracts/Encryption.js';
import {
    FinalizeResponse,
    RollupResponse,
    ResponseContract,
} from '../../contracts/Response.js';
import {
    CommitteeContract,
    UpdateCommittee,
} from '../../contracts/Committee.js';
import { UpdateRequest, RequestContract } from '../../contracts/Request.js';

async function main() {
    const cache = Cache.FileSystem('./caches');
    // const cache = "";
    await compile(UpdateCommittee, cache);

    await compile(RollupDkg, cache);

    await compile(RollupRound1, cache);
    await compile(FinalizeRound1, cache);

    await compile(RollupRound2, cache);
    await compile(BatchEncryption, cache);
    await compile(FinalizeRound2, cache);

    await compile(RollupResponse, cache);
    await compile(BatchDecryption, cache);
    await compile(FinalizeResponse, cache);

    await compile(UpdateRequest, cache);

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
