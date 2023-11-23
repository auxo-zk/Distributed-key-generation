import { Field, PrivateKey, PublicKey, SmartContract } from 'o1js';

// parse config and private key from file
export type Config = {
  deployAliases: Record<
    string,
    {
      url: string;
      keyPath: string;
      fee: string;
      feepayerKeyPath: string;
      feepayerAlias: string;
    }
  >;
};

export type Key = {
  privateKey: PrivateKey;
  publicKey: PublicKey;
};

export type Contract = {
  key: Key;
  contract: SmartContract;
  actionStates: Field[];
};
