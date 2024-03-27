import { Field, Mina, PublicKey, Group, Scalar } from 'o1js';
import { compile, fetchZkAppState, proveAndSend } from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import { KeyStatusStorage } from '../../../storages/DkgStorage.js';
import { KeyCounterStorage } from '../../../storages/CommitteeStorage.js';
import { UpdateRequest } from '../../../contracts/Request.js';
import { RequestContract } from '../../../contracts/Request.js';
import {
    recoverEncryption,
    accumulateEncryption,
    generateEncryption,
    RequestVector,
} from '../../../libs/Requester.js';
import { Constants } from '../../../index.js';
import axios from 'axios';

async function main() {
    const { cache, feePayer } = await prepare();
    const committeeId = Field(4);
    const keyId = Field(0);

    // Compile programs
    await compile(UpdateRequest, cache);
    await compile(RequestContract, cache);
    const requestAddress =
        'B62qjujctknmNAsUHEiRhxttm6vZ9ipSd5nfWP8ijGgHHcRzMDRHDcu';
    const requestContract = new RequestContract(
        PublicKey.fromBase58(requestAddress)
    );

    const key = (
        await axios.get(
            `https://api.auxo.fund/v0/committees/${Number(
                committeeId
            )}/keys/${Number(keyId)}`
        )
    ).data;

    // Create request value
    let publicKey: Group = PublicKey.fromBase58(key.publicKey).toGroup();
    let MINA = BigInt(Constants.SECRET_UNIT); // 0.01 MINA

    /**
     * r1 = 12, 15, 18
     * r2 = 12, 14, 10
     * r3 = 4, 10, 7
     */
    let investInputs = [
        [MINA, 2n * MINA, 3n * MINA],
        [4n * MINA, 5n * MINA, 6n * MINA],
        [7n * MINA, 8n * MINA, 9n * MINA],
    ];

    let R: Group[][] = [];
    let M: Group[][] = [];

    for (let i = 0; i < investInputs.length; i++) {
        let encryptedVector = generateEncryption(publicKey, investInputs[i]);
        R.push(encryptedVector.R);
        M.push(encryptedVector.M);
    }

    let totalValue = accumulateEncryption(R, M);

    // let input: RequestInput = new RequestInput({
    //     committeeId,
    //     keyId,
    //     R: RequestVector.from(totalValue.sumR),
    // });

    // Fetch state and state
    await fetchZkAppState(requestAddress);

    // let tx = await Mina.transaction(
    //     {
    //         sender: feePayer.key.publicKey,
    //         fee: feePayer.fee,
    //         nonce: feePayer.nonce++,
    //     },
    //     () => {
    //         requestContract.request(input);
    //     }
    // );
    // await proveAndSend(tx, feePayer.key, 'RequestContract', 'request');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
