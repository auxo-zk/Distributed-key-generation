import {
    AddressMap as _AddressMap,
    ZkAppRef as _ZkAppRef,
} from '@auxo-dev/zkapp-offchain-storage';
import { INSTANCE_LIMITS } from '../constants.js';

export { AddressMap, ZkAppRef };

const ADDRESS_LIMIT = INSTANCE_LIMITS.ADDRESS;
const ZkAppRef = _ZkAppRef(ADDRESS_LIMIT);
const AddressMap = _AddressMap(ADDRESS_LIMIT);
