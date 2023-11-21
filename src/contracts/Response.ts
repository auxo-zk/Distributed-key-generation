import {
  Field,
  Poseidon,
  Provable,
  Reducer,
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
import { RequestVector } from './RequestHelper.js';
import { BatchDecryptionProof } from './Encryption.js';
import { Round1Contract } from './Round1.js';
import { Round2Contract } from './Round2.js';
import {
  COMMITTEE_MAX_SIZE,
  INSTANCE_LIMITS,
  REQUEST_MAX_SIZE,
  ZkAppEnum,
} from '../constants.js';
import { EMPTY_REDUCE_MT, ReduceWitness, ZkAppRef } from './SharedStorage.js';

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
  publicKeyRoot: Field,
  encryptionRoot: Field,
  reduceStateRoot: Field,
  newContributionRoot: Field,
  requestId: Field,
  D: RequestVector,
  counter: Field,
}) {}

export const CompleteResponse = ZkProgram({
  name: 'complete-response',
  publicInput: ResponseInput,
  publicOutput: ResponseOutput,
  methods: {
    firstStep: {
      privateInputs: [
        Field,
        Field,
        Field,
        Field,
        Field,
        Field,
        Field,
        Level1Witness,
      ],
      method(
        input: ResponseInput,
        T: Field,
        N: Field,
        initialContributionRoot: Field,
        publicKeyRoot: Field,
        encryptionRoot: Field,
        reduceStateRoot: Field,
        requestId: Field,
        contributionWitness: Level1Witness
      ) {
        let contributionRoot = contributionWitness.calculateRoot(Field(0));
        let contributionIndex = contributionWitness.calculateIndex();
        contributionRoot.assertEquals(initialContributionRoot);
        contributionIndex.assertEquals(requestId);

        contributionRoot = contributionWitness.calculateRoot(
          EMPTY_LEVEL_2_TREE().getRoot()
        );

        return new ResponseOutput({
          T: T,
          N: N,
          initialContributionRoot: initialContributionRoot,
          publicKeyRoot: publicKeyRoot,
          encryptionRoot: encryptionRoot,
          reduceStateRoot: reduceStateRoot,
          newContributionRoot: contributionRoot,
          requestId: requestId,
          D: new RequestVector(),
          counter: Field(0),
        });
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<ResponseInput, ResponseOutput>,
        BatchDecryptionProof,
        DKGWitness,
        DKGWitness,
        DKGWitness,
        ReduceWitness,
      ],
      method(
        input: ResponseInput,
        earlierProof: SelfProof<ResponseInput, ResponseOutput>,
        decryptionProof: BatchDecryptionProof,
        contributionWitness: DKGWitness,
        publicKeyWitness: DKGWitness,
        encryptionWitness: DKGWitness,
        reduceWitness: ReduceWitness
      ) {
        // Verify earlier proof
        earlierProof.verify();
        decryptionProof.publicInput.c.length.assertEquals(
          earlierProof.publicOutput.N
        );
        decryptionProof.publicInput.U.length.assertEquals(
          earlierProof.publicOutput.N
        );

        // Calculate key index in MT
        let keyIndex = Field.from(BigInt(INSTANCE_LIMITS.KEY))
          .mul(input.action.committeeId)
          .add(input.action.keyId);

        // Check if the actions have the same requestId
        input.action.requestId.assertEquals(
          earlierProof.publicOutput.requestId
        );

        // Check if decryption is correct
        decryptionProof.verify();
        decryptionProof.publicInput.memberId.assertEquals(
          input.action.memberId
        );
        let encryptionHashChain = Field(0);
        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          encryptionHashChain = Provable.if(
            Field(i).greaterThanOrEqual(earlierProof.publicOutput.N),
            Field(0),
            Poseidon.hash(
              [
                encryptionHashChain,
                decryptionProof.publicInput.c.get(Field(i)).toFields(),
                decryptionProof.publicInput.U.get(Field(i)).toFields(),
              ].flat()
            )
          );
        }

        // Check if encryption hash chain existed
        encryptionWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let encryptionRoot = encryptionWitness.level1.calculateRoot(
          encryptionWitness.level2.calculateRoot(encryptionHashChain)
        );
        let encryptionIndex = encryptionWitness.level1.calculateIndex();
        encryptionRoot.assertEquals(earlierProof.publicOutput.encryptionRoot);
        encryptionIndex.assertEquals(input.action.requestId);

        // Check if this committee member has contributed yet
        contributionWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let contributionRoot = contributionWitness.level1.calculateRoot(
          contributionWitness.level2.calculateRoot(Field(0))
        );
        let contributionIndex = contributionWitness.level1.calculateIndex();
        contributionRoot.assertEquals(
          earlierProof.publicOutput.newContributionRoot
        );
        contributionIndex.assertEquals(input.action.requestId);

        // Compute new contribution root
        contributionRoot = contributionWitness.level1.calculateRoot(
          contributionWitness.level2.calculateRoot(
            input.action.contribution.hash()
          )
        );

        // Check if this member's public key has been registered
        publicKeyWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let publicKeyRoot = publicKeyWitness.level1.calculateRoot(
          publicKeyWitness.level2.calculateRoot(
            Poseidon.hash(decryptionProof.publicInput.publicKey.toFields())
          )
        );
        let publicKeyIndex = publicKeyWitness.level1.calculateIndex();
        publicKeyRoot.assertEquals(earlierProof.publicOutput.publicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Calculate new D value
        let D = earlierProof.publicOutput.D;
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
          D.set(
            Field(i),
            D.get(Field(i)).add(input.action.contribution.D.get(Field(i)))
          );
        }

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(input.previousActionState, [
          Action.toFields(input.action),
        ]);

        // Current value of the action hash should be 1
        let [root, key] = reduceWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        root.assertEquals(earlierProof.publicOutput.reduceStateRoot);
        key.assertEquals(actionState);

        return new ResponseOutput({
          T: earlierProof.publicOutput.T,
          N: earlierProof.publicOutput.N,
          initialContributionRoot:
            earlierProof.publicOutput.initialContributionRoot,
          publicKeyRoot: earlierProof.publicOutput.publicKeyRoot,
          encryptionRoot: earlierProof.publicOutput.encryptionRoot,
          reduceStateRoot: earlierProof.publicOutput.reduceStateRoot,
          newContributionRoot: contributionRoot,
          requestId: input.action.requestId,
          D: D,
          counter: earlierProof.publicOutput.counter.add(Field(1)),
        });
      },
    },
  },
});

