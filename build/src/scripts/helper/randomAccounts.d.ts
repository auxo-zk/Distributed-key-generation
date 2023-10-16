import { PrivateKey, PublicKey } from 'o1js';
export default function randomAccounts<K extends string>(...names: [K, ...K[]]): {
    keys: Record<K, PrivateKey>;
    addresses: Record<K, PublicKey>;
};
