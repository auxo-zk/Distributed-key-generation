import { SmartContract, State, PublicKey, VerificationKey } from 'o1js';
declare const GroupArray_base: {
    new (values?: import("o1js/dist/node/lib/group.js").Group[] | undefined): {
        get(index: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/group.js").Group;
        set(index: import("o1js/dist/node/lib/field.js").Field, value: import("o1js/dist/node/lib/group.js").Group): void;
        push(value: import("o1js/dist/node/lib/group.js").Group): void;
        pop(n: import("o1js/dist/node/lib/field.js").Field): void;
        concat(other: any): any;
        copy(): any;
        slice(start: import("o1js/dist/node/lib/field.js").Field, end: import("o1js/dist/node/lib/field.js").Field): any;
        insert(index: import("o1js/dist/node/lib/field.js").Field, value: import("o1js/dist/node/lib/group.js").Group): void;
        includes(value: import("o1js/dist/node/lib/group.js").Group): import("o1js/dist/node/lib/bool.js").Bool;
        assertIncludes(value: import("o1js/dist/node/lib/group.js").Group): void;
        shiftLeft(n: import("o1js/dist/node/lib/field.js").Field): void;
        shiftRight(n: import("o1js/dist/node/lib/field.js").Field): void;
        hash(): import("o1js/dist/node/lib/field.js").Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/bool.js").Bool[];
        incrementLength(n: import("o1js/dist/node/lib/field.js").Field): void;
        decrementLength(n: import("o1js/dist/node/lib/field.js").Field): void;
        lengthMask(n: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/bool.js").Bool[];
        map(fn: (v: import("o1js/dist/node/lib/group.js").Group, i: import("o1js/dist/node/lib/field.js").Field) => import("o1js/dist/node/lib/group.js").Group): any;
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    };
    Null(): import("o1js/dist/node/lib/group.js").Group;
    hash(values: import("o1js/dist/node/lib/group.js").Group): import("o1js/dist/node/lib/field.js").Field;
    fillWithNull([...values]: import("o1js/dist/node/lib/group.js").Group[], length: number): import("o1js/dist/node/lib/group.js").Group[];
    from(values: import("o1js/dist/node/lib/group.js").Group[]): {
        get(index: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/group.js").Group;
        set(index: import("o1js/dist/node/lib/field.js").Field, value: import("o1js/dist/node/lib/group.js").Group): void;
        push(value: import("o1js/dist/node/lib/group.js").Group): void;
        pop(n: import("o1js/dist/node/lib/field.js").Field): void;
        concat(other: any): any;
        copy(): any;
        slice(start: import("o1js/dist/node/lib/field.js").Field, end: import("o1js/dist/node/lib/field.js").Field): any;
        insert(index: import("o1js/dist/node/lib/field.js").Field, value: import("o1js/dist/node/lib/group.js").Group): void;
        includes(value: import("o1js/dist/node/lib/group.js").Group): import("o1js/dist/node/lib/bool.js").Bool;
        assertIncludes(value: import("o1js/dist/node/lib/group.js").Group): void;
        shiftLeft(n: import("o1js/dist/node/lib/field.js").Field): void;
        shiftRight(n: import("o1js/dist/node/lib/field.js").Field): void;
        hash(): import("o1js/dist/node/lib/field.js").Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/bool.js").Bool[];
        incrementLength(n: import("o1js/dist/node/lib/field.js").Field): void;
        decrementLength(n: import("o1js/dist/node/lib/field.js").Field): void;
        lengthMask(n: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/bool.js").Bool[];
        map(fn: (v: import("o1js/dist/node/lib/group.js").Group, i: import("o1js/dist/node/lib/field.js").Field) => import("o1js/dist/node/lib/group.js").Group): any;
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    };
    empty(length?: import("o1js/dist/node/lib/field.js").Field | undefined): {
        get(index: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/group.js").Group;
        set(index: import("o1js/dist/node/lib/field.js").Field, value: import("o1js/dist/node/lib/group.js").Group): void;
        push(value: import("o1js/dist/node/lib/group.js").Group): void;
        pop(n: import("o1js/dist/node/lib/field.js").Field): void;
        concat(other: any): any;
        copy(): any;
        slice(start: import("o1js/dist/node/lib/field.js").Field, end: import("o1js/dist/node/lib/field.js").Field): any;
        insert(index: import("o1js/dist/node/lib/field.js").Field, value: import("o1js/dist/node/lib/group.js").Group): void;
        includes(value: import("o1js/dist/node/lib/group.js").Group): import("o1js/dist/node/lib/bool.js").Bool;
        assertIncludes(value: import("o1js/dist/node/lib/group.js").Group): void;
        shiftLeft(n: import("o1js/dist/node/lib/field.js").Field): void;
        shiftRight(n: import("o1js/dist/node/lib/field.js").Field): void;
        hash(): import("o1js/dist/node/lib/field.js").Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/bool.js").Bool[];
        incrementLength(n: import("o1js/dist/node/lib/field.js").Field): void;
        decrementLength(n: import("o1js/dist/node/lib/field.js").Field): void;
        lengthMask(n: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/bool.js").Bool[];
        map(fn: (v: import("o1js/dist/node/lib/group.js").Group, i: import("o1js/dist/node/lib/field.js").Field) => import("o1js/dist/node/lib/group.js").Group): any;
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    };
    _isStruct: true;
    toFields: (value: {
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    }) => import("o1js/dist/node/lib/field.js").Field[];
    toAuxiliary: (value?: {
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    } | undefined) => any[];
    fromFields: (fields: import("o1js/dist/node/lib/field.js").Field[]) => {
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    };
    sizeInFields(): number;
    check: (value: {
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    }) => void;
    toInput: (x: {
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    }) => {
        fields?: import("o1js/dist/node/lib/field.js").Field[] | undefined;
        packed?: [import("o1js/dist/node/lib/field.js").Field, number][] | undefined;
    };
    toJSON: (x: {
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    }) => {
        length: string;
        values: {
            x: string;
            y: string;
        }[];
    };
    fromJSON: (x: {
        length: string;
        values: {
            x: string;
            y: string;
        }[];
    }) => {
        length: import("o1js/dist/node/lib/field.js").Field;
        values: import("o1js/dist/node/lib/group.js").Group[];
    };
};
export declare class GroupArray extends GroupArray_base {
}
export declare class Committee extends SmartContract {
    vkDKGHash: State<import("o1js/dist/node/lib/field.js").Field>;
    curCommitteeId: State<import("o1js/dist/node/lib/field.js").Field>;
    init(): void;
    deployContract(address: PublicKey, verificationKey: VerificationKey): void;
    createCommittee(address: PublicKey, verificationKey: VerificationKey): void;
}
export declare const createCommitteeProve: {
    name: string;
    compile: () => Promise<{
        verificationKey: string;
    }>;
    verify: (proof: import("o1js/dist/node/lib/proof_system.js").Proof<GroupArray, import("o1js/dist/node/lib/field.js").Field>) => Promise<boolean>;
    digest: () => string;
    analyzeMethods: () => {
        rows: number;
        digest: string;
        result: unknown;
        gates: import("o1js/dist/node/snarky.js").Gate[];
        publicInputSize: number;
    }[];
    publicInputType: typeof GroupArray;
    publicOutputType: typeof import("o1js/dist/node/lib/field.js").Field & ((x: string | number | bigint | import("o1js/dist/node/lib/field.js").Field | import("o1js/dist/node/lib/field.js").FieldVar | import("o1js/dist/node/lib/field.js").FieldConst) => import("o1js/dist/node/lib/field.js").Field);
} & {
    createProve: (publicInput: GroupArray, ...args: [] & any[]) => Promise<import("o1js/dist/node/lib/proof_system.js").Proof<GroupArray, import("o1js/dist/node/lib/field.js").Field>>;
};
export {};
