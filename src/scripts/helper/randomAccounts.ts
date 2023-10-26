import { PrivateKey, PublicKey } from 'o1js';

export default function randomAccounts<K extends string>(
  ...names: [K, ...K[]]
): { keys: Record<K, PrivateKey>; addresses: Record<K, PublicKey> } {
  let base58Keys = Array(names.length)
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

// function main() {
//   let { keys, addresses } = randomAccounts('dkg1', 'p1', 'p2');
//   console.log('dkg1 privatekey: ', keys.dkg1.toBase58());
//   console.log('dkg1 publickey: ', addresses.dkg1.toBase58());
//   console.log('p1 publickey: ', addresses.dkg1.toBase58());
//   console.log('p2 publickey: ', addresses.dkg1.toBase58());
// }

// if (require.main === module) {
//   main();
// }
