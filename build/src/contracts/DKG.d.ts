import { Field, SmartContract, State } from 'o1js';
export declare class MockDKGContract extends SmartContract {
    num: State<import("o1js/dist/node/lib/field").Field>;
    addNum(addNum: Field): void;
}
