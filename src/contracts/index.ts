import * as Committee from './Committee.js';
import * as CommitteeStorage from './CommitteeStorage.js';

import * as DKG from './DKG.js';
import * as DKGStorage from './DKGStorage.js';

import * as Encryption from './Encryption.js';
import * as Round1 from './Round1.js';
import * as Round2 from './Round2.js';
import * as Response from './Response.js';

import * as Request from './Request.js';
import * as RequestHelper from './RequestHelper.js';
import * as RequestStorage from './RequestStorage.js';

export {
  'ZkApp': {
  Committee,
  DKG,
  Encryption,
  Round1,
  Round2,
  Response,
  Request,
  RequestHelper,
}
};

export const Storage = {
  CommitteeStorage,
  DKGStorage,
  RequestStorage,
};
