import { Field, SmartContract, State, DeployArgs } from 'o1js';
export declare class MockDKGContract extends SmartContract {
    num: State<import("o1js/dist/node/lib/field").Field>;
    deploy(args: DeployArgs): void;
    addNum(addNum: Field): void;
}
