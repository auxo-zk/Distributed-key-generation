import { Field, Poseidon, SmartContract, State, method, state } from 'o1js';
import { EventEnum } from './constants.js';
import { EMPTY_ADDRESS_MT, ZkAppRef } from '../storages/SharedStorage.js';

export class AddressContract extends SmartContract {
    // MT of other zkApp address
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    events = {
        [EventEnum.ROLLUPED]: Field,
    };

    init() {
        super.init();
        this.zkAppRoot.set(EMPTY_ADDRESS_MT().getRoot());
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    @method updateAddress() {}

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    @method rollup() {}

    verifyZkApp(ref: ZkAppRef) {
        this.zkAppRoot
            .getAndRequireEquals()
            .assertEquals(
                ref.witness.calculateRoot(Poseidon.hash(ref.address.toFields()))
            );
    }
}
