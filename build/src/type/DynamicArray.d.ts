import { Bool, Field, ProvablePure } from 'o1js';
export { DynamicArray };
export default function DynamicArray<T>(type: ProvablePure<T>, maxLength: number): {
    new (values?: T[]): {
        get(index: Field): T;
        set(index: Field, value: T): void;
        toFields(): Field[];
        push(value: T): void;
        pop(n: Field): void;
        concat(other: any): this;
        copy(): this;
        slice(start: Field, end: Field): this;
        insert(index: Field, value: T): void;
        includes(value: T): Bool;
        assertIncludes(value: T): void;
        shiftLeft(n: Field): void;
        shiftRight(n: Field): void;
        hash(): Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: Field): Bool[];
        incrementLength(n: Field): void;
        decrementLength(n: Field): void;
        lengthMask(n: Field): Bool[];
        map(fn: (v: T, i: Field) => T): this;
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    };
    from(values: T[]): {
        get(index: Field): T;
        set(index: Field, value: T): void;
        toFields(): Field[];
        push(value: T): void;
        pop(n: Field): void;
        concat(other: any): this;
        copy(): this;
        slice(start: Field, end: Field): this;
        insert(index: Field, value: T): void;
        includes(value: T): Bool;
        assertIncludes(value: T): void;
        shiftLeft(n: Field): void;
        shiftRight(n: Field): void;
        hash(): Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: Field): Bool[];
        incrementLength(n: Field): void;
        decrementLength(n: Field): void;
        lengthMask(n: Field): Bool[];
        map(fn: (v: T, i: Field) => T): this;
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    };
    empty(length?: Field): {
        get(index: Field): T;
        set(index: Field, value: T): void;
        toFields(): Field[];
        push(value: T): void;
        pop(n: Field): void;
        concat(other: any): this;
        copy(): this;
        slice(start: Field, end: Field): this;
        insert(index: Field, value: T): void;
        includes(value: T): Bool;
        assertIncludes(value: T): void;
        shiftLeft(n: Field): void;
        shiftRight(n: Field): void;
        hash(): Field;
        maxLength(): number;
        toString(): string;
        indexMask(index: Field): Bool[];
        incrementLength(n: Field): void;
        decrementLength(n: Field): void;
        lengthMask(n: Field): Bool[];
        map(fn: (v: T, i: Field) => T): this;
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    };
    hash(value: T): Field;
    Null(): T;
    fillWithNull(values: T[], length: number): T[];
    _isStruct: true;
    toFields: (value: {
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    }) => import("o1js/dist/node/lib/field").Field[];
    toAuxiliary: (value?: {
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    } | undefined) => any[];
    fromFields: (fields: import("o1js/dist/node/lib/field").Field[]) => {
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    };
    sizeInFields(): number;
    check: (value: {
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    }) => void;
    toInput: (x: {
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    }) => {
        fields?: import("o1js/dist/node/lib/field").Field[] | undefined;
        packed?: [import("o1js/dist/node/lib/field").Field, number][] | undefined;
    };
    toJSON: (x: {
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    }) => {
        length: string;
        values: {
            toFields: {};
            toAuxiliary: {};
            fromFields: {};
            sizeInFields: {};
            check: {};
        }[];
    };
    fromJSON: (x: {
        length: string;
        values: {
            toFields: {};
            toAuxiliary: {};
            fromFields: {};
            sizeInFields: {};
            check: {};
        }[];
    }) => {
        length: import("o1js/dist/node/lib/field").Field;
        values: T[];
    };
};
