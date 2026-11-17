// Run via ego-browser nodejs -e "await import('file:///.../scripts/verify-desktop-updates-ui.mjs')"
import fs from 'node:fs';import path from 'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'evidence/desktop-updates');
const existing=(await listTaskSpaces()).find(s=>s.name==='Naumi 更新入口验收'),task=existing?await taskSpace(existing.id):await taskSpace('Naumi 更新入口验收'),page=(await task.pages())[0];
fs.writeFileSync(path.join(out,'browser-space.json'),JSON.stringify({id:task.spaceId}));
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});
await page.goto(pathToFileURL(path.join(out,'fixture.html')).href);await page.waitForSelector('button[aria-label="检查更新"]');
console.log({taskSpaceId:task.spaceId});console.log(await page.snapshot());
