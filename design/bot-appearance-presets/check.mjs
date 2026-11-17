import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const mode=process.argv[2],file=process.argv[3]??(mode==='BASELINE'?'./ORIGINAL_FILE.mjs':'./MODIFIED_FILE.mjs');
const api=await import(pathToFileURL(new URL(file,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')));
if(mode==='BASELINE'||mode==='ROLLBACK'){
 const tones=new Set(Array.from({length:100},(_,i)=>api.botTone('bot-'+i)));
 assert.equal(tones.size,4);assert.equal(api.botTone('stable'),api.botTone('stable'));
 console.log(`${mode} tones=4 stable=true restored=${mode==='ROLLBACK'}`);
}else{
 const {SHAPES,PALETTES,combinations,avatarSVG,resolveAppearance}=api,all=combinations();
 assert.equal(SHAPES.length,6);assert.equal(PALETTES.length,8);assert.equal(all.length,48);
 assert.equal(new Set(all.map(a=>JSON.stringify(a))).size,48);
 assert.equal(new Set(all.map((a,i)=>avatarSVG(a,{uid:'case-'+i}))).size,48);
 for(const a of all){assert.deepEqual(resolveAppearance({id:'x',appearance:a}),a);assert(avatarSVG(a).includes('<path'));}
 assert.deepEqual(resolveAppearance({id:'stable'}),resolveAppearance({id:'stable'}));
 assert.equal(new Set(Array.from({length:10000},(_,i)=>JSON.stringify(resolveAppearance({id:'bot-'+i})))).size,48);
 assert.deepEqual(resolveAppearance({id:'stable',appearance:{shape:'invalid',palette:'invalid'}}),resolveAppearance({id:'stable'}));
 assert.throws(()=>avatarSVG({shape:'bad',palette:'sky'}),/INVALID/);
 assert.throws(()=>avatarSVG(all[0],{uid:'" onload="bad'}),/INVALID/);
 assert.throws(()=>avatarSVG(all[0],{size:NaN}),/INVALID/);
 assert(!avatarSVG(all[0],{label:'<script>&"'}).includes('<script>'));
 console.log('MODIFIED shapes=6 palettes=8 combinations=48 unique=48 stable=true validation=pass');
}
