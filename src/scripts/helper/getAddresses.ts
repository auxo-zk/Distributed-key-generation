import fs from 'fs';
import path from 'path';

interface KeyData {
    privateKey: string;
    publicKey: string;
}

function readJSONFiles(directoryPath: string): any {
    const publicKeyData: { [filename: string]: any } = {};

    const files = fs.readdirSync(directoryPath);

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        if (file.includes('acc')) continue;
        const filePath = path.join(directoryPath, file);

        const jsonData: KeyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        Object.assign(publicKeyData, {
            [file.replace('.json', '').toUpperCase()]: jsonData.publicKey,
        });
    }

    return publicKeyData;
}

console.log(readJSONFiles('./keys'));
