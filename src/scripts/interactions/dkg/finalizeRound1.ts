import { Field, Mina, Provable, PublicKey, Reducer } from 'o1js';
import {
  compile,
  fetchActions,
  fetchZkAppState,
  proveAndSend,
} from '../../helper/deploy.js';
import { prepare } from '../prepare.js';
import {
  CommitteeContract,
  CreateCommittee,
  DKGContract,
  FinalizeRound1,
  ReduceRound1,
  Round1Action,
  Round1Contract,
  UpdateKey,
} from '../../../index.js';
import {
  Level1Witness as DKGLevel1Witness,
  KeyStatusStorage,
  PublicKeyStorage,
  Round1ContributionStorage,
  EMPTY_LEVEL_2_TREE,
} from '../../../contracts/DKGStorage.js';
import {
  Level1MT,
  Level1Witness as CommitteeLevel1Witness,
  SettingStorage,
} from '../../../contracts/CommitteeStorage.js';
import axios from 'axios';
import {
  AddressWitness,
  ReduceStorage,
  ReduceWitness,
  ZkAppRef,
} from '../../../contracts/SharedStorage.js';
import { Round1Input } from '../../../contracts/Round1.js';
import { ZkAppEnum } from '../../../constants.js';

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
  const committeeAddress =
    'B62qiYCgNQhu1KddDQZs7HL8cLqRd683YufYX1BNceZ6BHnC1qfEcJ9';
  const dkgAddress = 'B62qr8z7cT4D5Qq2aH7SabUDbpXEb8EXMCUin26xmcJNQtVu616CNFC';
  const round1Address =
    'B62qmj3E8uH1gqtzvywLvP3aaTSaxby9z8LyvBcK7nNQJ67NQMXRXz8';
  const round1Contract = new Round1Contract(
    PublicKey.fromBase58(round1Address)
  );

  // Fetch storage trees
  const contributionStorage = new Round1ContributionStorage();
  const publicKeyStorage = new PublicKeyStorage();

  const committeeId = Field(3);
  const keyId = Field(0);
  const [committee, round1ZkApp, reduce, setting, keyStatus] =
    await Promise.all([
      (
        await axios.get(
          `https://api.auxo.fund/v0/committees/${Number(committeeId)}`
        )
      ).data,
      (await axios.get('https://api.auxo.fund/v0/storages/round1/zkapps')).data,
      (await axios.get('https://api.auxo.fund/v0/storages/round1/reduce')).data,
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

  // Fetch state and actions
  await Promise.all([
    fetchZkAppState(committeeAddress),
    fetchZkAppState(dkgAddress),
  ]);
  const rawState = (await fetchZkAppState(round1Address)) || [];
  const round1State = {
    zkApps: rawState[0],
    reduceState: rawState[1],
    contributions: rawState[2],
    publicKeys: rawState[3],
  };

  const fromState =
    Field(
      25079927036070901246064867767436987657692091363973573142121686150614948079097n
    );
  const toState =
    Field(
      16430373379658489769673052454264952589697482648247772648883131952836196358172n
    );

  const rawActions = await fetchActions(round1Address, fromState, toState);
  const actions: Round1Action[] = rawActions.map((e) => {
    let action: Field[] = e.actions[0].map((e) => Field(e));
    return Round1Action.fromFields(action);
  });
  actions.map((e) => Provable.log(e));
  const actionHashes: Field[] = rawActions.map((e) => Field(e.hash));
  Provable.log('Action hashes:', actionHashes);

  console.log('FinalizeRound1.firstStep...');
  let proof = await FinalizeRound1.firstStep(
    new Round1Input({
      previousActionState: Field(0),
      action: Round1Action.empty(),
    }),
    Field(committee.threshold),
    Field(committee.numberOfMembers),
    round1State.contributions,
    round1State.publicKeys,
    round1State.reduceState,
    Round1ContributionStorage.calculateLevel1Index({
      committeeId: committeeId,
      keyId: keyId,
    }),
    contributionStorage.getLevel1Witness(
      Round1ContributionStorage.calculateLevel1Index({
        committeeId: committeeId,
        keyId: keyId,
      })
    ),
    publicKeyStorage.getLevel1Witness(
      publicKeyStorage.calculateLevel1Index({
        committeeId: committeeId,
        keyId: keyId,
      })
    )
  );
  console.log('Done');

  contributionStorage.updateInternal(
    Round1ContributionStorage.calculateLevel1Index({
      committeeId: committeeId,
      keyId: keyId,
    }),
    EMPTY_LEVEL_2_TREE()
  );

  publicKeyStorage.updateInternal(
    publicKeyStorage.calculateLevel1Index({
      committeeId: committeeId,
      keyId: keyId,
    }),
    EMPTY_LEVEL_2_TREE()
  );

  for (let i = 0; i < actions.length; i++) {
    let action = actions[i];
    console.log('FinalizeRound1.nextStep...');
    proof = await FinalizeRound1.nextStep(
      new Round1Input({
        previousActionState:
          i == 0 ? Reducer.initialActionState : actionHashes[i - 1],
        action: action,
      }),
      proof,
      contributionStorage.getWitness(
        Round1ContributionStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        Round1ContributionStorage.calculateLevel2Index(Field(action.memberId))
      ),
      publicKeyStorage.getWitness(
        publicKeyStorage.calculateLevel1Index({
          committeeId: action.committeeId,
          keyId: action.keyId,
        }),
        publicKeyStorage.calculateLevel2Index(Field(action.memberId))
      ),
      ReduceWitness.fromJSON(reduce[actionHashes[i].toString()])
    );
    console.log('Done');

    contributionStorage.updateLeaf(
      Round1ContributionStorage.calculateLeaf(action.contribution),
      Round1ContributionStorage.calculateLevel1Index({
        committeeId: action.committeeId,
        keyId: action.keyId,
      }),
      Round1ContributionStorage.calculateLevel2Index(action.memberId)
    );

    publicKeyStorage.updateLeaf(
      PublicKeyStorage.calculateLeaf(action.contribution.C.get(Field(0))),
      PublicKeyStorage.calculateLevel1Index({
        committeeId: action.committeeId,
        keyId: action.keyId,
      }),
      PublicKeyStorage.calculateLevel2Index(action.memberId)
    );
  }

  // Provable.log(
  //   new ZkAppRef({
  //     address: PublicKey.fromBase58(committeeAddress),
  //     witness: AddressWitness.fromJSON(round1ZkApp[ZkAppEnum.COMMITTEE]),
  //   })
  // );
  // Provable.log(
  //   new ZkAppRef({
  //     address: PublicKey.fromBase58(dkgAddress),
  //     witness: AddressWitness.fromJSON(round1ZkApp[ZkAppEnum.DKG]),
  //   })
  // );
  // Provable.log(
  //   setting[Number(SettingStorage.calculateLevel1Index(committeeId))]
  // );
  // Provable.log(
  //   keyStatus[
  //     Number(
  //       KeyStatusStorage.calculateLevel1Index({
  //         committeeId: committeeId,
  //         keyId: keyId,
  //       })
  //     )
  //   ]
  // );

  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      round1Contract.finalize(
        proof,
        new ZkAppRef({
          address: PublicKey.fromBase58(committeeAddress),
          witness: AddressWitness.fromJSON(round1ZkApp[ZkAppEnum.COMMITTEE]),
        }),
        new ZkAppRef({
          address: PublicKey.fromBase58(dkgAddress),
          witness: AddressWitness.fromJSON(round1ZkApp[ZkAppEnum.DKG]),
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
  await proveAndSend(tx, feePayer.key, 'Round1Contract', 'finalize');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
