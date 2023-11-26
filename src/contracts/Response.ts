import {
  Bool,
  Field,
  Group,
  Poseidon,
  Provable,
  Reducer,
  Scalar,
  SelfProof,
  SmartContract,
  State,
  Struct,
  ZkProgram,
  method,
  state,
} from 'o1js';
import { ResponseContribution } from '../libs/Committee.js';
import { updateOutOfSnark } from '../libs/utils.js';
import {
  FullMTWitness as CommitteeFullWitness,
  Level1Witness as CommitteeLevel1Witness,
} from './CommitteeStorage.js';
import {
  FullMTWitness as DKGWitness,
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE,
  Level1Witness,
} from './DKGStorage.js';
import {
  CheckConfigInput,
  CheckMemberInput,
  CommitteeContract,
} from './Committee.js';
import { DKGContract, KeyStatus } from './DKG.js';
import { RequestContract, RequestVector, ResolveInput } from './Request.js';
import { BatchDecryptionProof, PlainArray } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { Round2Contract } from './Round2.js';
import {
  COMMITTEE_MAX_SIZE,
  INSTANCE_LIMITS,
  REQUEST_MAX_SIZE,
  ZkAppEnum,
} from '../constants.js';
import {
  EMPTY_ADDRESS_MT,
  EMPTY_REDUCE_MT,
  ReduceWitness,
  ZkAppRef,
} from './SharedStorage.js';
import { DArray, RArray } from '../libs/Requestor.js';

export enum EventEnum {
  CONTRIBUTIONS_REDUCED = 'contributions-reduced',
}

export enum ActionStatus {
  NOT_EXISTED,
  REDUCED,
}

export class Action extends Struct({
  committeeId: Field,
  keyId: Field,
  memberId: Field,
  requestId: Field,
  contribution: ResponseContribution,
}) {
  static empty(): Action {
    return new Action({
      committeeId: Field(0),
      keyId: Field(0),
      memberId: Field(0),
      requestId: Field(0),
      contribution: ResponseContribution.empty(),
    });
  }
}

export class ReduceOutput extends Struct({
  initialReduceState: Field,
  newActionState: Field,
  newReduceState: Field,
}) {}

export const ReduceResponse = ZkProgram({
  name: 'reduce-response-contribution',
  publicInput: Action,
  publicOutput: ReduceOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field],
      method(
        input: Action,
        initialReduceState: Field,
        initialActionState: Field
      ) {
        return new ReduceOutput({
          initialReduceState: initialReduceState,
          newActionState: initialActionState,
          newReduceState: initialReduceState,
        });
      },
    },
    nextStep: {
      privateInputs: [SelfProof<Action, ReduceOutput>, ReduceWitness],
      method(
        input: Action,
        earlierProof: SelfProof<Action, ReduceOutput>,
        reduceWitness: ReduceWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [Action.toFields(input)]
        );

        // Check the non-existence of the action
        let [root, key] = reduceWitness.computeRootAndKey(
          Field(ActionStatus.NOT_EXISTED)
        );
        root.assertEquals(earlierProof.publicOutput.newReduceState);
        key.assertEquals(actionState);

        // Check the new tree contains the reduced action
        [root] = reduceWitness.computeRootAndKey(Field(ActionStatus.REDUCED));

        return new ReduceOutput({
          initialReduceState: earlierProof.publicOutput.initialReduceState,
          newActionState: actionState,
          newReduceState: root,
        });
      },
    },
  },
});

export class ReduceResponseProof extends ZkProgram.Proof(ReduceResponse) {}

export class ResponseInput extends Struct({
  previousActionState: Field,
  action: Action,
}) {}

export class ResponseOutput extends Struct({
  T: Field,
  N: Field,
  initialContributionRoot: Field,
  reduceStateRoot: Field,
  newContributionRoot: Field,
  requestId: Field,
  D: RequestVector,
  counter: Field,
}) {}

