import fs from 'fs/promises';
import {
    SecretPolynomial,
    generateRandomPolynomial,
} from '../../../libs/Committee.js';
import { Scalar } from 'o1js';

async function main() {
    const T = 3,
        N = 3;
    const filename = `mock/secrets-${T}-${N}.json`;
    let data: {
        secrets: SecretPolynomial[];
        randoms: Scalar[][];
    } = {
        secrets: [],
        randoms: [],
    };
    for (let i = 0; i < N; i++) {
        let secret = generateRandomPolynomial(T, N);
        data.secrets.push(secret);
        let randoms = [...Array(N)].map(() => Scalar.random());
        data.randoms.push(randoms);
    }
    let writeData = {
        secrets: data.secrets,
        randoms: data.randoms,
    };
    await fs.writeFile(filename, JSON.stringify(writeData));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
