import { CommitteeContract, CreateCommittee } from "../contracts/Committee.js";
import { DKGContract, UpdateKey } from "../contracts/DKG.js";
import { BatchDecryption, BatchEncryption } from "../contracts/Encryption.js";
import { CompleteResponse, ReduceResponse, ResponseContract } from "../contracts/Response.js";
import { FinalizeRound1, ReduceRound1, Round1Contract } from "../contracts/Round1.js";
import { FinalizeRound2, ReduceRound2, Round2Contract } from "../contracts/Round2.js";


async function main() {
  let programs = {
    CreateCommittee,
    UpdateKey,
    ReduceRound1,
    FinalizeRound1,
    ReduceRound2,
    BatchEncryption,
    FinalizeRound2,
    ReduceResponse,
    BatchDecryption,
    CompleteResponse,
  };

  let contracts = {
    CommitteeContract,
    DKGContract,
    Round1Contract,
    Round2Contract
  };

  let constraints: {[key: string]: number} = {};
  
  Object.entries(programs).map(([name, prg]) => {
    let analysis = (prg as any).analyzeMethods();
    let cs = {}
    Object.keys(prg).slice(7).map((e, i) => {
      Object.assign(cs, { [e]: analysis[i].rows });
    });
    Object.assign(constraints, { [name]: cs });
  })

  Object.entries(contracts).map(([name, ct]) => {
    let analysis = (ct as any).analyzeMethods();
    let cs = {};
    Object.entries(analysis).map(([k, v]) => {
      Object.assign(cs, { [k]: (v as any).rows });
    });
    Object.assign(constraints, { [name]: cs });
  })

  console.log(constraints);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  })