/**
 * First step:
 * - Verify there is no recorded contribution for the request
 * - Record an empty level 2 tree
 *
 * Next steps:
 * - Verify earlier proof
 * - Verify contributions using the same requestId
 * - Verify the member's contribution witness
 * - Compute new contribution root
 * - Compute D values
 * - Verify the action has been reduced
 */
export const CompleteResponse = ZkProgram({
  name: 'complete-response',
  publicInput: ResponseInput,
  publicOutput: ResponseOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field, Field, Field, Field, Level1Witness],
      method(
        input: ResponseInput,
        T: Field,
        N: Field,
        initialContributionRoot: Field,
        reduceStateRoot: Field,
        requestId: Field,
        contributionWitness: Level1Witness
      ) {
        // Verify there is no recorded contribution for the request
        initialContributionRoot.assertEquals(
          contributionWitness.calculateRoot(Field(0))
        );
        requestId.assertEquals(contributionWitness.calculateIndex());

        // Record an empty level 2 tree
        let newContributionRoot = contributionWitness.calculateRoot(
          EMPTY_LEVEL_2_TREE().getRoot()
        );

        return new ResponseOutput({
          T: T,
          N: N,
          initialContributionRoot: initialContributionRoot,
          reduceStateRoot: reduceStateRoot,
          newContributionRoot: newContributionRoot,
          requestId: requestId,
          D: new RequestVector(),
          counter: Field(0),
        });
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<ResponseInput, ResponseOutput>,
        DKGWitness,
        ReduceWitness,
      ],
      method(
        input: ResponseInput,
        earlierProof: SelfProof<ResponseInput, ResponseOutput>,
        contributionWitness: DKGWitness,
        reduceWitness: ReduceWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Verify contributions using the same requestId
        input.action.requestId.assertEquals(
          earlierProof.publicOutput.requestId
        );

        // Verify the member's contribution witness
        earlierProof.publicOutput.newContributionRoot.assertEquals(
          contributionWitness.level1.calculateRoot(
            contributionWitness.level2.calculateRoot(Field(0))
          )
        );
        input.action.requestId.assertEquals(
          contributionWitness.level1.calculateIndex()
        );
        input.action.memberId.assertEquals(
          contributionWitness.level2.calculateIndex()
        );

        // Compute new contribution root
        let newContributionRoot = contributionWitness.level1.calculateRoot(
          contributionWitness.level2.calculateRoot(
            input.action.contribution.hash()
          )
        );

        // Compute D values
        let D = earlierProof.publicOutput.D;
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
          D.set(
            Field(i),
            D.get(Field(i)).add(input.action.contribution.D.get(Field(i)))
          );
        }

        // Verify the action has been reduced
        let actionState = updateOutOfSnark(input.previousActionState, [
          Action.toFields(input.action),
        ]);
        let [reduceRoot, reduceIndex] = reduceWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        reduceRoot.assertEquals(earlierProof.publicOutput.reduceStateRoot);
        reduceIndex.assertEquals(actionState);

        return new ResponseOutput({
          T: earlierProof.publicOutput.T,
          N: earlierProof.publicOutput.N,
          initialContributionRoot:
            earlierProof.publicOutput.initialContributionRoot,
          reduceStateRoot: earlierProof.publicOutput.reduceStateRoot,
          newContributionRoot: newContributionRoot,
          requestId: input.action.requestId,
          D: D,
          counter: earlierProof.publicOutput.counter.add(Field(1)),
        });
      },
    },
  },
});

export class CompleteResponseProof extends ZkProgram.Proof(CompleteResponse) {}

