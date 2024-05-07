import 'dotenv/config.js';
import { Mina, Provable, PublicKey, fetchAccount } from 'o1js';
import { fetchAccounts } from './index.js';

async function main() {
    // Network configuration
    const network = Mina.Network({
        mina: process.env.LIGHTNET_MINA as string,
        archive: process.env.LIGHTNET_ARCHIVE as string,
    });
    Mina.setActiveInstance(network);

    const ACCOUNTS = [
        PublicKey.fromBase58(
            'B62qowQQj1sn5oUWN5kZ6MYHAJNkDUo2J4UvGskY9EGEzzz7ZEkCQaM'
        ),
    ];

    Provable.log(await fetchAccounts(ACCOUNTS));
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
