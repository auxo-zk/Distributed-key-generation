import { Field, SmartContract, State, PublicKey, Group, VerificationKey, MerkleMapWitness, SelfProof } from 'o1js';
declare const MyMerkleWitness_base: typeof import("o1js/dist/node/lib/merkle_tree.js").BaseMerkleWitness;
declare class MyMerkleWitness extends MyMerkleWitness_base {
}
declare const GroupArray_base: {
    new (values?: import("o1js/dist/node/lib/group.js").Group[] | undefined): {
        get(index: import("o1js/dist/node/lib/field.js").Field): import("o1js/dist/node/lib/group.js").Group;
        toFields(): import("o1js/dist/node/lib/field.js").Field[];
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
        toFields(): import("o1js/dist/node/lib/field.js").Field[];
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
        toFields(): import("o1js/dist/node/lib/field.js").Field[];
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
declare const RollupState_base: (new (value: {
    actionHash: import("o1js/dist/node/lib/field.js").Field;
    memberTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    settingTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    dkgAddressTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    currentCommitteeId: import("o1js/dist/node/lib/field.js").Field;
}) => {
    actionHash: import("o1js/dist/node/lib/field.js").Field;
    memberTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    settingTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    dkgAddressTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    currentCommitteeId: import("o1js/dist/node/lib/field.js").Field;
}) & {
    _isStruct: true;
} & import("o1js/dist/node/snarky.js").ProvablePure<{
    actionHash: import("o1js/dist/node/lib/field.js").Field;
    memberTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    settingTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    dkgAddressTreeRoot: import("o1js/dist/node/lib/field.js").Field;
    currentCommitteeId: import("o1js/dist/node/lib/field.js").Field;
}> & {
    toInput: (x: {
        actionHash: import("o1js/dist/node/lib/field.js").Field;
        memberTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        settingTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        dkgAddressTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        currentCommitteeId: import("o1js/dist/node/lib/field.js").Field;
    }) => {
        fields?: import("o1js/dist/node/lib/field.js").Field[] | undefined;
        packed?: [import("o1js/dist/node/lib/field.js").Field, number][] | undefined;
    };
    toJSON: (x: {
        actionHash: import("o1js/dist/node/lib/field.js").Field;
        memberTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        settingTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        dkgAddressTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        currentCommitteeId: import("o1js/dist/node/lib/field.js").Field;
    }) => {
        actionHash: string;
        memberTreeRoot: string;
        settingTreeRoot: string;
        dkgAddressTreeRoot: string;
        currentCommitteeId: string;
    };
    fromJSON: (x: {
        actionHash: string;
        memberTreeRoot: string;
        settingTreeRoot: string;
        dkgAddressTreeRoot: string;
        currentCommitteeId: string;
    }) => {
        actionHash: import("o1js/dist/node/lib/field.js").Field;
        memberTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        settingTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        dkgAddressTreeRoot: import("o1js/dist/node/lib/field.js").Field;
        currentCommitteeId: import("o1js/dist/node/lib/field.js").Field;
    };
};
export declare class RollupState extends RollupState_base {
}
export declare const createCommitteeProof: {
    name: string;
    compile: () => Promise<{
        verificationKey: string;
    }>;
    verify: (proof: import("o1js/dist/node/lib/proof_system.js").Proof<RollupState, RollupState>) => Promise<boolean>;
    digest: () => string;
    analyzeMethods: () => {
        rows: number;
        digest: string;
        result: unknown;
        gates: import("o1js/dist/node/snarky.js").Gate[];
        publicInputSize: number;
    }[];
    publicInputType: typeof RollupState;
    publicOutputType: typeof RollupState;
} & {
    nextStep: (publicInput: RollupState, ...args: [SelfProof<RollupState, RollupState>, GroupArray, MerkleMapWitness, import("o1js/dist/node/lib/group.js").Group, MerkleMapWitness, import("o1js/dist/node/lib/field.js").Field, MerkleMapWitness] & any[]) => Promise<import("o1js/dist/node/lib/proof_system.js").Proof<RollupState, RollupState>>;
    firstStep: (publicInput: RollupState, ...args: [] & any[]) => Promise<import("o1js/dist/node/lib/proof_system.js").Proof<RollupState, RollupState>>;
};
declare const CommitteeProof_base: {
    new ({ proof, publicInput, publicOutput, maxProofsVerified, }: {
        proof: unknown;
        publicInput: RollupState;
        publicOutput: RollupState;
        maxProofsVerified: 0 | 1 | 2;
    }): {
        publicInput: RollupState;
        publicOutput: RollupState;
        proof: unknown;
        maxProofsVerified: 0 | 1 | 2;
        shouldVerify: import("o1js/dist/node/lib/bool.js").Bool;
        verify(): void;
        verifyIf(condition: import("o1js/dist/node/lib/bool.js").Bool): void;
        toJSON(): import("o1js/dist/node/lib/proof_system.js").JsonProof;
    };
    publicInputType: typeof RollupState;
    publicOutputType: typeof RollupState;
    tag: () => {
        name: string;
        publicInputType: typeof RollupState;
        publicOutputType: typeof RollupState;
    };
    fromJSON<S extends (new (...args: any) => import("o1js/dist/node/lib/proof_system.js").Proof<unknown, unknown>) & {
        prototype: import("o1js/dist/node/lib/proof_system.js").Proof<any, any>;
        publicInputType: import("o1js/dist/node/lib/circuit_value.js").FlexibleProvablePure<any>;
        publicOutputType: import("o1js/dist/node/lib/circuit_value.js").FlexibleProvablePure<any>;
        tag: () => {
            name: string;
        };
        fromJSON: typeof import("o1js/dist/node/lib/proof_system.js").Proof.fromJSON;
    } & {
        prototype: import("o1js/dist/node/lib/proof_system.js").Proof<unknown, unknown>;
    }>(this: S, { maxProofsVerified, proof: proofString, publicInput: publicInputJson, publicOutput: publicOutputJson, }: import("o1js/dist/node/lib/proof_system.js").JsonProof): import("o1js/dist/node/lib/proof_system.js").Proof<import("o1js/dist/node/bindings/lib/provable-snarky.js").InferProvable<S["publicInputType"]>, import("o1js/dist/node/bindings/lib/provable-snarky.js").InferProvable<S["publicOutputType"]>>;
};
declare class CommitteeProof extends CommitteeProof_base {
}
declare const CommitteeInput_base: (new (value: {
    addresses: GroupArray;
    dkgAddress: import("o1js/dist/node/lib/group.js").Group;
    threshold: import("o1js/dist/node/lib/field.js").Field;
}) => {
    addresses: GroupArray;
    dkgAddress: import("o1js/dist/node/lib/group.js").Group;
    threshold: import("o1js/dist/node/lib/field.js").Field;
}) & {
    _isStruct: true;
} & import("o1js/dist/node/snarky.js").ProvablePure<{
    addresses: GroupArray;
    dkgAddress: import("o1js/dist/node/lib/group.js").Group;
    threshold: import("o1js/dist/node/lib/field.js").Field;
}> & {
    toInput: (x: {
        addresses: GroupArray;
        dkgAddress: import("o1js/dist/node/lib/group.js").Group;
        threshold: import("o1js/dist/node/lib/field.js").Field;
    }) => {
        fields?: import("o1js/dist/node/lib/field.js").Field[] | undefined;
        packed?: [import("o1js/dist/node/lib/field.js").Field, number][] | undefined;
    };
    toJSON: (x: {
        addresses: GroupArray;
        dkgAddress: import("o1js/dist/node/lib/group.js").Group;
        threshold: import("o1js/dist/node/lib/field.js").Field;
    }) => {
        addresses: {
            length: string;
            values: {
                x: string;
                y: string;
            }[];
        };
        dkgAddress: {
            x: string;
            y: string;
        };
        threshold: string;
    };
    fromJSON: (x: {
        addresses: {
            length: string;
            values: {
                x: string;
                y: string;
            }[];
        };
        dkgAddress: {
            x: string;
            y: string;
        };
        threshold: string;
    }) => {
        addresses: GroupArray;
        dkgAddress: import("o1js/dist/node/lib/group.js").Group;
        threshold: import("o1js/dist/node/lib/field.js").Field;
    };
};
export declare class CommitteeInput extends CommitteeInput_base {
}
export declare class Committee extends SmartContract {
    vkDKGHash: State<import("o1js/dist/node/lib/field.js").Field>;
    curCommitteeId: State<import("o1js/dist/node/lib/field.js").Field>;
    memberTreeRoot: State<import("o1js/dist/node/lib/field.js").Field>;
    settingTreeRoot: State<import("o1js/dist/node/lib/field.js").Field>;
    dkgAddressTreeRoot: State<import("o1js/dist/node/lib/field.js").Field>;
    actionState: State<import("o1js/dist/node/lib/field.js").Field>;
    reducer: {
        dispatch(action: CommitteeInput): void;
        reduce<State_1>(actions: CommitteeInput[][], stateType: import("o1js/dist/node/lib/provable.js").Provable<State_1>, reduce: (state: State_1, action: CommitteeInput) => State_1, initial: {
            state: State_1;
            actionState: import("o1js/dist/node/lib/field.js").Field;
        }, options?: {
            maxTransactionsWithActions?: number | undefined;
            skipActionStatePrecondition?: boolean | undefined;
        } | undefined): {
            state: State_1;
            actionState: import("o1js/dist/node/lib/field.js").Field;
        };
        forEach(actions: CommitteeInput[][], reduce: (action: CommitteeInput) => void, fromActionState: import("o1js/dist/node/lib/field.js").Field, options?: {
            maxTransactionsWithActions?: number | undefined;
            skipActionStatePrecondition?: boolean | undefined;
        } | undefined): import("o1js/dist/node/lib/field.js").Field;
        getActions({ fromActionState, endActionState, }?: {
            fromActionState?: import("o1js/dist/node/lib/field.js").Field | undefined;
            endActionState?: import("o1js/dist/node/lib/field.js").Field | undefined;
        } | undefined): CommitteeInput[][];
        fetchActions({ fromActionState, endActionState, }: {
            fromActionState?: import("o1js/dist/node/lib/field.js").Field | undefined;
            endActionState?: import("o1js/dist/node/lib/field.js").Field | undefined;
        }): Promise<CommitteeInput[][]>;
    };
    init(): void;
    setVkDKGHash(verificationKey: VerificationKey): void;
    deployContract(address: PublicKey, verificationKey: VerificationKey): void;
    createCommittee(addresses: GroupArray, dkgAddress: Group, threshold: Field): void;
    rollupIncrements(proof: CommitteeProof): void;
    checkMember(address: Group, commiteeId: Field, memberMerkleTreeWitness: MyMerkleWitness, memberMerkleMapWitness: MerkleMapWitness): void;
    checkConfig(n: Field, t: Field, commiteeId: Field, settingMerkleMapWitness: MerkleMapWitness): void;
}
export {};