export class ResponseContract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.CONTRIBUTIONS_REDUCED]: Field,
  };

  @state(Field) zkApps = State<Field>();
  @state(Field) reduceState = State<Field>();
  @state(Field) contributions = State<Field>();

  init() {
    super.init();
    this.zkApps.set(EMPTY_ADDRESS_MT().getRoot());
    this.reduceState.set(EMPTY_REDUCE_MT().getRoot());
    this.contributions.set(EMPTY_LEVEL_1_TREE().getRoot());
  }

  /**
   * Submit response contribution for key generation
   * - Verify zkApp references
   * - Verify decryption proof
   * - Verify committee member
   * - Verify round 1 public key (C0)
   * - Verify round 2 encryptions (hashes)
   * - Compute response
   * - Create & dispatch action to DKGContract
   * - TODO - Distribute earned fee
   * @param committeeId
   * @param keyId
   * @param requestId
   * @param decryptionProof
   * @param R
   * @param ski
   * @param committee
   * @param round1
   * @param round2
   * @param memberWitness
   * @param publicKeyWitness
   * @param encryptionWitness
   */
  @method
  contribute(
    committeeId: Field,
    keyId: Field,
    requestId: Field,
    decryptionProof: BatchDecryptionProof,
    R: RArray,
    ski: Scalar,
    committee: ZkAppRef,
    round1: ZkAppRef,
    round2: ZkAppRef,
    memberWitness: CommitteeFullWitness,
    publicKeyWitness: DKGWitness,
    encryptionWitness: DKGWitness
  ) {
    // Verify zkApp references
    let zkApps = this.zkApps.getAndAssertEquals();

    // CommitteeContract
    zkApps.assertEquals(
      committee.witness.calculateRoot(
        Poseidon.hash(committee.address.toFields())
      )
    );
    Field(ZkAppEnum.COMMITTEE).assertEquals(committee.witness.calculateIndex());

    // Round1Contract
    zkApps.assertEquals(
      round1.witness.calculateRoot(Poseidon.hash(round1.address.toFields()))
    );

    // Round2Contract
    zkApps.assertEquals(
      round2.witness.calculateRoot(Poseidon.hash(round2.address.toFields()))
    );
    Field(ZkAppEnum.ROUND2).assertEquals(round2.witness.calculateIndex());

    const committeeContract = new CommitteeContract(committee.address);
    const round1Contract = new Round1Contract(round1.address);
    const round2Contract = new Round2Contract(round2.address);

    // Verify decryption proof
    decryptionProof.verify();

    // Verify committee member - FIXME check if using this.sender is secure
    let memberId = committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender,
        commiteeId: committeeId,
        memberWitness: memberWitness,
      })
    );
    memberId.assertEquals(decryptionProof.publicInput.memberId);

    // Verify round 1 public key (C0)
    let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
      .mul(committeeId)
      .add(keyId);
    round1Contract.publicKeys
      .getAndAssertEquals()
      .assertEquals(
        publicKeyWitness.level1.calculateRoot(
          publicKeyWitness.level2.calculateRoot(
            Poseidon.hash(decryptionProof.publicInput.publicKey.toFields())
          )
        )
      );
    keyIndex.assertEquals(publicKeyWitness.level1.calculateIndex());
    memberId.assertEquals(publicKeyWitness.level2.calculateIndex());

    // Verify round 2 encryptions (hashes)
    let encryptionHashChain = Field(0);
    for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
      encryptionHashChain = Provable.if(
        Field(i).greaterThanOrEqual(decryptionProof.publicInput.c.length),
        encryptionHashChain,
        Poseidon.hash(
          [
            encryptionHashChain,
            decryptionProof.publicInput.c.get(Field(i)).toFields(),
            decryptionProof.publicInput.U.get(Field(i)).toFields(),
          ].flat()
        )
      );
    }
    round2Contract.encryptions
      .getAndAssertEquals()
      .assertEquals(
        encryptionWitness.level1.calculateRoot(
          encryptionWitness.level2.calculateRoot(encryptionHashChain)
        )
      );
    keyId.assertEquals(encryptionWitness.level1.calculateIndex());
    memberId.assertEquals(encryptionWitness.level2.calculateIndex());

    // Compute response
    let D = Provable.witness(DArray, () => {
      return new DArray(R.values.slice(0, Number(R.length)));
    });
    for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
      let Ri = R.get(Field(i));
      Group.generator.scale(ski).equals(decryptionProof.publicOutput);
      D.set(
        Field(i),
        Provable.if(
          Field(i).greaterThanOrEqual(R.length),
          Ri,
          Ri.add(Group.generator).scale(ski).sub(Group.generator.scale(ski))
        )
      );
    }

    // Create & dispatch action to DKGContract
    let action = new Action({
      committeeId: committeeId,
      keyId: keyId,
      memberId: memberId,
      requestId: requestId,
      contribution: new ResponseContribution({
        D: D,
      }),
    });
    this.reducer.dispatch(action);
  }

  @method
  reduce(proof: ReduceResponseProof) {
    // Get current state values
    let reduceState = this.reduceState.getAndAssertEquals();
    let actionState = this.account.actionState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicOutput.initialReduceState.assertEquals(reduceState);
    proof.publicOutput.newActionState.assertEquals(actionState);

    // Set new states
    this.reduceState.set(proof.publicOutput.newReduceState);

    // Emit events
    this.emitEvent(EventEnum.CONTRIBUTIONS_REDUCED, actionState);
  }

  /**
   * Complete response with T members' contribution
   * - Get current state values
   * - Verify zkApp references
   * - Verify response proof
   * - Verify committee config
   * - Verify key status
   * - Set new states
   * - [TODO] Create & dispatch action to RequestContract
   *
   * @param proof
   * @param committee
   * @param dkg
   * @param settingWitness
   * @param keyStatusWitness
   */
  @method
  complete(
    proof: CompleteResponseProof,
    committee: ZkAppRef,
    dkg: ZkAppRef,
    // request: ZkAppRef,
    settingWitness: CommitteeLevel1Witness,
    keyStatusWitness: Level1Witness
  ) {
    // Get current state values
    let zkApps = this.zkApps.getAndAssertEquals();
    let contributions = this.contributions.getAndAssertEquals();
    let reduceState = this.reduceState.getAndAssertEquals();

    // Verify zkApp references
    // CommitteeContract
    zkApps.assertEquals(
      committee.witness.calculateRoot(
        Poseidon.hash(committee.address.toFields())
      )
    );
    Field(ZkAppEnum.COMMITTEE).assertEquals(committee.witness.calculateIndex());

    // DKGContract
    zkApps.assertEquals(
      dkg.witness.calculateRoot(Poseidon.hash(dkg.address.toFields()))
    );
    Field(ZkAppEnum.DKG).assertEquals(dkg.witness.calculateIndex());

    // RequestContract
    // zkApps.assertEquals(
    //   request.witness.calculateRoot(Poseidon.hash(request.address.toFields()))
    // );
    // Field(ZkAppEnum.REQUEST).assertEquals(request.witness.calculateIndex());

    const committeeContract = new CommitteeContract(committee.address);
    const dkgContract = new DKGContract(dkg.address);

    // Verify response proof
    proof.verify();
    proof.publicOutput.initialContributionRoot.assertEquals(contributions);
    proof.publicOutput.reduceStateRoot.assertEquals(reduceState);
    proof.publicOutput.counter.assertEquals(proof.publicOutput.T);

    // Verify committee config
    committeeContract.checkConfig(
      new CheckConfigInput({
        N: proof.publicOutput.N,
        T: proof.publicOutput.T,
        commiteeId: proof.publicInput.action.committeeId,
        settingWitness: settingWitness,
      })
    );

    // Verify key status
    let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
      .mul(proof.publicInput.action.committeeId)
      .add(proof.publicInput.action.keyId);
    dkgContract.keyStatus
      .getAndAssertEquals()
      .assertEquals(keyStatusWitness.calculateRoot(Field(KeyStatus.ACTIVE)));
    keyIndex.assertEquals(keyStatusWitness.calculateIndex());

    // Set new states
    this.contributions.set(proof.publicOutput.newContributionRoot);

    // Create & dispatch action to RequestContract
    // const requestContract = new RequestContract(request.address);
    // requestContract.resolveRequest(
    //   new ResolveInput({
    //     requestId: proof.publicOutput.requestId,
    //     D: proof.publicOutput.D,
    //   })
    // );
  }

  // TODO - Distribute earned fee
}
