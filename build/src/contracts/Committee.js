var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Field, SmartContract, state, State, method, PublicKey, MerkleWitness, Group, Bool, Reducer, Permissions, VerificationKey, AccountUpdate, Mina, MerkleTree, Struct, } from 'o1js';
import DynamicGroupArray from '../type/DynamicGroupArray.js';
const accountFee = Mina.accountCreationFee();
const treeHeight = 6; // setting max 32 member
const Tree = new MerkleTree(treeHeight);
class MyMerkleWitness extends MerkleWitness(treeHeight) {
}
export class GroupArray extends DynamicGroupArray(2 ** (treeHeight - 1)) {
}
function updateOutOfSnark(state, action) {
    if (action === undefined)
        return state;
    let actionsHash = AccountUpdate.Actions.hash(action);
    return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}
// export class RollupState extends Struct({
//   actionHash: Field,
//   memberTreeRoot: Field,
//   settingTreeRoot: Field,
//   dkgAddressTreeRoot: Field,
//   currentCommitteeId: Field,
// }) {}
// export const createCommitteeProof = Experimental.ZkProgram({
//   publicInput: RollupState,
//   publicOutput: RollupState,
//   methods: {
//     nextStep: {
//       privateInputs: [
//         SelfProof<RollupState, RollupState>,
//         GroupArray,
//         MyMerkleWitness,
//         Group,
//         MerkleMapWitness,
//         Field,
//         MerkleMapWitness,
//       ],
//       method(
//         input: RollupState,
//         preProof: SelfProof<RollupState, RollupState>,
//         publickeys: GroupArray,
//         memberWitness: MyMerkleWitness,
//         newAddresses: Group,
//         settingWitess: MerkleMapWitness,
//         threshold: Field,
//         dkgAddressWitness: MerkleMapWitness
//       ): RollupState {
//         preProof.verify();
//         ////// caculate new memberTreeRoot
//         let newCommitteeId = memberWitness.calculateIndex();
//         newCommitteeId.assertEquals(
//           preProof.publicOutput.currentCommitteeId.add(Field(1))
//         );
//         let preMemberRoot = memberWitness.calculateRoot(Field(0));
//         preMemberRoot.assertEquals(preProof.publicOutput.memberTreeRoot);
//         let tree = new MerkleTree(treeHeight);
//         for (let i = 0; i < 32; i++) {
//           tree.setLeaf(BigInt(i), GroupArray.hash(publickeys.get(Field(i))));
//         }
//         // update new tree of public key in to the member tree
//         let newMemberRoot = memberWitness.calculateRoot(tree.getRoot());
//         ////// caculate new settingTreeRoot
//         let [preSettingRoot, settingKey] = settingWitess.computeRootAndKey(
//           Field(0)
//         );
//         settingKey.assertEquals(newCommitteeId);
//         preSettingRoot.assertEquals(preProof.publicOutput.settingTreeRoot);
//         // update new tree of public key in to the member tree
//         let [newSettingRoot] = dkgAddressWitness.computeRootAndKey(
//           // hash [t,n]
//           Poseidon.hash([threshold, publickeys.length])
//         );
//         ////// caculate new address tree root
//         let [preAddressRoot, addressKey] = dkgAddressWitness.computeRootAndKey(
//           Field(0)
//         );
//         addressKey.assertEquals(newCommitteeId);
//         preAddressRoot.assertEquals(preProof.publicOutput.dkgAddressTreeRoot);
//         // update new tree of public key in to the member tree
//         let [newAddressRoot] = dkgAddressWitness.computeRootAndKey(
//           GroupArray.hash(newAddresses)
//         );
//         return new RollupState({
//           actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [[publickeys.toFields() ]])
//           memberTreeRoot: newMemberRoot,
//           settingTreeRoot: newSettingRoot,
//           dkgAddressTreeRoot: newAddressRoot,
//           currentCommitteeId: newCommitteeId,
//         });
//       },
//     },
//     firstStep: {
//       privateInputs: [],
//       method(input: RollupState): RollupState {
//         return input;
//       },
//     },
//   },
// });
// class CommitteeProof extends Experimental.ZkProgram.Proof(
//   createCommitteeProof
// ) {}
export class CommitteeInput extends Struct({
    addresses: GroupArray,
    dkgAddress: Group,
    threshold: Field,
}) {
}
export class Committee extends SmartContract {
    constructor() {
        super(...arguments);
        this.vkDKGHash = State();
        this.curCommitteeId = State();
        this.memberTreeRoot = State();
        this.settingTreeRoot = State();
        this.dkgAddressTreeRoot = State();
        this.actionState = State();
        this.reducer = Reducer({ actionType: CommitteeInput });
        // @method rollupIncrements(proof: CommitteeProof) {
        //   proof.verify();
        //   let curActionState = this.actionState.getAndAssertEquals();
        //   let curCommitteeId = this.curCommitteeId.getAndAssertEquals();
        //   let memberTreeRoot = this.memberTreeRoot.getAndAssertEquals();
        //   let settingTreeRoot = this.settingTreeRoot.getAndAssertEquals();
        //   let dkgAddressTreeRoot = this.dkgAddressTreeRoot.getAndAssertEquals();
        //   curCommitteeId.assertEquals(proof.publicInput.currentCommitteeId);
        //   memberTreeRoot.assertEquals(proof.publicInput.memberTreeRoot);
        //   settingTreeRoot.assertEquals(proof.publicInput.settingTreeRoot);
        //   dkgAddressTreeRoot.assertEquals(proof.publicInput.dkgAddressTreeRoot);
        //   // compute the new counter and hash from pending actions
        //   let pendingActions = this.reducer.getActions({
        //     fromActionState: curActionState,
        //   });
        //   let { state: newCounter, actionState: newActionState } =
        //     this.reducer.reduce(
        //       pendingActions,
        //       // state type
        //       Field,
        //       // function that says how to apply an action
        //       (state: Field, _action: Field) => {
        //         return Field(0);
        //       },
        //       { state: Field(0), actionState: curActionState }
        //     );
        //   newActionState.assertEquals(proof.publicOutput.endHash);
        //   // update on-chain state
        //   this.num.set(proof.publicOutput.value);
        //   this.actionState.set(newActionState);
        // }
    }
    init() {
        super.init();
    }
    // to-do add permission only owner
    setVkDKGHash(verificationKey) {
        this.vkDKGHash.set(verificationKey.hash);
    }
    deployContract(address, verificationKey) {
        const currentVKHash = this.vkDKGHash.getAndAssertEquals();
        verificationKey.hash.assertEquals(currentVKHash);
        let dkgContract = AccountUpdate.createSigned(address);
        dkgContract.account.isNew.assertEquals(Bool(true));
        // To-do: setting not cho change permision on the future
        dkgContract.account.permissions.set(Permissions.default());
        dkgContract.account.verificationKey.set(verificationKey);
        this.send({ to: this.sender, amount: accountFee });
    }
    createCommittee(addresses, dkgAddress, threshold) {
        threshold.assertLessThanOrEqual(addresses.length);
        this.reducer.dispatch(new CommitteeInput({
            addresses,
            dkgAddress,
            threshold,
        }));
    }
}
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "vkDKGHash", void 0);
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "curCommitteeId", void 0);
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "memberTreeRoot", void 0);
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "settingTreeRoot", void 0);
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "dkgAddressTreeRoot", void 0);
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "actionState", void 0);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [VerificationKey]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "setVkDKGHash", null);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PublicKey, VerificationKey]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "deployContract", null);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [GroupArray,
        Group,
        Field]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "createCommittee", null);
//# sourceMappingURL=Committee.js.map