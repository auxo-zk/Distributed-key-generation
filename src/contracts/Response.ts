import { Bool, Field, Group, MerkleMapWitness, Poseidon, Provable, Reducer, SelfProof, SmartContract, State, Struct, ZkProgram, method, state } from "o1js";
import { FieldDynamicArray } from "@auxo-dev/auxo-libs";
import { ResponseContribution, UArray, cArray } from "../libs/Committee.js";
import { ZkAppRef } from '../libs/ZkAppRef.js';
import { updateOutOfSnark } from "../libs/utils.js";
import { FullMTWitness as CommitteeWitness } from "./CommitteeStorage.js";
import { FullMTWitness as DKGWitness } from "./DKGStorage.js";
import { CheckConfigInput, CheckMemberInput, CommitteeContract } from "./Committee.js";
import { DKGContract, KeyStatus } from "./DKG.js";
import { RequestVector } from "./RequestHelper.js";
import { BatchDecryptionProof } from "./Encryption.js";
import { Round1Contract } from "./Round1.js";
import { Round2Contract } from "./Round2.js";
import { COMMITTEE_MAX_SIZE, REQUEST_MAX_SIZE, ZK_APP } from "../constants.js";

export enum EventEnum {
  CONTRIBUTIONS_REDUCED,
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
}) { }

export class ReduceInput extends Struct({
  initialReduceState: Field,
  action: Action,
}) { }

export class ReduceOutput extends Struct({
  newActionState: Field,
  newReduceState: Field,
}) { }

export const ReduceResponse = ZkProgram({
  name: 'reduce-response-contribution',
  publicInput: ReduceInput,
  publicOutput: ReduceOutput,
  methods: {
    firstStep: {
      privateInputs: [Field],
      method(input: ReduceInput, initialActionState: Field) {
        return new ReduceOutput({
          newActionState: initialActionState,
          newReduceState: input.initialReduceState,
        })
      }
    },
    nextStep: {
      privateInputs: [
        SelfProof<ReduceInput, ReduceOutput>,
        MerkleMapWitness
      ],
      method(
        input: ReduceInput,
        earlierProof: SelfProof<ReduceInput, ReduceOutput>,
        reduceWitness: MerkleMapWitness,
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check consistency of the initial values
        input.initialReduceState.assertEquals(
          earlierProof.publicInput.initialReduceState
        );

        // Calculate corresponding action state
        let actionState = updateOutOfSnark(
          earlierProof.publicOutput.newActionState,
          [Action.toFields(input.action)]
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
          newActionState: actionState,
          newReduceState: root,
        });
      }
    }
  }
});

export class ReduceResponseProof extends ZkProgram.Proof(ReduceResponse) { }

export class ResponseInput extends Struct({
  T: Field,
  N: Field,
  initialContributionRoot: Field,
  publicKey: Group,
  publicKeyRoot: Field,
  encryptionRoot: Field,
  c: cArray,
  U: UArray,
  reduceStateRoot: Field,
  previousActionState: Field,
  action: Action,
}) { }

export class ResponseOutput extends Struct({
  newContributionRoot: Field,
  requestId: Field,
  D: RequestVector,
  counter: Field,
}) { }

