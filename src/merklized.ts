import { Struct } from 'o1js';
import { StaticArray } from '@auxo-dev/auxo-libs';
import {
    getBestHeight,
    AddressMap as _AddressMap,
    ZkAppRef as _ZkAppRef,
} from '@auxo-dev/zkapp-offchain-storage';
import { ENC_LIMITS, INST_LIMITS } from './constants.js';

export { AddressMap, ZkAppRef };
export {
    CommitteeWitness,
    NewCommitteeWitness,
    EmptyCommitteeMT,
    MemberWitness,
    NewMemberWitness,
    EmptyMemberMT,
    PolyWitness,
    NewPolyWitness,
    EmptyPolyMT,
    KeyWitness,
    NewKeyWitness,
    EmptyKeyMT,
    RequestWitness,
    NewRequestWitness,
    EmptyRequestMT,
    TaskWitness,
    NewTaskWitness,
    EmptyTaskMT,
    CommitmentWitness,
    NewCommitmentWitness,
    EmptyCommitmentMT,
    CipherWitness,
    NewCipherWitness,
    EmptyCipherMT,
    PlainWitness,
    NewPlainWitness,
    EmptyPlainMT,
};
export {
    CommitteeMemberWitness,
    KeyMemberWitness,
    KeyMemberMemberWitness,
    KeyMemberPolyWitness,
    RequestMemberWitness,
    TaskCipherWitness,
    RequestPlainWitness,
    MemberWitnesses,
    CommitmentWitnesses,
    CipherWitnesses,
    PlainWitnesses,
};

const ADDRESS_LIMIT = INST_LIMITS.ADDRESS;
class ZkAppRef extends _ZkAppRef(ADDRESS_LIMIT) {}
class AddressMap extends _AddressMap(ADDRESS_LIMIT) {}

const [CommitteeWitness_, NewCommitteeWitness, EmptyCommitteeMT] =
    getBestHeight(BigInt(INST_LIMITS.COMMITTEE));
class CommitteeWitness extends CommitteeWitness_ {}
const [MemberWitness_, NewMemberWitness, EmptyMemberMT] = getBestHeight(
    BigInt(INST_LIMITS.MEMBER)
);
class MemberWitness extends MemberWitness_ {}
const [PolyWitness_, NewPolyWitness, EmptyPolyMT] = getBestHeight(
    BigInt(INST_LIMITS.THRESHOLD)
);
class PolyWitness extends PolyWitness_ {}
const [KeyWitness_, NewKeyWitness, EmptyKeyMT] = getBestHeight(
    BigInt(INST_LIMITS.KEY)
);
class KeyWitness extends KeyWitness_ {}
const [RequestWitness_, NewRequestWitness, EmptyRequestMT] = getBestHeight(
    BigInt(INST_LIMITS.REQUEST)
);
class RequestWitness extends RequestWitness_ {}
const [TaskWitness_, NewTaskWitness, EmptyTaskMT] = getBestHeight(
    BigInt(INST_LIMITS.TASK)
);
class TaskWitness extends TaskWitness_ {}
const [CommitmentWitness_, NewCommitmentWitness, EmptyCommitmentMT] =
    getBestHeight(BigInt(INST_LIMITS.TASK * 16));
class CommitmentWitness extends CommitmentWitness_ {}
const [CipherWitness_, NewCipherWitness, EmptyCipherMT] = getBestHeight(
    BigInt(ENC_LIMITS.SUB_DIMENSION)
);
class CipherWitness extends CipherWitness_ {}
const [PlainWitness_, NewPlainWitness, EmptyPlainMT] = getBestHeight(
    BigInt(ENC_LIMITS.SUB_DIMENSION)
);
class PlainWitness extends PlainWitness_ {}
class CommitteeMemberWitness extends Struct({
    level1: CommitteeWitness,
    level2: MemberWitness,
}) {}
class KeyMemberWitness extends Struct({
    level1: KeyWitness,
    level2: MemberWitness,
}) {}
class KeyMemberMemberWitness extends Struct({
    level1: KeyWitness,
    level2: MemberWitness,
    level3: MemberWitness,
}) {}
class KeyMemberPolyWitness extends Struct({
    level1: KeyWitness,
    level2: MemberWitness,
    level3: PolyWitness,
}) {}
class RequestMemberWitness extends Struct({
    level1: RequestWitness,
    level2: MemberWitness,
}) {}
class TaskCipherWitness extends Struct({
    level1: TaskWitness,
    level2: CipherWitness,
}) {}
class RequestPlainWitness extends Struct({
    level1: RequestWitness,
    level2: PlainWitness,
}) {}

class MemberWitnesses extends StaticArray(MemberWitness, INST_LIMITS.MEMBER) {}
class CommitmentWitnesses extends StaticArray(
    CommitmentWitness,
    ENC_LIMITS.SUB_DIMENSION
) {}
class CipherWitnesses extends StaticArray(
    CipherWitness,
    ENC_LIMITS.SUB_DIMENSION
) {}
class PlainWitnesses extends StaticArray(
    PlainWitness,
    ENC_LIMITS.SUB_DIMENSION
) {}
