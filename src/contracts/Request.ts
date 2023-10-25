import { assert } from 'node:console';
import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  Group,
  Bool,
  Reducer,
  Permissions,
  MerkleMap,
  MerkleMapWitness,
  Struct,
  Experimental,
  SelfProof,
  Poseidon,
  Mina,
  Provable,
  AccountUpdate,
} from 'o1js';

const EmptyMerkleMap = new MerkleMap();
const RequestFee = 0.1 * 10 ** 9; // 0.1 Mina

export class RequestInput extends Struct({
  committeeId: Field,
  keyId: Field,
  R: Field, // request value
  State: Bool,
}) {
  static empty(): RequestInput {
    return new RequestInput({
      committeeId: Field(0),
      keyId: Field(0),
      R: Field(0),
      State: Bool(false),
    });
  }

  hash(): Field {
    return Poseidon.hash([
      this.committeeId,
      this.keyId,
      this.R,
      this.State.toField(),
    ]);
  }

  requestId(): Field {
    return Poseidon.hash([this.committeeId, this.keyId, this.R]);
  }

  toFields(): Field[] {
    return [this.committeeId, this.keyId, this.R, this.State.toField()];
  }
}

export class Request extends SmartContract {
  // requestId = hash(committeeId, keyId, hash(valueR))
  // -> state: enable to check if request the same data
  // state: 0: not yet requested
  // state: 1: requesting
  // state: !0 and !=1 which is hash(D): request complete
  @state(Field) requestStateRoot = State<Field>();
  // request id -> requester
  @state(Field) requesterRoot = State<Field>();
  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: RequestInput });

  init() {
    super.init();
    this.requestStateRoot.set(EmptyMerkleMap.getRoot());
    this.requesterRoot.set(EmptyMerkleMap.getRoot());
    this.actionState.set(Reducer.initialActionState);
  }

  @method request(requestInput: RequestInput) {
    let actionState = this.actionState.getAndAssertEquals();
    let requestInputHash = requestInput.hash();
    // checking if the request already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: actionState,
      }),
      Bool,
      (state: Bool, action: RequestInput) => {
        return action.hash().equals(requestInputHash).or(state);
      },
      // initial state
      { state: Bool(false), actionState: actionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    /*
    we cant really branch the control flow - we will always have to emit an event no matter what, 
    so we emit an empty event if the RequestInput already exists
    it the RequestInput doesn't exist, emit the "real" RequestInput
    */
    let toEmit = Provable.if(exists, RequestInput.empty(), requestInput);

    this.reducer.dispatch(toEmit);

    // take fee
    let requester = AccountUpdate.createSigned(this.sender);
    requester.send({ to: this, amount: RequestFee });
  }

  @method unRequested(requestInput: RequestInput) {
    let actionState = this.actionState.getAndAssertEquals();
    let requestInputHash = requestInput.hash();
    // checking if the request already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: actionState,
      }),
      Bool,
      (state: Bool, action: RequestInput) => {
        return action.hash().equals(requestInputHash).or(state);
      },
      // initial state
      { state: Bool(false), actionState: actionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    let toEmit = Provable.if(exists, RequestInput.empty(), requestInput);

    this.reducer.dispatch(toEmit);
  }
}
