var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Field, SmartContract, state, State, method, } from 'o1js';
export class MockDKGContract extends SmartContract {
    constructor() {
        super(...arguments);
        this.num = State();
    }
    deploy(args) {
        super.deploy(args);
        this.num.set(Field(1));
    }
    addNum(addNum) {
        const currentState = this.num.getAndAssertEquals();
        const newState = currentState.add(addNum);
        this.num.set(newState);
    }
}
__decorate([
    state(Field),
    __metadata("design:type", Object)
], MockDKGContract.prototype, "num", void 0);
__decorate([
    method,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Field]),
    __metadata("design:returntype", void 0)
], MockDKGContract.prototype, "addNum", null);
//# sourceMappingURL=MockDKGContract.js.map