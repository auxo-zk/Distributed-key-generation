import { CommitteeContract, CreateCommittee } from '../contracts/Committee.js';
import { DKGContract, UpdateKey } from '../contracts/DKG.js';
import { BatchDecryption, BatchEncryption } from '../contracts/Encryption.js';
import { CreateRequest, RequestContract } from '../contracts/Request.js';
import {
  CreateReduce,
  RequestHelperContract,
} from '../contracts/RequestHelper.js';
import {
  CompleteResponse,
  ReduceResponse,
  ResponseContract,
} from '../contracts/Response.js';
import {
  FinalizeRound1,
  ReduceRound1,
  Round1Contract,
} from '../contracts/Round1.js';
import {
  FinalizeRound2,
  ReduceRound2,
  Round2Contract,
} from '../contracts/Round2.js';

const PROGRAMS = {
  BatchEncryption,
  BatchDecryption,
  CreateCommittee,
  UpdateKey,
  ReduceRound1,
  FinalizeRound1,
  ReduceRound2,
  FinalizeRound2,
  ReduceResponse,
  CompleteResponse,
  // CreateRequest,
  // CreateRollupStatus,
  // RollupActions,
};

const CONTRACTS = {
  CommitteeContract,
  DKGContract,
  Round1Contract,
  Round2Contract,
  ResponseContract,
  // RequestContract,
  // RequestHelperContract,
};

const DEPENDENCIES = {
  CommitteeContract: [CreateCommittee],
  DKGContract: [UpdateKey],
  Round1Contract: [ReduceRound1, FinalizeRound1],
  Round2Contract: [ReduceRound2, BatchEncryption, FinalizeRound2],
  ResponseContract: [ReduceResponse, BatchDecryption, CompleteResponse],
  RequestContract: [],
  RequestHelperContract: [],
};

async function query(constraints: boolean = true, cacheFiles: boolean = false) {
  if (constraints) {
    // TODO - Log table
    console.log('Constraints list:');
    let constraints: { [key: string]: number } = {};

    Object.entries(PROGRAMS).map(([name, prg]) => {
      let analysis = (prg as any).analyzeMethods();
      let cs = {};
      Object.keys(prg)
        .slice(7)
        .map((e, i) => {
          Object.assign(cs, { [e]: analysis[i].rows });
        });
      Object.assign(constraints, { [name]: cs });
    });

    Object.entries(CONTRACTS).map(([name, ct]) => {
      let analysis = (ct as any).analyzeMethods();
      let cs = {};
      Object.entries(analysis).map(([k, v]) => {
        Object.assign(cs, { [k]: (v as any).rows });
      });
      Object.assign(constraints, { [name]: cs });
    });

    console.log(constraints);
    console.log();
  }

  if (cacheFiles) {
    // TODO - Log table
    console.log('Cache files list:');
    let cacheFiles: { [key: string]: string[] } = {};

    enum KeyType {
      StepProvingKey = 'step-pk',
      StepVerificationKey = 'step-vk',
      WrapProvingKey = 'wrap-pk',
      WrapVerificationKey = 'wrap-vk',
    }

    Object.entries(DEPENDENCIES).map(([ct, prgs], i) => {
      let ctName = ct.toLowerCase();
      let fileNames: string[] = [];
      fileNames = fileNames.concat([
        `${KeyType.WrapProvingKey}-${ctName}`,
        `${KeyType.WrapProvingKey}-${ctName}.header`,
        `${KeyType.WrapVerificationKey}-${ctName}`,
        `${KeyType.WrapVerificationKey}-${ctName}.header`,
      ]);

      let ctAnalysis = (Object.values(CONTRACTS)[i] as any).analyzeMethods();
      console.log(ctAnalysis);

      Object.assign(cacheFiles, { [ct]: fileNames });
    });
    console.log(cacheFiles);
    console.log();
  }
}

query()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
