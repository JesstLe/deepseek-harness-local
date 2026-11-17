import fs from 'node:fs';import assert from 'node:assert/strict';
import {appearanceEmotion} from '../../plugins/naumi-enterprise/assets/bot-appearance-model.js';
const mode=process.argv[2],file=process.argv[3]??(mode==='BASELINE'?'evidence/bot-new-motion/original/bot-task.css':'plugins/naumi-enterprise/assets/bot-task.css');
const css=fs.readFileSync(file,'utf8'),engine=fs.readFileSync('plugins/naumi-enterprise/assets/grok-ball.js','utf8'),count=[...engine.matchAll(/id: '\d{2}'/g)].length,legacy=css.includes('nbt-working');
assert.equal(count,32);assert.equal(appearanceEmotion('running'),'32');assert.equal(legacy,mode!=='MODIFIED');if(mode==='MODIFIED'){assert(!css.includes('.naumi-bot-avatar::after'));assert(fs.readFileSync('plugins/naumi-enterprise/assets/bot-avatar-runtime.js','utf8').includes('prefers-reduced-motion'));}
console.log(`${mode} legacy_frame=${legacy} emotions=${count} running=32`);
