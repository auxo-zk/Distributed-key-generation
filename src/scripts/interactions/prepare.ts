import 'dotenv/config.js';
import fs from 'fs';
import {
    Cache,
    Lightnet,
    Mina,
    PrivateKey,
    PublicKey,
    fetchAccount,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { Config, JSONKey, Key, Network } from '../helper/config.js';

export async function prepare(
    cacheDir = './caches',
    networkOptions: {
        type?: Network;
        doProofs?: boolean;
    } = {
        type: Network.Local,
        doProofs: false,
    },
    accountOptions: {
        aliases: string[];
        feePayerAlias?: string;
        zkAppAliases?: string[];
    } = {
        aliases: [],
    }
) {
    // Cache folder
    let cache = Cache.FileSystem(cacheDir);

    // Network configuration
    let network;
    switch (networkOptions.type) {
        case Network.Local:
            network = Mina.LocalBlockchain({
                proofsEnabled: networkOptions.doProofs,
            });
            break;
        case Network.Lightnet:
            network = Mina.Network({
                mina: process.env.LIGHTNET_MINA as string,
                archive: process.env.LIGHTNET_ARCHIVE as string,
            });
            break;
        case Network.Testnet:
            network = Mina.Network({
                mina: process.env.BERKELEY_MINA as string,
                archive: process.env.BERKELEY_ARCHIVE as string,
            });
            break;
        case Network.Mainnet:
            throw new Error('Network is not supported!');
        default:
            throw new Error('Unknown network!');
    }
    Mina.setActiveInstance(network);

    // Accounts configuration
    let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    let accounts: { [key: string]: Key } = {},
        feePayer: Utils.FeePayer;
    const DEFAULT_ACCOUNTS = 5;

    if (accountOptions.aliases.length > 0) {
        accountOptions.aliases.map((e) => {
            if (configJson.deployAliases[e] == undefined) {
                let { keys, addresses } = Utils.randomAccounts([e]);
                Object.assign(accounts, {
                    [e]: {
                        privateKey: keys[e],
                        publicKey: addresses[e],
                    },
                });
            } else {
                let accountData: JSONKey = JSON.parse(
                    fs.readFileSync(configJson.deployAliases[e].keyPath, 'utf8')
                );
                Object.assign(accounts, {
                    [e]: {
                        privateKey: PrivateKey.fromBase58(
                            accountData.privateKey
                        ),
                        publicKey: PublicKey.fromBase58(accountData.publicKey),
                    },
                });
            }
        });
    }

    if (networkOptions.type == Network.Lightnet) {
        let acquiredAccounts = (await Lightnet.listAcquiredKeyPairs(
            {}
        )) as Key[];
        if (Object.keys(accounts).length < DEFAULT_ACCOUNTS) {
            for (let i = 0; i < DEFAULT_ACCOUNTS; i++) {
                let account = (await Lightnet.acquireKeyPair()) as Key;
                Object.assign(accounts, {
                    [acquiredAccounts.length + i]: account,
                });
            }
        }
    } else if (networkOptions.type == Network.Local) {
        accounts = {
            ...accounts,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(network as any).testAccounts
                .slice(0, DEFAULT_ACCOUNTS)
                .reduce(
                    (prev: object, curr: Key, index: number) =>
                        Object.assign(prev, { [index]: curr }),
                    {}
                ),
        };
    }

    if (
        accountOptions.feePayerAlias &&
        configJson.deployAliases[accountOptions.feePayerAlias]
    ) {
        let senderData: JSONKey = JSON.parse(
            fs.readFileSync(
                configJson.deployAliases[accountOptions.feePayerAlias].keyPath,
                'utf8'
            )
        );
        feePayer = {
            sender: {
                privateKey: PrivateKey.fromBase58(senderData.privateKey),
                publicKey: PublicKey.fromBase58(senderData.publicKey),
            },
        };
    } else {
        feePayer = {
            sender: accounts[0],
        };
    }

    if (networkOptions.type !== Network.Local)
        try {
            console.log('Fetch nonce...');
            let { account, error } = await fetchAccount({
                publicKey: feePayer.sender.publicKey,
            });
            if (error) throw error;
            if (account !== undefined) feePayer.nonce = Number(account.nonce);
        } catch (error) {
            console.error(error);
        }

    return {
        network,
        deployed: configJson.deployAliases,
        accounts,
        feePayer,
        cache,
    };
}
