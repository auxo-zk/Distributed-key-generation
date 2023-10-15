import { PrivateKey, PublicKey } from 'o1js';

export default function randomAccounts<K extends string>(
  ...names: [K, ...K[]]
): { keys: Record<K, PrivateKey>; addresses: Record<K, PublicKey> } {
  let base58Keys = Array(6)
    .fill('')
    .map(() => PrivateKey.random().toBase58());
  let keys = Object.fromEntries(
    names.map((name, idx) => [name, PrivateKey.fromBase58(base58Keys[idx])])
  ) as Record<K, PrivateKey>;
  let addresses = Object.fromEntries(
    names.map((name) => [name, keys[name].toPublicKey()])
  ) as Record<K, PublicKey>;
  return { keys, addresses };
}
