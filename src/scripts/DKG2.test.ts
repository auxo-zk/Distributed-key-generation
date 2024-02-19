import {
    AccountUpdate,
    Cache,
    Field,
    Group,
    Mina,
    Poseidon,
    PrivateKey,
    Provable,
    PublicKey,
    Reducer,
    Scalar,
    SmartContract,
} from 'o1js';
import { CustomScalar } from '@auxo-dev/auxo-libs';
import fs from 'fs';
import { getProfiler } from './helper/profiler.js';
import { Config, Key } from './helper/config.js';
import { CommitteeContract, RollupCommittee } from '../contracts/Committee.js';
import {
    Action as DKGAction,
    ActionEnum,
    ACTION_MASK,
    DkgContract,
    KeyStatus,
    RollupDkg,
} from '../contracts/DKG.js';
import {
    Action as Round1Action,
    FinalizeRound1,
    ReduceRound1,
    Round1Contract,
    Round1Input,
} from '../contracts/Round1.js';
import {
    Action as Round2Action,
    FinalizeRound2,
    ReduceRound2,
    Round2Contract,
    Round2Input,
} from '../contracts/Round2.js';
import {
    Action as ResponseAction,
    CompleteResponse,
    ReduceResponse,
    ResponseContract,
    ResponseInput,
} from '../contracts/Response.js';
import {
    BatchDecryption,
    BatchDecryptionInput,
    BatchDecryptionProof,
    BatchEncryption,
    BatchEncryptionInput,
    BatchEncryptionProof,
    PlainArray,
    RandomArray,
} from '../contracts/Encryption.js';
import {
    EMPTY_LEVEL_2_TREE as COMMITTEE_LEVEL_2_TREE,
    KeyCounterStorage,
    MemberStorage,
    SettingStorage,
} from '../contracts/CommitteeStorage.js';
import {
    EMPTY_LEVEL_2_TREE as DKG_LEVEL_2_TREE,
    EncryptionStorage,
    KeyStatusStorage,
    PublicKeyStorage,
    Round1ContributionStorage,
    Round2ContributionStorage,
} from '../contracts/DKGStorage.js';
import {
    ActionStatus,
    AddressStorage,
    ReduceStorage,
    getZkAppRef,
} from '../contracts/SharedStorage.js';
import {
    CArray,
    EncryptionHashArray,
    PublicKeyArray,
    Round2Data,
    SecretPolynomial,
    UArray,
    cArray,
    calculatePublicKey,
    generateRandomPolynomial,
    getResponseContribution,
    getRound1Contribution,
    getRound2Contribution,
} from '../libs/Committee.js';
import { ZkAppEnum, Contract } from '../constants.js';
import {
    RArray,
    accumulateEncryption,
    generateEncryption,
} from '../libs/Requestor.js';
import {
    CreateRequest,
    RequestContract,
    RequestVector,
    RequestAction,
} from '../contracts/Request.js';
import { ResponseContributionStorage } from '../contracts/RequestStorage.js';

