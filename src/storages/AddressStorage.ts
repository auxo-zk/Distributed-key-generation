import {
    AddressMap as _AddressMap,
    ZkAppRef as _ZkAppRef,
} from '@auxo-dev/zkapp-offchain-storage';
import { INST_LIMITS } from '../constants.js';

export { AddressMap, ZkAppRef };

const ADDRESS_LIMIT = INST_LIMITS.ADDRESS;
class ZkAppRef extends _ZkAppRef(ADDRESS_LIMIT) {}
class AddressMap extends _AddressMap(ADDRESS_LIMIT) {}
