import { Field, Mina, PrivateKey, SmartContract, method } from 'o1js';
import { KeyCounterStorage } from '../storages/CommitteeStorage.js';
import { DkgLevel1Witness, PublicKeyStorage } from '../storages/DkgStorage.js';

describe('Storage', () => {
    const keyCounterStorage = new KeyCounterStorage();
    const publicKeyStorage = new PublicKeyStorage();

    it('should manage 1-level MT', async () => {
        let value = Field(123);
        keyCounterStorage.updateRawLeaf({ level1Index: Field(1) }, value);
        let witness = keyCounterStorage.getWitness(Field(1));
        // console.log(witness.f)
        expect(witness.calculateRoot(value).toBigInt()).toEqual(
            keyCounterStorage.root.toBigInt()
        );
    });

    it('should manage 2-level MT', async () => {
        let publicKey = PrivateKey.random().toPublicKey();
        publicKeyStorage.updateRawLeaf(
            { level1Index: Field(1), level2Index: Field(2) },
            publicKey.toGroup()
        );
        let witnesses = publicKeyStorage.getWitness(Field(1), Field(2));
        expect(
            witnesses.level2
                .calculateRoot(
                    PublicKeyStorage.calculateLeaf(publicKey.toGroup())
                )
                .toBigInt()
        ).toEqual(
            publicKeyStorage.level2s[Field(1).toString()].getRoot().toBigInt()
        );
        expect(
            witnesses.level1
                .calculateRoot(
                    publicKeyStorage.level2s[Field(1).toString()].getRoot()
                )
                .toBigInt()
        ).toEqual(publicKeyStorage.root.toBigInt());
    });

    it('should be usable in Smart Contract', async () => {
        class TestContract extends SmartContract {
            @method
            async checkWitness(
                root: Field,
                witness: DkgLevel1Witness,
                leaf: Field
            ) {
                root.assertEquals(witness.calculateRoot(leaf));
            }
        }
        let Local = Mina.LocalBlockchain({ proofsEnabled: true });
        Mina.setActiveInstance(Local);
        await TestContract.analyzeMethods();
    });
});
