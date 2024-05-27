import 'dotenv/config.js';
import { Mina, Provable, PublicKey, Reducer, fetchAccount } from 'o1js';
import { fetchAccounts } from './index.js';
import { Utils } from '@auxo-dev/auxo-libs';

async function main() {
    // Network configuration
    const network = Mina.Network({
        mina: process.env.LIGHTNET_MINA as string,
        archive: process.env.LIGHTNET_ARCHIVE as string,
    });
    Mina.setActiveInstance(network);

    // const ACCOUNTS = [
    //     PublicKey.fromBase58(
    //         'B62qowQQj1sn5oUWN5kZ6MYHAJNkDUo2J4UvGskY9EGEzzz7ZEkCQaM'
    //     ),
    // ];

    // const fetchedAccount = (await fetchAccounts(ACCOUNTS))![0];
    const fetchedAccount = await fetchAccount({
        publicKey: PublicKey.fromBase58(
            'B62qrAvDSuSYgrysqENcFHRnocQ32mmtnCK4UrXBNt1i2ZjLM7KUJ5h'
        ),
    });
    Provable.log(fetchedAccount.account?.zkapp);

    const data = await Mina.fetchActions(
        PublicKey.fromBase58(
            'B62qrAvDSuSYgrysqENcFHRnocQ32mmtnCK4UrXBNt1i2ZjLM7KUJ5h'
        ),
        { fromActionState: Reducer.initialActionState }
    );
    Provable.log(data);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