export const CompleteResponse = ZkProgram({
  name: 'complete-response',
  publicInput: ResponseInput,
  publicOutput: ResponseOutput,
  methods: {
    firstStep: {
      privateInputs: [Field],
      method(input: ResponseInput, requestId: Field) {
        return new ResponseOutput({
          newContributionRoot: input.initialContributionRoot,
          requestId: requestId,
          D: new RequestVector(),
          counter: Field(0),
        })
      }
    },
    nextStep: {
      privateInputs: [
        SelfProof<ResponseInput, ResponseOutput>,
        BatchDecryptionProof,
        DKGWitness,
        DKGWitness,
        DKGWitness,
        MerkleMapWitness,
      ],
      method(
        input: ResponseInput,
        earlierProof: SelfProof<ResponseInput, ResponseOutput>,
        decryptionProof: BatchDecryptionProof,
        contributionWitness: DKGWitness,
        publicKeyWitness: DKGWitness,
        encryptionWitness: DKGWitness,
        reduceWitness: MerkleMapWitness,
      ) {
        // Verify earlier proof
        earlierProof.verify();

        // Check consistency of the initial values
        input.T.assertEquals(earlierProof.publicInput.T);
        input.N.assertEquals(earlierProof.publicInput.N);
        input.initialContributionRoot.assertEquals(
          earlierProof.publicInput.initialContributionRoot
        );
        input.publicKeyRoot.assertEquals(
          earlierProof.publicInput.publicKeyRoot
        );
        input.encryptionRoot.assertEquals(
          earlierProof.publicInput.encryptionRoot
        );
        input.reduceStateRoot.assertEquals(
          earlierProof.publicInput.reduceStateRoot
        );
        input.c.length.assertEquals(input.N);
        input.U.length.assertEquals(input.N);

        // Calculate key index in MT
        let keyIndex = Poseidon.hash([
          input.action.committeeId,
          input.action.keyId,
        ]);

        // Check if the actions have the same requestId
        input.action.requestId.assertEquals(earlierProof.publicOutput.requestId);

        // Check if decryption is correct
        decryptionProof.verify();
        decryptionProof.publicInput.memberId.assertEquals(
          input.action.memberId
        );
        decryptionProof.publicInput.publicKey.assertEquals(input.publicKey);
        let encryptionHashChain = Field(0);
        for (let i = 0; i < COMMITTEE_MAX_SIZE; i++) {
          decryptionProof.publicInput.c.hash().assertEquals(input.c.hash());
          decryptionProof.publicInput.U.hash().assertEquals(input.U.hash());
          encryptionHashChain = Provable.if(
            Field(i).greaterThanOrEqual(input.N),
            Field(0),
            Poseidon.hash([
              encryptionHashChain,
              input.c.get(Field(i)).toFields(),
              input.U.get(Field(i)).toFields(),
            ].flat())
          );
        }

        // Check if encryption hash chain existed
        encryptionWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [encryptionRoot, encryptionIndex] =
          encryptionWitness.level1.computeRootAndKey(
            encryptionWitness.level2.calculateRoot(encryptionHashChain)
          );
        encryptionRoot.assertEquals(
          earlierProof.publicInput.encryptionRoot
        );
        encryptionIndex.assertEquals(input.action.requestId);

        // Check if this committee member has contributed yet
        contributionWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [contributionRoot, contributionIndex] =
          contributionWitness.level1.computeRootAndKey(
            contributionWitness.level2.calculateRoot(Field(0))
          );
        contributionRoot.assertEquals(
          earlierProof.publicOutput.newContributionRoot
        );
        contributionIndex.assertEquals(input.action.requestId);

        // Compute new contribution root
        [contributionRoot] = contributionWitness.level1.computeRootAndKey(
          contributionWitness.level2.calculateRoot(
            input.action.contribution.hash()
          )
        );

        // Check if this member's public key has been registered
        publicKeyWitness.level2
          .calculateIndex()
          .assertEquals(input.action.memberId);
        let [publicKeyRoot, publicKeyIndex] =
          publicKeyWitness.level1.computeRootAndKey(
            publicKeyWitness.level2.calculateRoot(Poseidon.hash(input.publicKey.toFields()))
          );
        publicKeyRoot.assertEquals(earlierProof.publicInput.publicKeyRoot);
        publicKeyIndex.assertEquals(keyIndex);

        // Calculate new D value
        let D = earlierProof.publicOutput.D;
        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
          D.set(
            Field(i),
            D.get(Field(i)).add(
              input.action.contribution.D.get(Field(i))
            )
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
        root.assertEquals(earlierProof.publicInput.reduceStateRoot);
        key.assertEquals(actionState);

        return new ResponseOutput({
          newContributionRoot: contributionRoot,
          requestId: input.action.requestId,
          D: D,
          counter: earlierProof.publicOutput.counter.add(Field(1)),
        })
      }
    }
  }
});

export class CompleteResponseProof extends ZkProgram.Proof(CompleteResponse) { }

export class ResponseContract extends SmartContract {
  reducer = Reducer({ actionType: Action });
  events = {
    [EventEnum.CONTRIBUTIONS_REDUCED]: Field,
  }

  @state(Field) zkApps = State<Field>();
  @state(Field) reduceState = State<Field>();
  @state(Field) contributions = State<Field>();

  @method
  verifyZkApp(zkApp: ZkAppRef, index: Field) {
    let zkApps = this.zkApps.getAndAssertEquals();
    let [root, id] = zkApp.witness.computeRootAndKey(
      Poseidon.hash(zkApp.address.toFields())
    );
    root.assertEquals(zkApps);
    id.assertEquals(index);
  }

  @method
  contribute(
    action: Action,
    committee: ZkAppRef,
    memberWitness: CommitteeWitness,
    dkg: ZkAppRef,
    keyStatusWitness: MerkleMapWitness,
    request: ZkAppRef,
    requestStatusWitness: MerkleMapWitness,
  ) {
    // Verify sender's index
    this.verifyZkApp(committee, ZK_APP.COMMITTEE);
    const committeeContract = new CommitteeContract(committee.address);
    let memberId = committeeContract.checkMember(
      new CheckMemberInput({
        address: this.sender,
        commiteeId: action.committeeId,
        memberMerkleTreeWitness: memberWitness.level2,
        memberMerkleMapWitness: memberWitness.level1,
      })
    );
    memberId.assertEquals(action.memberId);

    // Verify key status
    this.verifyZkApp(dkg, ZK_APP.DKG);
    const dkgContract = new DKGContract(dkg.address);
    dkgContract.verifyKeyStatus(
      Poseidon.hash([action.committeeId, action.keyId]),
      Field(KeyStatus.ACTIVE),
      keyStatusWitness
    );

    // TODO - Verify request status
    this.verifyZkApp(request, ZK_APP.REQUEST);


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
    proof.publicInput.initialReduceState.assertEquals(reduceState);
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
    settingWitness: MerkleMapWitness,
    request: ZkAppRef,
  ) {
    // Get current state values
    let contributions = this.contributions.getAndAssertEquals();
    let reduceState = this.reduceState.getAndAssertEquals();

    // Verify proof
    proof.verify();
    proof.publicInput.initialContributionRoot.assertEquals(contributions);
    proof.publicInput.reduceStateRoot.assertEquals(reduceState);
    proof.publicOutput.counter.assertEquals(proof.publicInput.T);

    // Verify public keys
    this.verifyZkApp(round1, ZK_APP.ROUND_1);
    const round1Contract = new Round1Contract(round1.address);
    let publicKeyRoot = round1Contract.publicKeys.getAndAssertEquals();
    publicKeyRoot.assertEquals(proof.publicInput.publicKeyRoot);

    // Verify encryption hashes
    this.verifyZkApp(round2, ZK_APP.ROUND_2);
    const round2Contract = new Round2Contract(round2.address);
    let encryptionRoot = round2Contract.encryptions.getAndAssertEquals();
    encryptionRoot.assertEquals(proof.publicInput.encryptionRoot);

    // Verify committee config
    this.verifyZkApp(committee, ZK_APP.COMMITTEE);
    const committeeContract = new CommitteeContract(committee.address);
    committeeContract.checkConfig(
      new CheckConfigInput({
        N: proof.publicInput.N,
        T: proof.publicInput.T,
        commiteeId: proof.publicInput.action.committeeId,
        settingMerkleMapWitness: settingWitness,
      })
    );

    // Set new states
    this.contributions.set(proof.publicOutput.newContributionRoot);

    // TODO - Dispatch action in Request contract
    // this.verifyZkApp(request, ZK_APP.REQUEST);
    // const dkgContract = new DKGContract(dkg.address);

  }
}