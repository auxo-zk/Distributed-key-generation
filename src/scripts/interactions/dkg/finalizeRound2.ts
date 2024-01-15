import { Field, Group, Mina, Provable, PublicKey, Reducer } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import {
  BatchEncryption,
  CommitteeContract,
  CreateCommittee,
  DKGContract,
  FinalizeRound1,
  FinalizeRound2,
  ReduceRound1,
  Round1Contract,
  Round2Action,
  Round2Contract,
  UpdateKey,
} from '../../../index.js';
import {
  Level1Witness as DKGLevel1Witness,
  KeyStatusStorage,
  EMPTY_LEVEL_2_TREE,
  Round2ContributionStorage,
  EncryptionStorage,
} from '../../../contracts/DKGStorage.js';
import {
  Level1Witness as CommitteeLevel1Witness,
  SettingStorage,
} from '../../../contracts/CommitteeStorage.js';
import axios from 'axios';
import {
  AddressWitness,
  ReduceWitness,
  ZkAppRef,
} from '../../../contracts/SharedStorage.js';
import { ZkAppEnum } from '../../../constants.js';
import { ReduceRound2, Round2Input } from '../../../contracts/Round2.js';
import {
  EncryptionHashArray,
  Round2Contribution,
  UArray,
  cArray,
} from '../../../libs/Committee.js';
import { Bit255 } from '@auxo-dev/auxo-libs';

