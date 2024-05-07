import { PublicKey, fetchAccount } from 'o1js';
import { Network } from './config.js';

const DEFAULT_DURATION = 6 * 60 * 1000; // 6m

export async function wait(duration = DEFAULT_DURATION): Promise<void> {
    console.log(`Wait for ${duration / 1000}s ...`);
    return new Promise((resolve) => setTimeout(resolve, duration));
}

export async function waitUntil(timestamp: number): Promise<void> {
    console.log(`Wait until timestamp ${timestamp} pass...`);
    const buffer = 50; // 50ms
    return new Promise((resolve) =>
        setTimeout(resolve, buffer + timestamp - Date.now())
    );
}

export async function fetchAccounts(
    accounts: PublicKey[],
    networkType = Network.Lightnet
) {
    let graphqlEndpoint: string;
    switch (networkType) {
        case Network.Local:
            return;
        case Network.Lightnet:
            graphqlEndpoint = process.env.LIGHTNET_MINA as string;
            break;
        case Network.Testnet:
            graphqlEndpoint = process.env.BERKELEY_MINA as string;
            break;
        case Network.Mainnet:
            graphqlEndpoint = process.env.MAINNET_MINA as string;
            break;
        default:
            throw new Error('Unknown network!');
    }
    return await Promise.all(
        accounts.map((e) => fetchAccount({ publicKey: e }, graphqlEndpoint))
    );
}