describe('DKG', () => {
    const doProofs = false;
    const profiling = false;
    const logMemory = true;
    const cache = Cache.FileSystem('./caches');
    const DKGProfiler = getProfiler('Benchmark DKG');
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    let feePayerKey: Key;
    let contracts: {
        [key: string]: {
            key: Key;
            contract: SmartContract;
            actionStates: Field[];
        };
    } = {};

    let committeeIndex = Field(0);
    let T = 1,
        N = 2;
    let members: Key[] = Local.testAccounts.slice(1, N + 1);
    let responsedMembers = [0];
    // let indexArray = new IndexArray([Field(1)]);
    let secrets: SecretPolynomial[] = [];
    let publicKeys: Group[] = [];
    let requestId = Field(0);
    let mockRequests = [
        [1000n, 2000n, 3000n],
        [4000n, 6000n, 9000n],
    ];
    let result = [5000n, 8000n, 12000n, 0n, 0n];
    let R: Group[][] = [];
    let M: Group[][] = [];
    let sumR: Group[] = [];
    let sumM: Group[] = [];
    let D: Group[][] = [];

    // CommitteeContract storage
    let memberStorage = new MemberStorage();
    let settingStorage = new SettingStorage();
    let commmitteeAddressStorage = new AddressStorage();

    // DkgContract storage
    let keyCounterStorage = new KeyCounterStorage();
    let keyStatusStorage = new KeyStatusStorage();
    let dkgAddressStorage = new AddressStorage();

    // Round1Contract storage
    let round1ReduceStorage = new ReduceStorage();
    let round1ContributionStorage = new Round1ContributionStorage();
    let publicKeyStorage = new PublicKeyStorage();
    let round1AddressStorage = new AddressStorage();

    // Round2Contract storage
    let round2ReduceStorage = new ReduceStorage();
    let round2ContributionStorage = new Round2ContributionStorage();
    let encryptionStorage = new EncryptionStorage();
    let round2AddressStorage = new AddressStorage();

    // Response storage
    let responseReduceStorage = new ReduceStorage();
    let responseContributionStorage = new ResponseContributionStorage();
    let responseAddressStorage = new AddressStorage();

    let dkgActions = {
        [ActionEnum.GENERATE_KEY]: [
            new DKGAction({
                committeeId: committeeIndex,
                keyId: Field(-1),
                mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
            }),
            new DKGAction({
                committeeId: committeeIndex,
                keyId: Field(-1),
                mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
            }),
            new DKGAction({
                committeeId: committeeIndex,
                keyId: Field(-1),
                mask: ACTION_MASK[ActionEnum.GENERATE_KEY],
            }),
        ],
        [ActionEnum.FINALIZE_ROUND_1]: [
            new DKGAction({
                committeeId: Field(0),
                keyId: Field(0),
                mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_1],
            }),
        ],
        [ActionEnum.FINALIZE_ROUND_2]: [
            new DKGAction({
                committeeId: Field(0),
                keyId: Field(0),
                mask: ACTION_MASK[ActionEnum.FINALIZE_ROUND_2],
            }),
        ],
        [ActionEnum.DEPRECATE_KEY]: [
            new DKGAction({
                committeeId: Field(0),
                keyId: Field(0),
                mask: ACTION_MASK[ActionEnum.DEPRECATE_KEY],
            }),
        ],
    };

    let round1Actions: Round1Action[] = [];
    let round2Actions: Round2Action[] = [];
    let encryptionProofs: BatchEncryptionProof[] = [];
    let responseActions: ResponseAction[] = [];
    let decryptionProofs: BatchDecryptionProof[] = [];

    const logMemUsage = () => {
        console.log(
            'Current memory usage:',
            Math.floor(process.memoryUsage().rss / 1024 / 1024),
            'MB'
        );
    };

    const compile = async (prg: any, name: string, profiling = false) => {
        if (logMemory) logMemUsage();
        console.log(`Compiling ${name}...`);
        if (profiling) DKGProfiler.start(`${name}.compile`);
        await prg.compile({ cache });
        if (profiling) DKGProfiler.stop();
        console.log('Done!');
    };

    const deploy = async (
        feePayer: Key,
        name: string,
        initArgs: [string, Field][]
    ) => {
        console.log(`Deploying ${name}...`);
        let ct = name.toLowerCase().replace('contract', '');
        let { contract, key } = contracts[ct];
        let tx = await Mina.transaction(feePayer.publicKey, () => {
            AccountUpdate.fundNewAccount(feePayer.publicKey, 1);
            contract.deploy();
            for (let i = 0; i < initArgs.length; i++) {
                (contract as any)[initArgs[i][0]].set(initArgs[i][1]);
            }
        });
        await tx.sign([feePayer.privateKey, key.privateKey]).send();
        console.log(`${name} deployed!`);
        Object.assign(contracts[ct], {
            contract: contract,
        });
    };

    const proveAndSend = async (
        tx: Mina.Transaction,
        feePayer: Key,
        contractName: string,
        methodName: string,
        profiling = true
    ) => {
        if (logMemory) logMemUsage();
        console.log(
            `Generate proof and submit tx for ${contractName}.${methodName}()...`
        );
        if (profiling) DKGProfiler.start(`${contractName}.${methodName}.prove`);
        await tx.prove();
        if (profiling) DKGProfiler.stop();
        console.log('DONE!');
        await tx.sign([feePayer.privateKey]).send();
    };

    beforeAll(async () => {
        let configJson: Config = JSON.parse(
            await fs.readFileSync('config.json', 'utf8')
        );

        // let feePayerKeysBase58: { privateKey: string; publicKey: string } =
        //   JSON.parse(await fs.readFileSync(dkgConfig.feepayerKeyPath, 'utf8'));
        feePayerKey = {
            privateKey: Local.testAccounts[0].privateKey,
            publicKey: Local.testAccounts[0].publicKey,
        };

        await Promise.all(
            Object.keys(Contract)
                .filter((item) => isNaN(Number(item)))
                .map(async (e) => {
                    let config = configJson.deployAliases[e.toLowerCase()];
                    // console.log(config);
                    let keyBase58: { privateKey: string; publicKey: string } =
                        JSON.parse(
                            await fs.readFileSync(config.keyPath, 'utf8')
                        );
                    let key = {
                        privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
                        publicKey: PublicKey.fromBase58(keyBase58.publicKey),
                    };
                    let contract = (() => {
                        switch (e.toLowerCase()) {
                            case Contract.COMMITTEE:
                                return new CommitteeContract(key.publicKey);
                            case Contract.DKG:
                                return new DkgContract(key.publicKey);
                            case Contract.ROUND1:
                                return new Round1Contract(key.publicKey);
                            case Contract.ROUND2:
                                return new Round2Contract(key.publicKey);
                            case Contract.RESPONSE:
                                return new ResponseContract(key.publicKey);
                            case Contract.REQUEST:
                                return new RequestContract(key.publicKey);
                            default:
                                return new SmartContract(key.publicKey);
                        }
                    })();
                    contracts[e.toLowerCase()] = {
                        key: key,
                        contract: contract,
                        actionStates: [Reducer.initialActionState],
                    };
                })
        );
    });

    it('Should compile all ZK programs', async () => {
        await compile(CompleteResponse, 'CompleteResponse', profiling);
        if (doProofs) {
            await compile(ResponseContract, 'ResponseContract', profiling);
        }
    });
});
