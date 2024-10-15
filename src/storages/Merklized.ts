import { getBestHeight } from '@auxo-dev/zkapp-offchain-storage';
import { ENC_LIMITS, INST_LIMITS } from '../constants';
import { Struct } from 'o1js';
import { DynamicArray } from '@auxo-dev/auxo-libs';

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
    DimensionWitness,
    NewDimensionWitness,
    EmptyDimensionMT,
    SplitWitness,
    NewSplitWitness,
    EmptySplitMT,
};

export {
    CommitteeMemberWitness,
    KeyMemberWitness,
    KeyMemberMemberWitness,
    KeyMemberPolyWitness,
    RequestMemberWitness,
    MemberWitnesses,
};

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
const [DimensionWitness_, NewDimensionWitness, EmptyDimensionMT] =
    getBestHeight(BigInt(ENC_LIMITS.DIMENSION));
class DimensionWitness extends DimensionWitness_ {}
const [SplitWitness_, NewSplitWitness, EmptySplitMT] = getBestHeight(
    BigInt(ENC_LIMITS.SPLIT)
);
class SplitWitness extends SplitWitness_ {}

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
class MemberWitnesses extends DynamicArray(MemberWitness, INST_LIMITS.MEMBER) {}
