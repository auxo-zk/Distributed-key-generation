import { AccountUpdate, Field, PublicKey, SmartContract, TokenId } from 'o1js';
import { INDEX_SIZE } from '../constants.js';

export function updateActionState(state: Field, action: Field[][]) {
    let actionsHash = AccountUpdate.Actions.hash(action);
    return AccountUpdate.Actions.updateSequenceState(state, actionsHash);
}

export function packIndexArray(memberIds: number[]): Field {
    return Field.fromBits(
        memberIds.map((e) => Field(e).toBits(INDEX_SIZE)).flat()
    );
}

export function buildAssertMessage(
    circuit: string,
    method: string,
    errorEnum: string
): string {
    return `${circuit}::${method}: ${errorEnum}`;
}

export function requireSignature(address: PublicKey) {
    AccountUpdate.createSigned(address);
}

export function requireCaller(address: PublicKey, contract: SmartContract) {
    contract.self.body.mayUseToken = AccountUpdate.MayUseToken.ParentsOwnToken;
    let update = AccountUpdate.create(
        contract.address,
        TokenId.derive(address)
    );
    update.body.mayUseToken = AccountUpdate.MayUseToken.InheritFromParent;
    return update;
}
