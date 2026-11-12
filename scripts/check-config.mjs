import fs from 'node:fs';
const path = process.argv[2];
const config = JSON.parse(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
if (config.host !== '127.0.0.1' || config.port !== 3080) throw Error('Unexpected listener');
console.log(JSON.stringify(config));
