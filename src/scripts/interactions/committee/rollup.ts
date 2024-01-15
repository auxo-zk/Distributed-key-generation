import { Field, Mina, Provable, PublicKey, Reducer, fetchAccount } from 'o1js';
import 'dotenv/config.js';
import { compile, proveAndSend, wait } from '../../helper/deploy.js';
import { fetchActions, fetchZkAppState } from '../../helper/deploy.js';
import {
  CommitteeAction,
  CommitteeContract,
  CreateCommittee,
} from '../../../contracts/Committee.js';
import axios from 'axios';
import { MemberArray } from '../../../libs/Committee.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import {
  EMPTY_LEVEL_2_TREE,
  MemberStorage,
  SettingStorage,
} from '../../../contracts/CommitteeStorage.js';
import { COMMITTEE_MAX_SIZE } from '../../../constants.js';
import { prepare } from '../prepare.js';

async function main() {
  // Prepare for interactions
  const { cache, feePayer } = await prepare();

  // Custom values
  const fromState =
    Field(
      26089382628273984114009748697325178716021230220334200340522908388853527750250n
    );
  const toState = undefined;

  // Compile programs
  await compile(CreateCommittee, cache);
  await compile(CommitteeContract, cache);
  const committeeAddress = process.env.BERKELEY_COMMITTEE_ADDRESS as string;
  console.log('Committee address:', committeeAddress);
  const committeeContract = new CommitteeContract(
    PublicKey.fromBase58(committeeAddress)
  );

  // Fetch on-chain states
  const rawState = (await fetchZkAppState(committeeAddress)) || [];
  const committeeState = {
    nextCommitteeId: Field(rawState[0]),
    committeeTreeRoot: Field(rawState[1]),
    settingTreeRoot: Field(rawState[2]),
    actionState: Field(rawState[3]),
  };
  Provable.log('Committee states:', committeeState);

  // Fetch off-chain storages
  const committees = (await axios.get('https://api.auxo.fund/v0/committees/'))
    .data;

  // Build off-chain storage trees
  let memberStorage = new MemberStorage();
  let settingStorage = new SettingStorage();
  committees
    .filter((e: any) => e.active)
    .map((committee: any) => {
      console.log(`Adding committee ${committee.committeeId} to storage...`);
      let level2Tree = EMPTY_LEVEL_2_TREE();
      for (let i = 0; i < committee.numberOfMembers; i++) {
        level2Tree.setLeaf(
          BigInt(i),
          MemberArray.hash(PublicKey.fromBase58(committee.publicKeys[i]))
        );
      }
      memberStorage.updateInternal(Field(committee.committeeId), level2Tree);
      settingStorage.updateLeaf(
        SettingStorage.calculateLeaf({
          T: Field(committee.threshold),
          N: Field(committee.numberOfMembers),
        }),
        Field(committee.committeeId)
      );
      console.log('Done');
    });

  // Fetch actions
  const rawActions = await fetchActions(committeeAddress, fromState, toState);
  const actions: CommitteeAction[] = rawActions.map((e) => {
    let action: Field[] = e.actions[0].map((e) => Field(e));
    return new CommitteeAction({
      addresses: MemberArray.fromFields(
        action.slice(0, COMMITTEE_MAX_SIZE * 2 + 1)
      ),
      threshold: Field(action[COMMITTEE_MAX_SIZE * 2 + 1]),
      ipfsHash: IPFSHash.fromFields(action.slice(COMMITTEE_MAX_SIZE * 2 + 2)),
    });
  });
  console.log('Actions:');
  actions.map((e) => Provable.log(e));

  // Prepare proofs
  console.log('CreateCommittee.firstStep...');
  let proof = await CreateCommittee.firstStep(
    committeeState.actionState,
    committeeState.committeeTreeRoot,
    committeeState.settingTreeRoot,
    committeeState.nextCommitteeId
  );
  console.log('Done');

  const reduceActions = actions;

  for (let i = 0; i < reduceActions.length; i++) {
    let action = reduceActions[i];
    console.log(`${i} - CreateCommittee.nextStep...`);
    let memberWitness = memberStorage.getLevel1Witness(
      MemberStorage.calculateLevel1Index(
        Field(i).add(committeeState.nextCommitteeId)
      )
    );
    let storageWitness = settingStorage.getWitness(
      SettingStorage.calculateLevel1Index(
        Field(i).add(committeeState.nextCommitteeId)
      )
    );

    proof = await CreateCommittee.nextStep(
      proof,
      new CommitteeAction(action),
      memberWitness,
      storageWitness
    );
    console.log('Done');

    let level2Tree = EMPTY_LEVEL_2_TREE();
    for (let i = 0; i < Number(action.addresses.length); i++) {
      level2Tree.setLeaf(
        BigInt(i),
        MemberArray.hash(action.addresses.get(Field(i)))
      );
    }

    memberStorage.updateInternal(
      MemberStorage.calculateLevel1Index(
        Field(i).add(committeeState.nextCommitteeId)
      ),
      level2Tree
    );
    settingStorage.updateLeaf(
      settingStorage.calculateLeaf({
        T: action.threshold,
        N: action.addresses.length,
      }),
      SettingStorage.calculateLevel1Index(
        Field(i).add(committeeState.nextCommitteeId)
      )
    );
  }

  // Prove and submit tx
  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      committeeContract.rollupIncrements(proof);
    }
  );
  await proveAndSend(tx, feePayer.key, 'CommitteeContract', 'rollupIncrements');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
