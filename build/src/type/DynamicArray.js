import { Bool, Field, Poseidon, Provable, Struct, } from 'o1js';
export { DynamicArray };
function hashable(type) {
    return {
        ...type,
        hash(x) {
            return Poseidon.hash(type.toFields(x));
        },
        equals(x, other) {
            return this.hash(x).equals(this.hash(other));
        },
    };
}
export default function DynamicArray(type, maxLength) {
    const _type = hashable(type);
    return class _DynamicArray extends Struct({
        length: Field,
        values: Provable.Array(type, maxLength),
    }) {
        static from(values) {
            return new _DynamicArray(values);
        }
        static empty(length) {
            const arr = new _DynamicArray();
            arr.length = length ?? Field(0);
            return arr;
        }
        static hash(value) {
            return Poseidon.hash(type.toFields(value));
        }
        static Null() {
            return type.fromFields(Array(type.sizeInFields()).fill(Field(0)));
        }
        static fillWithNull(values, length) {
            for (let i = values.length; i < length; i++) {
                values[i] = _DynamicArray.Null();
            }
            return values;
        }
        constructor(values) {
            super({
                values: _DynamicArray.fillWithNull(values ?? [], maxLength),
                length: values === undefined ? Field(0) : Field(values.length),
            });
        }
        get(index) {
            const mask = this.indexMask(index);
            return Provable.switch(mask, type, this.values);
        }
        set(index, value) {
            const mask = this.indexMask(index);
            for (let i = 0; i < this.maxLength(); i++) {
                this.values[i] = Provable.switch([mask[i], mask[i].not()], type, [
                    value,
                    this.values[i],
                ]);
            }
        }
        toFields() {
            return this.values.map((v) => type.toFields(v)).flat();
        }
        push(value) {
            this.incrementLength(Field(1));
            this.set(this.length.sub(1), value);
        }
        pop(n) {
            const mask = this.lengthMask(this.length.sub(n));
            this.decrementLength(n);
            for (let i = 0; i < this.maxLength(); i++) {
                this.values[i] = Provable.switch([mask[i], mask[i].not()], type, [
                    this.values[i],
                    _DynamicArray.Null(),
                ]);
            }
        }
        concat(other) {
            const newArr = other.copy();
            newArr.shiftRight(this.length);
            let masked = Bool(true);
            for (let i = 0; i < this.maxLength(); i++) {
                masked = Provable.if(Field(i).equals(this.length), Bool(false), masked);
                newArr.values[i] = Provable.if(masked, type, this.values[i], newArr.values[i]);
            }
            return newArr;
        }
        copy() {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newArr = new this.constructor();
            newArr.values = this.values.slice();
            newArr.length = this.length;
            return newArr;
        }
        slice(start, end) {
            const newArr = this.copy();
            newArr.shiftLeft(start);
            newArr.pop(newArr.length.sub(end.sub(start)));
            return newArr;
        }
        insert(index, value) {
            const arr1 = this.slice(Field(0), index);
            const arr2 = this.slice(index, this.length);
            arr2.shiftRight(Field(1));
            arr2.set(Field(0), value);
            const concatArr = arr1.concat(arr2);
            this.values = concatArr.values;
            this.length = concatArr.length;
        }
        includes(value) {
            let result = Field(0);
            for (let i = 0; i < this.maxLength(); i++) {
                result = result.add(Provable.if(_type.equals(this.values[i], value), Field(1), Field(0)));
            }
            return result.equals(Field(0)).not();
        }
        assertIncludes(value) {
            this.includes(value).assertTrue();
        }
        shiftLeft(n) {
            n.equals(this.length).assertFalse();
            this.decrementLength(n);
            const nullArray = _DynamicArray.empty(n);
            const possibleResults = [];
            const mask = [];
            for (let i = 0; i < this.maxLength(); i++) {
                possibleResults[i] = this.values
                    .slice(i, this.maxLength())
                    .concat(nullArray.values.slice(0, i));
                mask[i] = Field(i).equals(n);
            }
            const result = [];
            for (let i = 0; i < this.maxLength(); i++) {
                const possibleFieldsAtI = possibleResults.map((r) => r[i]);
                result[i] = Provable.switch(mask, type, possibleFieldsAtI);
            }
            this.values = result;
        }
        shiftRight(n) {
            const nullArray = _DynamicArray.empty(n);
            this.incrementLength(n);
            const possibleResults = [];
            const mask = [];
            for (let i = 0; i < this.maxLength(); i++) {
                possibleResults[i] = nullArray.values
                    .slice(0, i)
                    .concat(this.values.slice(0, this.maxLength() - i));
                mask[i] = Field(i).equals(nullArray.length);
            }
            const result = [];
            for (let i = 0; i < this.maxLength(); i++) {
                const possibleFieldsAtI = possibleResults.map((r) => r[i]);
                result[i] = Provable.switch(mask, type, possibleFieldsAtI);
            }
            this.values = result;
        }
        hash() {
            return Poseidon.hash(this.values.map((v) => type.toFields(v)).flat());
        }
        maxLength() {
            return maxLength;
        }
        toString() {
            return this.values.slice(0, parseInt(this.length.toString())).toString();
        }
        indexMask(index) {
            const mask = [];
            let lengthReached = Bool(false);
            for (let i = 0; i < this.maxLength(); i++) {
                lengthReached = Field(i).equals(this.length).or(lengthReached);
                const isIndex = Field(i).equals(index);
                // assert index < length
                isIndex.and(lengthReached).not().assertTrue();
                mask[i] = isIndex;
            }
            return mask;
        }
        incrementLength(n) {
            const newLength = this.length.add(n);
            // assert length + n <= maxLength
            let lengthLteMaxLength = Bool(false);
            for (let i = 0; i < this.maxLength() + 1; i++) {
                lengthLteMaxLength = lengthLteMaxLength.or(Field(i).equals(newLength));
            }
            lengthLteMaxLength.assertTrue();
            this.length = newLength;
        }
        decrementLength(n) {
            this.length = this.length.sub(n);
            // make sure length did not underflow
            let newLengthFound = Bool(false);
            for (let i = 0; i < this.maxLength() + 1; i++) {
                newLengthFound = newLengthFound.or(Field(i).equals(this.length));
            }
            newLengthFound.assertTrue();
        }
        lengthMask(n) {
            const mask = [];
            let masked = Bool(true);
            for (let i = 0; i < this.maxLength(); i++) {
                masked = Provable.if(Field(i).equals(n), Bool(false), masked);
                mask[i] = masked;
            }
            return mask;
        }
        map(fn) {
            const newArr = this.copy();
            let masked = Bool(true);
            for (let i = 0; i < newArr.values.length; i++) {
                masked = Provable.if(Field(i).equals(newArr.length), Bool(false), masked);
                newArr.values[i] = Provable.if(masked, type, fn(newArr.values[i], Field(i)), _DynamicArray.Null());
            }
            return newArr;
        }
    };
}
//# sourceMappingURL=DynamicArray.js.map