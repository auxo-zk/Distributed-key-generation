import fs from 'fs';
import { Config, JSONKey, Key } from '../helper/config.js';
import { ContractList } from '../helper/deploy.js';

async function prepare() {
  let feePayerKey: Key;
  let contracts: ContractList;

  let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  let acc1: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc1'].keyPath, 'utf8')
  );
  let acc2: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc2'].keyPath, 'utf8')
  );
  let acc3: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc3'].keyPath, 'utf8')
  );
  let acc4: JSONKey = JSON.parse(
    fs.readFileSync(configJson.deployAliases['acc3'].keyPath, 'utf8')
  );

  return;
}