export class CompleteResponseProof extends ZkProgram.Proof(CompleteResponse) {}

const DefaultRoot = EMPTY_LEVEL_1_TREE().getRoot();
const DefaultReduceRoot = EMPTY_REDUCE_MT().getRoot();
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
    this.zkApps.set(DefaultRoot);
    this.reduceState.set(DefaultReduceRoot);
    this.contributions.set(DefaultRoot);
  }

  @method
  verifyZkApp(zkApp: ZkAppRef, index: Field) {
    let zkApps = this.zkApps.getAndAssertEquals();
    let root = zkApp.witness.calculateRoot(
      Poseidon.hash(zkApp.address.toFields())
    );
    let id = zkApp.witness.calculateIndex();
    root.assertEquals(zkApps);
    id.assertEquals(index);
  }

  @method
  contribute(
    action: Action,
    committee: ZkAppRef,
    memberWitness: CommitteeFullWitness,
    dkg: ZkAppRef,
    keyStatusWitness: Level1Witness
    // request: ZkAppRef,
    // requestStatusWitness: MerkleMapWitness
  ) {
    // Verify sender's index
    this.verifyZkApp(committee, Field(ZkAppEnum.COMMITTEE));
    const committeeContract = new CommitteeContract(committee.address);
    let memberId = committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender,
        commiteeId: action.committeeId,
        memberWitness: memberWitness,
      })
    );
    memberId.assertEquals(action.memberId);

    // Verify key status
    this.verifyZkApp(dkg, Field(ZkAppEnum.DKG));
    const dkgContract = new DKGContract(dkg.address);
    dkgContract.verifyKeyStatus(
      Field.from(BigInt(INSTANCE_LIMITS.KEY))
        .mul(action.committeeId)
        .add(action.keyId),
      Field(KeyStatus.ACTIVE),
      keyStatusWitness
    );

    // TODO - Verify request status
    // this.verifyZkApp(request, ZK_APP.REQUEST);

    // Dispatch action
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

  @method
  complete(
    proof: CompleteResponseProof,
    round1: ZkAppRef,
    round2: ZkAppRef,
    committee: ZkAppRef,
    settingWitness: CommitteeLevel1Witness
    // request: ZkAppRef
  ) {
    // Get current state values
    let contributions = this.contributions.getAndAssertEquals();
    let reduceState = this.reduceState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicOutput.initialContributionRoot.assertEquals(contributions);
    proof.publicOutput.reduceStateRoot.assertEquals(reduceState);
    proof.publicOutput.counter.assertEquals(proof.publicOutput.T);

    // Verify public keys
    this.verifyZkApp(round1, Field(ZkAppEnum.ROUND1));
    const round1Contract = new Round1Contract(round1.address);
    let publicKeyRoot = round1Contract.publicKeys.getAndAssertEquals();
    publicKeyRoot.assertEquals(proof.publicOutput.publicKeyRoot);

    // Verify encryption hashes
    this.verifyZkApp(round2, Field(ZkAppEnum.ROUND2));
    const round2Contract = new Round2Contract(round2.address);
    let encryptionRoot = round2Contract.encryptions.getAndAssertEquals();
    encryptionRoot.assertEquals(proof.publicOutput.encryptionRoot);

    // Verify committee config
    this.verifyZkApp(committee, Field(ZkAppEnum.COMMITTEE));
    const committeeContract = new CommitteeContract(committee.address);
    committeeContract.checkConfig(
      new CheckConfigInput({
        N: proof.publicOutput.N,
        T: proof.publicOutput.T,
        commiteeId: proof.publicInput.action.committeeId,
        settingWitness: settingWitness,
      })
    );

    // Set new states
    this.contributions.set(proof.publicOutput.newContributionRoot);

    // TODO - Dispatch action in Request contract
    // this.verifyZkApp(request, ZK_APP.REQUEST);
    // const dkgContract = new DKGContract(dkg.address);
  }
}
