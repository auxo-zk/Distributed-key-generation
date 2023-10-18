import { Bool, Field, Group } from 'o1js';
export default function DynamicGroupArray(maxLength: number): {
    new (values?: Group[]): {
        get(index: Field): Group;
        toFields(): Field[];
        set(index: Field, value: Group): void;
        push(value: Group): void;
        pop(n: Field): void;
        concat(other: any): this;
        copy(): this;
        slice(start: Field, end: Field): this;
        insert(index: Field, value: Group): void;
        includes(value: Group): Bool;
        assertIncludes(value: Group): void;
        shiftLeft(n: Field): void;
        shiftRight(n: Field): void;
        hash(): Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: Field): Bool[];
        incrementLength(n: Field): void;
        decrementLength(n: Field): void;
        lengthMask(n: Field): Bool[];
        map(fn: (v: Group, i: Field) => Group): this;
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    };
    Null(): import("o1js/dist/node/lib/group").Group;
    hash(values: Group): Field;
    fillWithNull([...values]: Group[], length: number): Group[];
    from(values: Group[]): {
        get(index: Field): Group;
        toFields(): Field[];
        set(index: Field, value: Group): void;
        push(value: Group): void;
        pop(n: Field): void;
        concat(other: any): this;
        copy(): this;
        slice(start: Field, end: Field): this;
        insert(index: Field, value: Group): void;
        includes(value: Group): Bool;
        assertIncludes(value: Group): void;
        shiftLeft(n: Field): void;
        shiftRight(n: Field): void;
        hash(): Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: Field): Bool[];
        incrementLength(n: Field): void;
        decrementLength(n: Field): void;
        lengthMask(n: Field): Bool[];
        map(fn: (v: Group, i: Field) => Group): this;
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    };
    empty(length?: Field): {
        get(index: Field): Group;
        toFields(): Field[];
        set(index: Field, value: Group): void;
        push(value: Group): void;
        pop(n: Field): void;
        concat(other: any): this;
        copy(): this;
        slice(start: Field, end: Field): this;
        insert(index: Field, value: Group): void;
        includes(value: Group): Bool;
        assertIncludes(value: Group): void;
        shiftLeft(n: Field): void;
        shiftRight(n: Field): void;
        hash(): Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: Field): Bool[];
        incrementLength(n: Field): void;
        decrementLength(n: Field): void;
        lengthMask(n: Field): Bool[];
        map(fn: (v: Group, i: Field) => Group): this;
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    };
    _isStruct: true;
    toFields: (value: {
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    }) => import("o1js/dist/node/lib/field").Field[];
    toAuxiliary: (value?: {
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    } | undefined) => any[];
    fromFields: (fields: import("o1js/dist/node/lib/field").Field[]) => {
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    };
    sizeInFields(): number;
    check: (value: {
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    }) => void;
    toInput: (x: {
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    }) => {
        fields?: import("o1js/dist/node/lib/field").Field[] | undefined;
        packed?: [import("o1js/dist/node/lib/field").Field, number][] | undefined;
    };
    toJSON: (x: {
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
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
        length: import("o1js/dist/node/lib/field").Field;
        values: import("o1js/dist/node/lib/group").Group[];
    };
};
