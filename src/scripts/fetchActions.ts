import {
  PublicKey,
  Mina,
  PrivateKey,
  Field,
  fetchAccount,
  Provable,
} from 'o1js';

const BERKELEY_URL = 'https://api.minascan.io/node/berkeley/v1/graphql',
  ARCHIVE_URL = 'https://api.minascan.io/archive/berkeley/v1/graphql/';

const Berkeley = Mina.Network({
  mina: BERKELEY_URL,
  archive: ARCHIVE_URL,
});
Mina.setActiveInstance(Berkeley);
// console.log('Fetching actions for address: ' + address);

async function lmao() {
  await Mina.fetchActions(
    PublicKey.fromBase58(
      'B62qkPvD5bTCu58GqEHQSnUcVoEMMsYZ4Z2eTigxE98xn3T1awGTbef'
    )
  ).then((actions) => {
    Provable.log(actions);
    if (Array.isArray(actions)) {
      for (let action of actions) {
        Provable.log('action: ', action.actions);
      }
    }
  });
}

lmao();
