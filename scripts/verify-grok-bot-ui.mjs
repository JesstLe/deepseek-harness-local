import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
const out=path.resolve('evidence/grok-bot');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1100,height:900},colorScheme:'light'}),errors=[],checks=[];
const check=(name,value)=>{assert(value,name);checks.push(name);console.log('UI_PASS '+name);};page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(pathToFileURL(path.resolve('design/naumi-grok-bot/index.html')).href);await page.waitForFunction(()=>!!window.hero);
 check('upstream_32_emotions',await page.locator('#emotion option').count()===32);
 const matrices=await page.evaluate(()=>{let frames=0;const sandbox=document.createElement('div');sandbox.style.cssText='width:140px;height:140px';document.body.appendChild(sandbox);for(const form of NaumiBot.forms)for(const palette of NaumiBot.palettes){const bot=NaumiBot.create(sandbox,{appearance:{shape:form.id,palette:palette.id},autostart:false});for(const emotion of GrokBall.EMOTIONS){bot.setEmotion(emotion.id);if(/NaN|Infinity/.test(bot.engine.ball.svg.outerHTML))throw Error('Invalid geometry '+form.id+'/'+palette.id+'/'+emotion.id);frames++;}bot.destroy();if(sandbox.childElementCount)throw Error('Leaked SVG');}sandbox.remove();return frames;});
 check('64_combinations_x_32_emotions_valid',matrices===2048);
 await page.selectOption('#emotion','02');const a=await page.locator('#hero svg path').nth(1).getAttribute('transform');await page.mouse.move(1090,15);await page.waitForTimeout(300);const b=await page.locator('#hero svg path').nth(1).getAttribute('transform');check('pointer_gaze_moves_eyes',a!==b);
 await page.getByRole('button',{name:'自旋',exact:true}).click();await page.waitForTimeout(300);check('spin_has_3d_ribbons',await page.locator('#hero svg defs linearGradient').count()>0);
 check('back_facing_eyes_and_badges_hidden',await page.evaluate(()=>{const engine=hero.engine,pose=structuredClone(engine._lastPose);pose.body.yaw=Math.PI;engine.ball.applyPose(pose);const decor=engine.ball.svg.querySelector('[data-bot-accessory]').parentElement,body=decor.parentElement;return body.children[1].style.display==='none'&&body.children[2].style.display==='none'&&decor.getAttribute('opacity')==='0';}));
 await page.selectOption('#emotion','33');await page.waitForTimeout(80);check('completion_spawns_particles',await page.locator('#hero svg').evaluate(svg=>svg.lastElementChild.children.length>3));
 for(const form of ['planner','executor','guardian','creator','analyst','coordinator','observer','researcher'])await page.locator('.role[data-shape="'+form+'"]').click();
 for(const palette of ['pink','teal','slate','blue'])await page.locator('[data-palette="'+palette+'"]').click();
 check('switches_destroy_old_instances',await page.evaluate(()=>NaumiBot.diagnostics().instances===11&&NaumiBot.diagnostics().pointerListeners===1));
 await page.selectOption('#emotion','02');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);check('reduced_motion_stops_all_raf_instances',await page.evaluate(()=>NaumiBot.diagnostics().active===0));
 await page.screenshot({path:path.join(out,'bot-presets.png'),fullPage:true});
 await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(80);check('narrow_no_horizontal_overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'bot-presets-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1100,height:900});await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(80);
 // Real browser-rendered animation frames, not a CSS/static representation.
 const framesDir=path.join(out,'motion-frames');fs.mkdirSync(framesDir,{recursive:true});await page.selectOption('#emotion','30');await page.getByRole('button',{name:'自旋',exact:true}).click();for(let i=0;i<24;i++){await page.locator('.hero').screenshot({path:path.join(framesDir,String(i).padStart(3,'0')+'.png')});await page.waitForTimeout(70);}
 await page.evaluate(()=>disposePreview());check('destroy_releases_instances_and_pointer_listener',await page.evaluate(()=>NaumiBot.diagnostics().instances===0&&NaumiBot.diagnostics().pointerListeners===0));check('no_browser_errors',errors.length===0);
 fs.writeFileSync(path.join(out,'UI_VERIFICATION.json'),JSON.stringify({status:'PASS',tier:'real Chromium standalone offline preview; 2048 rendered shape/color/emotion states, actual pointer/spin/particles and lifecycle; not live business acceptance',checks,errors},null,2)+'\n');console.log('UI_COMPLETE checks='+checks.length+' rendered_states='+matrices+' errors='+errors.length);
}catch(e){await page.screenshot({path:path.join(out,'ui-failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
