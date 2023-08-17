import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  MerkleWitness,
  Group,
  Bool,
  Reducer,
  DeployArgs,
  Permissions,
  provablePure,
} from 'snarkyjs';
import {
  CommitteeMember,
  ContributionBundle,
  DecryptionContribution,
  Round1Contribution,
  Round2Contribution,
} from './CommitteeMember';

export const THRESHOLD = {
  T: 2,
  N: 3,
};

export class MerkleWitnessKey extends MerkleWitness(20) {}
export class MerkleWitnessCommittee extends MerkleWitness(
  Math.ceil(Math.log2(THRESHOLD.N))
) {}

let committeeAddress = PublicKey.empty();
let committeeMembers = Field(0);

interface CommitteeParams {
  committeeAddress: PublicKey;
  committeeMembers: Field;
  doProofs: boolean;
}

export async function Committee(params: CommitteeParams): Promise<Committee_> {
  committeeAddress = params.committeeAddress;
  committeeMembers = params.committeeMembers;

  let contract = new Committee_(committeeAddress);
  params.doProofs = true;
  if (params.doProofs) {
    await Committee_.compile();
  }
  return contract;
}

export class Committee_ extends SmartContract {
  /**
   * Root of the merkle tree that stores all committee members.
   */
  @state(Field) committeeMembers = State<Field>();

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      editActionState: Permissions.proofOrSignature(),
      setPermissions: Permissions.proofOrSignature(),
      setVerificationKey: Permissions.proofOrSignature(),
      incrementNonce: Permissions.proofOrSignature(),
    });
    this.committeeMembers.assertEquals(committeeMembers);
  }

  /**
   * Check if the member existed in the on-chain storage root
   * @param committeeMember
   * @returns
   */
  @method isMember(committeeMember: CommitteeMember): Bool {
    // Get committee member roots
    let committeeMembers = this.committeeMembers.get();
    this.committeeMembers.assertEquals(committeeMembers);

    return committeeMember.witness
      .calculateRoot(committeeMember.getHash())
      .equals(committeeMembers);
  }
}

export abstract class CommitteeContribution_ extends SmartContract {
  /**
   * Root of the merkle tree that stores all contributions.
   */
  @state(Field) contributions = State<Field>();

  /**
   * Submit contribution for a specific stage in the key generation process
   * @param committeeMember
   * @param contribution
   * @param keyId
   * @returns
   */
  abstract submitContribution(
    committeeMember: CommitteeMember,
    contribution:
      | Round1Contribution
      | Round2Contribution
      | DecryptionContribution,
    keyId: Field
  ): void;

  /**
   * Aggregrate contribution and update state
   * @param keyId
   */
  abstract aggregateContributions(keyId: Field): Bool;

  /**
   * Check the status of a committee member's contribution in generating a key
   * @param committeeMember
   * @param keyId
   * @returns
   */
  abstract submittedContribution(
    committeeMember: CommitteeMember,
    keyId: Field
  ): Bool;
}

export class Round1Contribution_ extends CommitteeContribution_ {
  reducer = Reducer({ actionType: Round1Contribution });

  events = {
    newContribution: provablePure({
      C: [Group],
      keyId: Field,
    }),
    newContributionState: Field,
  };

  @method submitContribution(
    committeeMember: CommitteeMember,
    contribution: Round1Contribution
  ) {
    let currentSlot = this.network.globalSlotSinceGenesis.get();
    this.network.globalSlotSinceGenesis.assertBetween(
      currentSlot,
      currentSlot.add(10)
    );

    let CommitteeContract: Committee_ = new Committee_(committeeAddress);
    CommitteeContract.isMember(committeeMember).assertTrue();

    this.reducer.dispatch(contribution);

    this.emitEvent('newContribution', {
      C: contribution.C,
      keyId: contribution.keyId,
    });
  }

  @method aggregateContributions(keyId: Field): Bool {
    let contributions = this.contributions.get();
    this.contributions.assertEquals(contributions);

    // FIXME Action[0]
    let actions = this.reducer
      .getActions({ fromActionState: contributions })
      .filter((action) => action[0].keyId.equals(keyId));

    Field.from(actions.length).assertEquals(Field.from(THRESHOLD.N));

    let { state: newContributions } = this.reducer.reduce(
      actions,
      Field,
      (state: Field, action: Round1Contribution) => {
        let bundleRoot = action.witnessCommittee.calculateRoot(
          action.getHash()
        );
        bundleRoot.assertEquals(action.bundleRoot);
        return action.witnessKey.calculateRoot(
          new ContributionBundle({
            root: action.bundleRoot,
            witness: action.witnessKey,
          }).getHash()
        );
      },
      { state: Field(0), actionState: contributions }
    );

    this.contributions.set(newContributions);

    this.emitEvent('newContributionState', newContributions);
    return Bool(true);
  }

  // TODO
  @method submittedContribution(
    committeeMember: CommitteeMember,
    keyId: Field
  ): Bool {
    return Bool(false);
  }
}

export class Round2Contribution_ extends CommitteeContribution_ {
  reducer = Reducer({ actionType: Round2Contribution });

  events = {
    newContribution: provablePure({
      encF: [Field],
      keyId: Field,
    }),
    newContributionState: Field,
  };

  @method submitContribution(
    committeeMember: CommitteeMember,
    contribution: Round2Contribution
  ) {
    let currentSlot = this.network.globalSlotSinceGenesis.get();
    this.network.globalSlotSinceGenesis.assertBetween(
      currentSlot,
      currentSlot.add(10)
    );

    let CommitteeContract: Committee_ = new Committee_(committeeAddress);
    CommitteeContract.isMember(committeeMember).assertTrue();

    this.reducer.dispatch(contribution);

    this.emitEvent('newContribution', {
      encF: contribution.encF,
      keyId: contribution.keyId,
    });
  }

  @method aggregateContributions(keyId: Field): Bool {
    let contributions = this.contributions.get();
    this.contributions.assertEquals(contributions);

    let { state: newContributions } = this.reducer.reduce(
      this.reducer.getActions({ fromActionState: contributions }),
      Field,
      (state: Field, action: Round2Contribution) => {
        let bundleRoot = action.witnessCommittee.calculateRoot(
          action.getHash()
        );
        bundleRoot.assertEquals(action.bundleRoot);
        return action.witnessKey.calculateRoot(
          new ContributionBundle({
            root: action.bundleRoot,
            witness: action.witnessKey,
          }).getHash()
        );
      },
      { state: contributions, actionState: contributions }
    );

    this.contributions.set(newContributions);

    this.emitEvent('newContributionState', newContributions);
    return Bool(true);
  }

  // TODO
  @method submittedContribution(
    committeeMember: CommitteeMember,
    keyId: Field
  ): Bool {
    return Bool(false);
  }
}

// TODO
// export class DecryptContribution_ extends CommitteeContribution_ {
//   reducer = Reducer({ actionType: DecryptionContribution });

//   ...
// }