async function main() {
  const { cache, feePayer } = await prepare();

  // Compile programs
  await compile(CreateCommittee, cache);
  await compile(CommitteeContract, cache);
  await compile(UpdateKey, cache);
  await compile(DKGContract, cache);
  await compile(ReduceRound1, cache);
  await compile(FinalizeRound1, cache);
  await compile(Round1Contract, cache);
  await compile(ReduceRound2, cache);
  await compile(BatchEncryption, cache);
  await compile(FinalizeRound2, cache);
  await compile(Round2Contract, cache);
  const committeeAddress =
    'B62qjDLMhAw54JMrJLNZsrBRcoSjbQHQwn4ryceizpsQi8rwHQLA6R1';
  const dkgAddress = 'B62qogHpAHHNP7PXAiRzHkpKnojERnjZq34GQ1PjjAv5wCLgtbYthAS';
  const round1Address =
    'B62qony53NMnmq49kxhtW1ttrQ8xvr58SNoX5jwgPY17pMChKLrjjWc';
  const round2Address =
    'B62qpvKFv8ey9FhsGAdcXxkg8yg1vZJQGoB2EySqJDZdANwP6Mh8SZ7';
  const round2Contract = new Round2Contract(
    PublicKey.fromBase58(round2Address)
  );

  // Fetch storage trees
  const contributionStorage = new Round2ContributionStorage();
  const encryptionStorage = new EncryptionStorage();

  const committeeId = Field(0);
  const keyId = Field(0);
  const [committees, committee, round2ZkApp, reduce, setting, keyStatus] =
    await Promise.all([
      (await axios.get(`https://api.auxo.fund/v0/committees/`)).data,
      (
        await axios.get(
          `https://api.auxo.fund/v0/committees/${Number(committeeId)}`
        )
      ).data,
      (await axios.get('https://api.auxo.fund/v0/storages/round2/zkapps')).data,
      (await axios.get('https://api.auxo.fund/v0/storages/round2/reduce')).data,
      (
        await axios.get(
          'https://api.auxo.fund/v0/storages/committee/setting/level1'
        )
      ).data,
      (
        await axios.get(
          'https://api.auxo.fund/v0/storages/dkg/key-status/level1'
        )
      ).data,
    ]);

  const keys = await Promise.all(
    [...Array(committees.length).keys()].map(
      async (e) =>
        (
          await axios.get(`https://api.auxo.fund/v0/committees/${e}/keys`)
        ).data
    )
  );

  keys.map((e: any, id: number) => {
    if (e.length == 0) return;
    e.map((key: any) => {
      if (key.status <= 2) return;
      console.log(
        `Adding key ${key.keyId} of committee ${key.committeeId} to storage...`
      );
      let contributionLevel2Tree = EMPTY_LEVEL_2_TREE();
      let encryptionLevel2Tree = EMPTY_LEVEL_2_TREE();
      for (let i = 0; i < key.round2s.length; i++) {
        contributionLevel2Tree.setLeaf(
          Round2ContributionStorage.calculateLevel2Index(
            Field(key.round1s[i].memberId)
          ).toBigInt(),
          Round2ContributionStorage.calculateLeaf(
            new Round2Contribution({
              c: new cArray(
                key.round2s[i].contribution.c.map((e: any) =>
                  Bit255.fromBigInt(e)
                )
              ),
              U: new UArray(
                key.round2s[i].contribution.c.map((e: any) =>
                  Group.from(e.x, e.y)
                )
              ),
            })
          )
        );
        encryptionLevel2Tree.setLeaf(
          EncryptionStorage.calculateLevel2Index(
            Field(key.round1s[i].memberId)
          ).toBigInt(),
          EncryptionStorage.calculateLeaf({
            contributions: key.round2s[i].map(
              (item: any) =>
                new Round2Contribution({
                  c: new cArray(
                    key.round2s[i].contribution.c.map((e: any) =>
                      Bit255.fromBigInt(e)
                    )
                  ),
                  U: new UArray(
                    key.round2s[i].contribution.c.map((e: any) =>
                      Group.from(e.x, e.y)
                    )
                  ),
                })
            ),
            memberId: Field(i),
          })
        );
      }
      contributionStorage.updateInternal(
        Round2ContributionStorage.calculateLevel1Index({
          committeeId: Field(key.committeeId),
          keyId: Field(key.keyId),
        }),
        contributionLevel2Tree
      );
      encryptionStorage.updateInternal(
        EncryptionStorage.calculateLevel1Index({
          committeeId: Field(key.committeeId),
          keyId: Field(key.keyId),
        }),
        encryptionLevel2Tree
      );
      console.log('Done');
    });
  });

  // Fetch state and actions
  await Promise.all([
    fetchZkAppState(committeeAddress),
    fetchZkAppState(dkgAddress),
    fetchZkAppState(round1Address),
  ]);
  const rawState = (await fetchZkAppState(round2Address)) || [];
  const round2State = {
    zkApps: rawState[0],
    reduceState: rawState[1],
    contributions: rawState[2],
    encryptions: rawState[3],
  };
  Provable.log(round2State);

  const fromState =
    Field(
      25079927036070901246064867767436987657692091363973573142121686150614948079097n
    );
  const toState = undefined;

  const previousHashes = [
    Field(
      25079927036070901246064867767436987657692091363973573142121686150614948079097n
    ),
    Field(
      21129041599995988206620938582898623513674001131404710125933545827931377692037n
    ),
  ];

  const currentHashes = [
    Field(
      21129041599995988206620938582898623513674001131404710125933545827931377692037n
    ),
    Field(
      2950985295131352328349196989984342832680400793321473398895433393360534242666n
    ),
  ];

  const rawActions = (
    await fetchActions(round2Address, fromState, toState)
  ).filter((action) =>
    currentHashes.map((e) => e.toString()).includes(action.hash)
  );
  const actions: Round2Action[] = rawActions.map((e) => {
    let action: Field[] = e.actions[0].map((e) => Field(e));
    return Round2Action.fromFields(action);
  });
  console.log('Finalizing Actions:');
  actions.map((e) => Provable.log(e));

  console.log('FinalizeRound2.firstStep...');
  let initialHashArray = new EncryptionHashArray(
    [...Array(committee.numberOfMembers).keys()].map(() => Field(0))
  );
  let proof = await FinalizeRound2.firstStep(
    new Round2Input({
      previousActionState: Field(0),
      action: Round2Action.empty(),
    }),
    Field(committee.threshold),
    Field(committee.numberOfMembers),
    round2State.contributions,
    round2State.reduceState,
    Round2ContributionStorage.calculateLevel1Index({
      committeeId: committeeId,
      keyId: keyId,
    }),
    initialHashArray,
    contributionStorage.getLevel1Witness(
      Round2ContributionStorage.calculateLevel1Index({
        committeeId: committeeId,
        keyId: keyId,
      })
    )
  );
  console.log('Done');

  contributionStorage.updateInternal(
    Round2ContributionStorage.calculateLevel1Index({
      committeeId: committeeId,
      keyId: keyId,
    }),
    EMPTY_LEVEL_2_TREE()
  );

  encryptionStorage.updateInternal(
    EncryptionStorage.calculateLevel1Index({
      committeeId: committeeId,
      keyId: keyId,
    }),
    EMPTY_LEVEL_2_TREE()
  );

  for (let i = 0; i < actions.length; i++) {
    let action = actions[i];
    console.log('FinalizeRound2.nextStep...');
    proof = await FinalizeRound2.nextStep(
      new Round2Input({
        previousActionState: previousHashes[Number(action.memberId)],
        action: action,
      }),
      proof,
      contributionStorage.getWitness(
        Round2ContributionStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        Round2ContributionStorage.calculateLevel2Index(action.memberId)
      ),
      ReduceWitness.fromJSON(
        reduce[currentHashes[Number(action.memberId)].toString()]
      )
    );
    console.log('Done');

    contributionStorage.updateLeaf(
      Round2ContributionStorage.calculateLeaf(action.contribution),
      Round2ContributionStorage.calculateLevel1Index({
        committeeId: action.committeeId,
        keyId: action.keyId,
      }),
      Round2ContributionStorage.calculateLevel2Index(action.memberId)
    );

    encryptionStorage.updateLeaf(
      EncryptionStorage.calculateLeaf({
        contributions: actions.map((e) => e.contribution),
        memberId: action.memberId,
      }),
      EncryptionStorage.calculateLevel1Index({
        committeeId: action.committeeId,
        keyId: action.keyId,
      }),
      EncryptionStorage.calculateLevel2Index(action.memberId)
    );
  }

  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      round2Contract.finalize(
        proof,
        encryptionStorage.getLevel1Witness(
          EncryptionStorage.calculateLevel1Index({
            committeeId: committeeId,
            keyId: keyId,
          })
        ),
        new ZkAppRef({
          address: PublicKey.fromBase58(committeeAddress),
          witness: AddressWitness.fromJSON(round2ZkApp[ZkAppEnum.COMMITTEE]),
        }),
        new ZkAppRef({
          address: PublicKey.fromBase58(dkgAddress),
          witness: AddressWitness.fromJSON(round2ZkApp[ZkAppEnum.DKG]),
        }),
        CommitteeLevel1Witness.fromJSON(
          setting[Number(SettingStorage.calculateLevel1Index(committeeId))]
        ),
        DKGLevel1Witness.fromJSON(
          keyStatus[
            Number(
              KeyStatusStorage.calculateLevel1Index({
                committeeId: committeeId,
                keyId: keyId,
              })
            )
          ]
        )
      );
    }
  );
  await proveAndSend(tx, feePayer.key, 'FinalizeRound2', 'finalize');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });