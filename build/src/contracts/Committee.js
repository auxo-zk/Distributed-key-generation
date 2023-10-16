var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Field, SmartContract, state, State, method, PublicKey, MerkleWitness, Bool, Permissions, VerificationKey, AccountUpdate, Mina, MerkleTree, Experimental, } from 'o1js';
import DynamicGroupArray from '../type/DynamicGroupArray.js';
const accountFee = Mina.accountCreationFee();
const treeHeight = 6; // setting max 32 member
const Tree = new MerkleTree(treeHeight);
class MyMerkleWitness extends MerkleWitness(treeHeight) {
}
export class GroupArray extends DynamicGroupArray(2 ** (treeHeight - 1)) {
}
export class Committee extends SmartContract {
    constructor() {
        super(...arguments);
        this.vkDKGHash = State();
        this.curCommitteeId = State();
    }
    init() {
        super.init();
        this.curCommitteeId.set(Field(1));
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
    createCommittee(address, verificationKey) {
        const curCommitteeId = this.curCommitteeId.getAndAssertEquals();
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
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PublicKey, VerificationKey]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "deployContract", null);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PublicKey,
        VerificationKey]),
    __metadata("design:returntype", void 0)
], Committee.prototype, "createCommittee", null);
export const createCommitteeProve = Experimental.ZkProgram({
    publicInput: GroupArray,
    publicOutput: Field,
    methods: {
        createProve: {
            privateInputs: [],
            method(input) {
                let tree = new MerkleTree(treeHeight);
                for (let i = 0; i < 32; i++) {
                    // if (!input.get(Field(i)).isZero())
                    tree.setLeaf(BigInt(i), GroupArray.hash(input.get(Field(i))));
                }
                return tree.getRoot();
            },
        },
    },
});
class CommitteeProve extends Experimental.ZkProgram.Proof(createCommitteeProve) {
}
//# sourceMappingURL=Committee.js.map