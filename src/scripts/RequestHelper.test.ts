import {
    Field,
    Mina,
    AccountUpdate,
    MerkleMap,
    Cache,
    Scalar,
    Provable,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
    RequestHelperContract,
    RequestHelperInput,
    CreateReduce,
    CreateReduceProof,
    CustomScalarArray,
    RequestHelperAction,
    CreateRollup,
} from '../contracts/RequestHelper.js';

import { CustomScalar } from '@auxo-dev/auxo-libs';

const doProofs = false;

describe('RequestHelper', () => {
    const logMemUsage = () => {
        console.log(
            'Current memory usage:',
            Math.floor(process.memoryUsage().rss / 1024 / 1024),
            'MB'
        );
    };

    const EmptyMerkleMap = new MerkleMap();

    const statusMerkleMap = new MerkleMap();
    const requesterMerkleMap = new MerkleMap();

    let { keys, addresses } = randomAccounts(
        'requestHelper',
        'u1',
        'u2',
        'u3',
        'publickey'
    );

    const doProofs = true;
    const profiling = true;
    const cache = Cache.FileSystem('./caches');
    const RequestHelperProfile = getProfiler('Benchmark RequesterHelper');
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    let feePayerKey = Local.testAccounts[0].privateKey;
    let feePayer = Local.testAccounts[0].publicKey;

    let requestHelperContract: RequestHelperContract;
    let proof: CreateReduceProof;

    let length = 3;
    let randoms1: CustomScalar[] = [...Array(length).keys()].map((e) =>
        CustomScalar.fromScalar(Scalar.random())
    );
    let randoms2: CustomScalar[] = [...Array(length).keys()].map((e) =>
        CustomScalar.fromScalar(Scalar.random())
    );
    let randoms3: CustomScalar[] = [...Array(length).keys()].map((e) =>
        CustomScalar.fromScalar(Scalar.random())
    );

    let r1: CustomScalar[] = [...Array(length).keys()].map((e) =>
        CustomScalar.fromScalar(Scalar.random())
    );
    let r2: CustomScalar[] = [...Array(length).keys()].map((e) =>
        CustomScalar.fromScalar(Scalar.random())
    );
    let r3: CustomScalar[] = [...Array(length).keys()].map((e) =>
        CustomScalar.fromScalar(Scalar.random())
    );

    let input: RequestHelperInput[] = [
        new RequestHelperInput({
            committeeId: Field(1),
            keyId: Field(1),
            requetsTime: Field(1),
            committeePublicKey: addresses.publickey,
            secretVector: CustomScalarArray.from(randoms1),
            random: CustomScalarArray.from(r1),
        }),
        new RequestHelperInput({
            committeeId: Field(1),
            keyId: Field(1),
            requetsTime: Field(1),
            committeePublicKey: addresses.publickey,
            secretVector: CustomScalarArray.from(randoms2),
            random: CustomScalarArray.from(r2),
        }),
        new RequestHelperInput({
            committeeId: Field(1),
            keyId: Field(1),
            requetsTime: Field(1),
            committeePublicKey: addresses.publickey,
            secretVector: CustomScalarArray.from(randoms3),
            random: CustomScalarArray.from(r3),
        }),
    ];

    let actionsVip: RequestHelperAction[] = [];

    let userInfor;

    // beforeAll(async () => {});

    // beforeEach(() => {});

    it('compile proof and contract', async () => {
        console.time('CreateReduce.compile');
        console.log('CreateReduce.compile');
        await CreateReduce.compile();
        console.timeEnd('CreateReduce.compile');

        console.time('CreateRollup.compile');
        console.log('CreateRollup.compile');
        await CreateRollup.compile();
        console.timeEnd('CreateRollup.compile');

        if (doProofs) {
            console.time('RequestHelperContract.compile');
            console.log('RequestHelperContract.compile');
            await RequestHelperContract.compile();
            console.timeEnd('RequestHelperContract.compile');
        } else {
            RequestHelperContract.analyzeMethods();
        }
    });

    it('deploy contract RequestHelper', async () => {
        requestHelperContract = new RequestHelperContract(
            addresses.requestHelper
        );
        let tx = await Mina.transaction(feePayer, () => {
            AccountUpdate.fundNewAccount(feePayer, 4);
            requestHelperContract.deploy();
            let feePayerAccount = AccountUpdate.createSigned(feePayer);
            feePayerAccount.send({ to: addresses.u1, amount: 10 * 10 ** 9 });
            feePayerAccount.send({ to: addresses.u2, amount: 10 * 10 ** 9 });
            feePayerAccount.send({ to: addresses.u3, amount: 10 * 10 ** 9 });
        });
        await tx.prove();
        await tx.sign([feePayerKey, keys.requestHelper]).send();
    });

    it('send 3 tx', async () => {
        let tx = await Mina.transaction(feePayer, () => {
            requestHelperContract.request(input[0]);
            requestHelperContract.request(input[1]);
            requestHelperContract.request(input[2]);
        });
        await tx.prove();
        await tx.sign([feePayerKey]).send();

        let myActionArray: Field[][] = [];
        let temp: Field[] = [];
        let actions = await Mina.fetchActions(addresses.requestHelper);
        if (Array.isArray(actions)) {
            for (let action of actions) {
                for (let item of action.actions[0]) {
                    temp.push(Field(item));
                }
                myActionArray.push(temp);
            }
        }

        actionsVip = myActionArray.map((item) =>
            RequestHelperAction.fromFields(item)
        );

        Provable.log('actionVip: ', actionsVip);
    });

    xit('reduce 3 tx', async () => {
        // console.log('Create RequestHelper.firstStep...');
        // RequestHelperProfile.start('RequestHelper.firstStep');
        // proof = await CreateReduce.firstStep(
        //   requestHelperContract.actionState.get(),
        //   requestHelperContract.actionStatus.get()
        // );
        // RequestHelperProfile.stop().store();
        // expect(proof.publicOutput.initialActionState).toEqual(
        //   Reducer.initialActionState
        // );
        // for (let i = 0; i < actionsVip.length; i++) {}
        // RequestHelperProfile.start('RequestHelper.nextstep');
        // proof = await CreateReduce.firstStep(
        //   requestHelperContract.actionState.get(),
        //   requestHelperContract.actionStatus.get()
        // );
        // RequestHelperProfile.stop().store();
        // expect(proof.publicOutput.initialActionState).toEqual(
        //   Reducer.initialActionState
        // );
        // let tx = await Mina.transaction(feePayer, () => {
        //   requestHelperContract.request(input[0]);
        //   requestHelperContract.request(input[1]);
        //   requestHelperContract.request(input[2]);
        // });
        // await tx.prove();
        // await tx.sign([feePayerKey]).send();
        // let myActionArray: Field[][] = [];
        // let temp: Field[] = [];
        // let actions = await Mina.fetchActions(addresses.requestHelper);
        // if (Array.isArray(actions)) {
        //   for (let action of actions) {
        //     temp.push(Field(action.actions[0][0]));
        //   }
        //   myActionArray.push(temp);
        // }
        // action = myActionArray.map((item) => RequestHelperAction.fromFields(item));
    });
});
