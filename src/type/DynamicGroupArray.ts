import {
  Bool,
  Provable,
  Field,
  Poseidon,
  Struct,
  Experimental,
  Group,
  FlexibleProvable,
} from 'o1js';

export function DynamicGroupArray(maxLength: number) {
  return class _DynamicGroupArray extends Struct({
    length: Field,
    values: Provable.Array(Group, maxLength),
  }) {
    static Null() {
      return Group.fromFields(Array(Group.sizeInFields()).fill(Field(0)));
    }

    static fillWithNull([...values]: Group[], length: number): Group[] {
      for (let i = values.length; i < length; i++) {
        values[i] = _DynamicGroupArray.Null();
      }
      return values;
    }

    static from(values: Group[]): _DynamicGroupArray {
      return new _DynamicGroupArray(values);
    }

    static empty(length?: Field): _DynamicGroupArray {
      const arr = new _DynamicGroupArray();
      arr.length = length ?? Field(0);
      return arr;
    }

    constructor(values?: Group[]) {
      super({
        values: _DynamicGroupArray.fillWithNull(values ?? [], maxLength),
        length: values === undefined ? Field(0) : Field(values.length),
      });
    }

    get(index: Field): Group {
      const mask = this.indexMask(index);
      return Provable.switch(mask, Group, this.values);
    }

    set(index: Field, value: Group): void {
      const mask = this.indexMask(index);
      for (let i = 0; i < this.maxLength(); i++) {
        this.values[i] = Provable.switch([mask[i], mask[i].not()], Group, [
          value,
          this.values[i],
        ]);
      }
    }

    push(value: Group): void {
      this.incrementLength(Field(1));
      this.set(this.length.sub(1), value);
    }

    pop(n: Field): void {
      const mask = this.lengthMask(this.length.sub(n));
      this.decrementLength(n);

      for (let i = 0; i < this.maxLength(); i++) {
        this.values[i] = Provable.switch([mask[i], mask[i].not()], Group, [
          this.values[i],
          _DynamicGroupArray.Null(),
        ]);
      }
    }

    concat(other: this): this {
      const newArr = other.copy();
      newArr.shiftRight(this.length);
      let masked = Bool(true);
      for (let i = 0; i < this.maxLength(); i++) {
        masked = Provable.if(Field(i).equals(this.length), Bool(false), masked);
        newArr.values[i] = Provable.if(
          masked,
          this.values[i],
          newArr.values[i]
        );
      }
      return newArr;
    }

    copy(): this {
      const newArr = new (<any>this.constructor)();
      newArr.values = this.values.slice();
      newArr.length = this.length;
      return newArr;
    }

    slice(start: Field, end: Field): this {
      const newArr = this.copy();
      newArr.shiftLeft(start);
      newArr.pop(newArr.length.sub(end.sub(start)));
      return newArr;
    }

    insert(index: Field, value: Group): void {
      const arr1 = this.slice(Field(0), index);
      const arr2 = this.slice(index, this.length);
      arr2.shiftRight(Field(1));
      arr2.set(Field(0), value);
      const concatArr = arr1.concat(arr2);
      this.values = concatArr.values;
      this.length = concatArr.length;
    }

    includes(value: Group): Bool {
      let result = Field(0);
      for (let i = 0; i < this.maxLength(); i++) {
        result = result.add(
          Provable.if(this.values[i].equals(value), Field(1), Field(0))
        );
      }
      return result.equals(Field(0)).not();
    }

    assertIncludes(value: Group): void {
      this.includes(value).assertTrue();
    }

    shiftLeft(n: Field): void {
      n.equals(this.length).assertFalse();
      this.decrementLength(n);

      const nullArray = _DynamicGroupArray.empty(n);

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
        result[i] = Provable.switch(mask, Group, possibleFieldsAtI);
      }
      this.values = result;
    }

    shiftRight(n: Field): void {
      const nullArray = _DynamicGroupArray.empty(n);
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
        result[i] = Provable.switch(mask, Group, possibleFieldsAtI);
      }
      this.values = result;
    }

    hash(): Field {
      return Poseidon.hash(this.values.map((v) => Group.toFields(v)).flat());
    }

    maxLength(): number {
      return maxLength;
    }

    toString(): string {
      return this.values.slice(0, parseInt(this.length.toString())).toString();
    }

    indexMask(index: Field): Bool[] {
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

    incrementLength(n: Field): void {
      const newLength = this.length.add(n);
      // assert length + n <= maxLength
      let lengthLteMaxLength = Bool(false);
      for (let i = 0; i < this.maxLength() + 1; i++) {
        lengthLteMaxLength = lengthLteMaxLength.or(Field(i).equals(newLength));
      }
      lengthLteMaxLength.assertTrue();
      this.length = newLength;
    }

    decrementLength(n: Field): void {
      this.length = this.length.sub(n);
      // make sure length did not underflow
      let newLengthFound = Bool(false);
      for (let i = 0; i < this.maxLength() + 1; i++) {
        newLengthFound = newLengthFound.or(Field(i).equals(this.length));
      }
      newLengthFound.assertTrue();
    }

    lengthMask(n: Field): Bool[] {
      const mask = [];
      let masked = Bool(true);
      for (let i = 0; i < this.maxLength(); i++) {
        masked = Provable.if(Field(i).equals(n), Bool(false), masked);
        mask[i] = masked;
      }
      return mask;
    }

    map(fn: (v: Group, i: Field) => T): this {
      const newArr = this.copy();
      let masked = Bool(true);
      for (let i = 0; i < newArr.values.length; i++) {
        masked = Provable.if(
          Field(i).equals(newArr.length),
          Bool(false),
          masked
        );
        newArr.values[i] = Provable.if(
          masked,
          fn(newArr.values[i], Field(i)),
          _DynamicGroupArray.Null()
        );
      }
      return newArr;
    }
  };
}
