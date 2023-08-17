import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Reducer,
  PublicKey,
  Bool,
  Poseidon,
} from 'snarkyjs';
import {
  CommitteeContribution_,
  MerkleWitnessKey,
  Round1Contribution_,
} from './Committee';

let contributionAddresses: { [key: string]: PublicKey };
interface DKGParams {
  dkgAddress: PublicKey;
  round1ContributionAddress: PublicKey;
  round2ContributionAddress: PublicKey;
  decryptionContributionAddress: PublicKey;
  doProofs: boolean;
}

export async function DKG(params: DKGParams): Promise<DKG_> {
  contributionAddresses = {
    ROUND_1: params.round1ContributionAddress,
    ROUND_2: params.round2ContributionAddress,
    DECRYPTION: params.decryptionContributionAddress,
  };

  let contract = new DKG_(params.dkgAddress);
  params.doProofs = true;
  if (params.doProofs) {
    await DKG_.compile();
  }
  return contract;
}

export class DKG_ extends SmartContract {
  /**
   * Root of the merkle tree that stores all generated keys.
   */
  @state(Field) keys = State<Field>();

  /**
   * Root of the merkle tree that stores usage counters of all generated keys.
   */
  @state(Field) keyUsage = State<Field>();

  reducer = Reducer({ actionType: Field });

  /**
   * TODO
   * Calculate generated public key from committee members' contributions
   * @param keyId
   * @returns
   */
  @method verifyPublicKey(
    keyId: Field,
    publicKey: PublicKey,
    witness: MerkleWitnessKey
  ): Bool {
    let keys = this.keys.get();
    this.keys.assertEquals(keys);

    const ContributionContract: CommitteeContribution_ =
      new Round1Contribution_(contributionAddresses.ROUND_1);

    let newKeys = witness.calculateRoot(Poseidon.hash(publicKey.toFields()));

    // Add assert true public key

    this.keys.set(newKeys);

    let aggregation = ContributionContract.aggregateContributions(keyId);
    aggregation.assertTrue();

    return Bool(true);
  }

  /**
   * TODO
   * Update key usage counter
   * @param keyId
   * @returns
   */
  @method updateKeyUsage(keyId: Field) {
    return;
  }
}
