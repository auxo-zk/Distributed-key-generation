import 'dotenv/config.js';
import { Mina, Provable, PublicKey, fetchAccount } from 'o1js';

async function main() {
    // Network configuration
    const network = Mina.Network({
        mina: process.env.BERKELEY_MINA as string,
        archive: process.env.BERKELEY_ARCHIVE as string,
    });
    Mina.setActiveInstance(network);

    const ACCOUNTS = [
        'B62qkvcuN4Fy6xgGP1ypxGjjPhbdQZm6QDW9kcRNqvinAKGoFNcUxTi',
        'B62qjDLMhAw54JMrJLNZsrBRcoSjbQHQwn4ryceizpsQi8rwHQLA6R1',
    ];

    await Promise.all(
        ACCOUNTS.map(async (acc) => {
            console.log(`Fetching ${acc}...`);
            try {
                let fetched = await fetchAccount({
                    publicKey: PublicKey.fromBase58(acc),
                });
                Provable.log(fetched);
                if (fetched.account?.zkapp)
                    Provable.log(fetched.account?.zkapp);
            } catch (error) {
                console.error(error);
            }
        })
    );
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
