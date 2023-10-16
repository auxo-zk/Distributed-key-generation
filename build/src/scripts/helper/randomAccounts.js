import { PrivateKey } from 'o1js';
export default function randomAccounts(...names) {
    let base58Keys = Array(names.length)
        .fill('')
        .map(() => PrivateKey.random().toBase58());
    let keys = Object.fromEntries(names.map((name, idx) => [name, PrivateKey.fromBase58(base58Keys[idx])]));
    let addresses = Object.fromEntries(names.map((name) => [name, keys[name].toPublicKey()]));
    return { keys, addresses };
}
//# sourceMappingURL=randomAccounts.js.map