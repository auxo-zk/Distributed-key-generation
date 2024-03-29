import { PublicKey, Mina, Field, Provable } from 'o1js';

import { Action as RequestAction } from '../contracts/Request.js';

// const BERKELEY_URL = 'https://api.minascan.io/node/berkeley/v1/graphql',
//   ARCHIVE_URL = 'https://api.minascan.io/archive/berkeley/v1/graphql/';

// const BERKELEY_URL = 'https://proxy.testworld.minaexplorer.com/graphql';
// const ARCHIVE_URL = 'http://stecksoft.2038.io/itn_archive.sql.gz/graphl';

// const BERKELEY_URL = 'http://46.250.228.67:8080/graphql';
// const ARCHIVE_URL = 'http://46.250.228.67:8282';

const BERKELEY_URL = 'https://proxy.berkeley.minaexplorer.com/graphql';
const ARCHIVE_URL = 'https://archive.berkeley.minaexplorer.com';

const Berkeley = Mina.Network({
    mina: BERKELEY_URL,
    archive: ARCHIVE_URL,
});
Mina.setActiveInstance(Berkeley);
// console.log('Fetching actions for address: ' + address);

async function fetchfetch() {
    await Mina.fetchActions(
        PublicKey.fromBase58(
            'B62qo9P9Mh8Rz4GbQSw89e7oQpEY4Y8VdBe5cAvwEp5yzAbt4rYXVgF'
        )
    ).then((actions) => {
        Provable.log(actions);
        if (Array.isArray(actions)) {
            for (let action of actions) {
                Provable.log(
                    'requestAction: ',
                    RequestAction.fromFields(
                        action.actions[0].map((e) => Field(e))
                    )
                );
            }
        }
    });
}

fetchfetch();
