var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Field, SmartContract, state, State, method, PublicKey, MerkleWitness, Group, Bool, Reducer, Permissions, VerificationKey, AccountUpdate, Mina, MerkleTree, MerkleMap, MerkleMapWitness, Struct, Experimental, SelfProof, Poseidon, } from 'o1js';
import DynamicGroupArray from '../type/DynamicGroupArray.js';
const accountFee = Mina.accountCreationFee();
const treeHeight = 6; // setting max 32 member
const EmptyMerkleMap = new MerkleMap();
const Tree = new MerkleTree(treeHeight);
export class MyMerkleWitness extends MerkleWitness(treeHeight) {
}
export class GroupArray extends DynamicGroupArray(2 ** (treeHeight - 1)) {
}
function updateOutOfSnark(state, action) {
    if (action === undefined)
        return state;
    let actionsHash = AccountUpdate.Actions.hash(action);
    return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}
export class RollupState extends Struct({
    actionHash: Field,
    memberTreeRoot: Field,
    settingTreeRoot: Field,
    dkgAddressTreeRoot: Field,
    currentCommitteeId: Field,
}) {
}
export const createCommitteeProof = Experimental.ZkProgram({
    publicInput: RollupState,
    publicOutput: RollupState,
    methods: {
        nextStep: {
            privateInputs: [
                (SelfProof),
                GroupArray,
                MerkleMapWitness,
                Group,
                MerkleMapWitness,
                Field,
                MerkleMapWitness,
            ],
            method(input, preProof, publickeys, memberWitness, newAddress, settingWitess, threshold, dkgAddressWitness) {
                preProof.verify();
                ////// caculate new memberTreeRoot
                let [preMemberRoot, nextCommitteeId] = memberWitness.computeRootAndKey(Field(0));
                nextCommitteeId.assertEquals(preProof.publicOutput.currentCommitteeId);
                preMemberRoot.assertEquals(preProof.publicOutput.memberTreeRoot);
                let tree = new MerkleTree(treeHeight);
                for (let i = 0; i < 32; i++) {
                    tree.setLeaf(BigInt(i), GroupArray.hash(publickeys.get(Field(i))));
                }
                // update new tree of public key in to the member tree
                let [newMemberRoot] = memberWitness.computeRootAndKey(tree.getRoot());
                ////// caculate new settingTreeRoot
                let [preSettingRoot, settingKey] = settingWitess.computeRootAndKey(Field(0));
                settingKey.assertEquals(nextCommitteeId);
                preSettingRoot.assertEquals(preProof.publicOutput.settingTreeRoot);
                // update new tree of public key in to the member tree
                let [newSettingRoot] = dkgAddressWitness.computeRootAndKey(
                // hash [t,n]
                Poseidon.hash([threshold, publickeys.length]));
                ////// caculate new address tree root
                let [preAddressRoot, addressKey] = dkgAddressWitness.computeRootAndKey(Field(0));
                addressKey.assertEquals(nextCommitteeId);
                preAddressRoot.assertEquals(preProof.publicOutput.dkgAddressTreeRoot);
                // update new tree of public key in to the member tree
                let [newAddressRoot] = dkgAddressWitness.computeRootAndKey(GroupArray.hash(newAddress));
                return new RollupState({
                    actionHash: updateOutOfSnark(preProof.publicOutput.actionHash, [
                        [
                            publickeys.length,
                            publickeys.toFields(),
                            newAddress.toFields(),
                            threshold,
                        ].flat(),
                    ]),
                    memberTreeRoot: newMemberRoot,
                    settingTreeRoot: newSettingRoot,
                    dkgAddressTreeRoot: newAddressRoot,
                    currentCommitteeId: nextCommitteeId.add(Field(1)),
                });
            },
        },
        firstStep: {
            privateInputs: [],
            method(input) {
                return input;
            },
        },
    },
});
class CommitteeProof extends Experimental.ZkProgram.Proof(createCommitteeProof) {
}
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
        this.nextCommitteeId = State();
        this.memberTreeRoot = State();
        this.settingTreeRoot = State();
        this.dkgAddressTreeRoot = State();
        this.actionState = State();
        this.reducer = Reducer({ actionType: CommitteeInput });
    }
    init() {
        super.init();
        this.memberTreeRoot.set(EmptyMerkleMap.getRoot());
        this.settingTreeRoot.set(EmptyMerkleMap.getRoot());
        this.dkgAddressTreeRoot.set(EmptyMerkleMap.getRoot());
        this.actionState.set(Reducer.initialActionState);
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
        // this.send({ to: this.sender, amount: accountFee });
    }
    createCommittee(addresses, threshold, dkgAddress, verificationKey) {
        threshold.assertLessThanOrEqual(addresses.length);
        this.deployContract(PublicKey.fromGroup(dkgAddress), verificationKey);
        this.reducer.dispatch(new CommitteeInput({
            addresses,
            dkgAddress,
            threshold,
        }));
    }
    // Todo: merge deployContract() into this function
    rollupIncrements(proof) {
        proof.verify();
        let curActionState = this.actionState.getAndAssertEquals();
        let nextCommitteeId = this.nextCommitteeId.getAndAssertEquals();
        let memberTreeRoot = this.memberTreeRoot.getAndAssertEquals();
        let settingTreeRoot = this.settingTreeRoot.getAndAssertEquals();
        let dkgAddressTreeRoot = this.dkgAddressTreeRoot.getAndAssertEquals();
        curActionState.assertEquals(proof.publicInput.actionHash);
        nextCommitteeId.assertEquals(proof.publicInput.currentCommitteeId);
        memberTreeRoot.assertEquals(proof.publicInput.memberTreeRoot);
        settingTreeRoot.assertEquals(proof.publicInput.settingTreeRoot);
        dkgAddressTreeRoot.assertEquals(proof.publicInput.dkgAddressTreeRoot);
        // compute the new counter and hash from pending actions
        // if hash not exists, it will throw error
        let pendingActions = this.reducer.getActions({
            fromActionState: curActionState,
            endActionState: proof.publicOutput.actionHash,
        });
        // update on-chain state
        this.actionState.set(proof.publicOutput.actionHash);
        this.nextCommitteeId.set(proof.publicOutput.currentCommitteeId);
        this.memberTreeRoot.set(proof.publicOutput.memberTreeRoot);
        this.settingTreeRoot.set(proof.publicOutput.settingTreeRoot);
        this.dkgAddressTreeRoot.set(proof.publicOutput.dkgAddressTreeRoot);
    }
    checkMember(address, commiteeId, memberMerkleTreeWitness, memberMerkleMapWitness) {
        let leaf = memberMerkleTreeWitness.calculateRoot(GroupArray.hash(address));
        let [root, _commiteeId] = memberMerkleMapWitness.computeRootAndKey(leaf);
        const onChainRoot = this.memberTreeRoot.getAndAssertEquals();
        root.assertEquals(onChainRoot);
        commiteeId.assertEquals(_commiteeId);
    }
    checkConfig(n, t, commiteeId, settingMerkleMapWitness) {
        n.assertGreaterThanOrEqual(t);
        // hash[t,n]
        let hashSetting = Poseidon.hash([t, n]);
        let [root, _commiteeId] = settingMerkleMapWitness.computeRootAndKey(hashSetting);
        const onChainRoot = this.settingTreeRoot.getAndAssertEquals();
        root.assertEquals(onChainRoot);
        commiteeId.assertEquals(_commiteeId);
    }
}
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "vkDKGHash", void 0);
__decorate([
    state(Field),
    __metadata("design:type", Object)
], Committee.prototype, "nextCommitteeId", void 0);
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
        Field,
        Group,
        VerificationKey]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "createCommittee", null);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CommitteeProof]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "rollupIncrements", null);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Group,
        Field,
        MyMerkleWitness,
        MerkleMapWitness]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "checkMember", null);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Field,
        Field,
        Field,
        MerkleMapWitness]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "checkConfig", null);
//# sourceMappingURL=Committee.js.map