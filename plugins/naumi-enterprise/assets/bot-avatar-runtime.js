import './grok-ball.js';
import {BOT_FORMS,BOT_PALETTES,botAppearance,appearanceEmotion} from './bot-appearance-model.js';

// Upstream engine is byte-for-byte pinned. Only silhouette/idle eye geometry is adapted.
const NS='http://www.w3.org/2000/svg',C=114.2705,forms=new Map(),live=new Set();
const node=(tag,attrs,parent)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent?.appendChild(n);return n;};
function sample(path){const n=node('path',{d:path}),length=n.getTotalLength();return Array.from({length:128},(_,i)=>{const p=n.getPointAtLength(i*length/128);return [p.x,p.y];});}
const ellipse=(x,y,rx,ry)=>Array.from({length:48},(_,i)=>{const a=i/48*Math.PI*2;return [x+rx*Math.cos(a),y+ry*Math.sin(a)];});
function ring48(path){const ring=sample(path);return Array.from({length:48},(_,i)=>ring[Math.floor(i*128/48)]);}
function geometry(form){
 if(forms.has(form.id))return forms.get(form.id);
 const RD=window.EB_RINGS;
 RD.SHAPES['naumi-'+form.id]={ring:sample(form.path),face:{x:0,y:0,sx:1,sy:1,eye:1}};
 let eyes;
 if(form.eyes==='focused')eyes=[ring48('M66 100L103 109L101 135Q98 153 84 150Q68 148 67 127Z'),ring48('M131 109L169 96L166 129Q165 148 150 148Q133 147 133 128Z')];
 else if(form.eyes==='happy')eyes=[ring48('M49 125Q71 86 94 125Q95 135 85 133Q71 110 58 133Q48 136 49 125Z'),ring48('M121 125Q144 86 167 125Q168 135 158 133Q144 110 131 133Q120 135 121 125Z')];
 else if(form.eyes==='wink')eyes=[ellipse(91,117,19,28),ring48('M158 94Q166 90 168 99L148 116L168 123Q174 130 166 135L135 124Q128 118 134 112Z')];
 else if(form.eyes==='round')eyes=[ellipse(85,120,18,25),ellipse(148,115,19,26)];
 else eyes=[ellipse(84,118,17,26),ellipse(139,114,18,27)];
 const index=RD.EXPRESSIONS.push(eyes)-1,result={index};forms.set(form.id,result);return result;
}
function accessories(group,form,color){
 const g=node('g',{'data-bot-accessory':form.badge,fill:'none',stroke:'#FFFFFF','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round'},group);
 const path=d=>{if(['trend','wrench','link'].includes(form.badge))node('path',{d,stroke:color,'stroke-width':17},g);return node('path',{d},g);};
 if(form.badge==='glasses'){node('circle',{cx:79,cy:119,r:36,'stroke-width':6},g);node('circle',{cx:158,cy:112,r:36,'stroke-width':6},g);path('M115 114L122 113M43 122L22 126M194 108L215 103');}
 if(form.badge==='trend')path('M147 55L166 34L184 48L211 17M188 20L214 13L211 39');
 if(form.badge==='wrench')path('M169 190L190 170C179 151 197 136 213 143L202 154L211 163L223 152C232 169 213 188 197 180L179 202Q168 208 161 199Z');
 if(form.badge==='shield'){node('path',{d:'M177 153L208 143L239 153V177Q234 204 208 218Q182 206 177 177Z',fill:color},g);path('M195 180L205 190L223 170');}
 if(form.badge==='sparkle'){node('path',{d:'M211 3Q216 24 234 29Q215 34 211 55Q207 34 189 29Q206 24 211 3Z',fill:color,stroke:'none'},g);}
 if(form.badge==='chart'){node('rect',{x:148,y:146,width:82,height:76,rx:12,fill:color,stroke:'none'},g);[0,1,2].forEach((i)=>node('rect',{x:156+i*24,y:190-i*15,width:16,height:26+i*15,rx:3,fill:'#fff',stroke:'none'},g));}
 if(form.badge==='link')path('M170 180L188 161Q199 150 209 161Q219 171 209 181L194 196M186 192L168 210Q157 220 147 210Q138 200 147 190L161 176M166 195L188 173');
 if(form.badge==='radar'){node('circle',{cx:202,cy:194,r:37,fill:color,'stroke-width':6},g);node('circle',{cx:202,cy:194,r:26,'stroke-width':4},g);path('M186 204A21 21 0 0 1 218 180M202 194L224 168');}
 const accent=node('g',{stroke:color,'stroke-width':8,'stroke-linecap':'round'},group);
 if(form.id==='observer'){node('path',{d:'M183 24Q206 27 215 48M187 3Q222 9 235 39',fill:'none'},accent);}
 else if(form.id==='creator')node('path',{d:'M21 16L25 24M1 29L8 34',fill:'none'},accent);
 else if(form.id!=='planner')node('path',{d:'M189 16L194 3M207 25L218 15M215 40L229 36',fill:'none'},accent);
 return [g,accent];
}

// One document pointer listener for every live instance; the upstream has one shared rAF.
function pointer(event){for(const record of live){if(!record.active)continue;const r=record.mount.getBoundingClientRect();if(!r.width||!r.height)continue;record.engine.setGaze((event.clientX-r.left-r.width/2)/(r.width/2),(event.clientY-r.top-r.height/2)/(r.height/2));}}
function clear(){for(const r of live)r.engine.clearGaze();}
function visibility(){for(const r of live)r.sync();}
function attach(record){if(!live.size){window.addEventListener('pointermove',pointer,{passive:true});document.addEventListener('pointerleave',clear);document.addEventListener('visibilitychange',visibility);}live.add(record);}
function detach(record){live.delete(record);if(!live.size){window.removeEventListener('pointermove',pointer);document.removeEventListener('pointerleave',clear);document.removeEventListener('visibilitychange',visibility);}}

export function createNaumiBot(mount,options={}){
 const appearance=botAppearance({id:options.id??'preview',appearance:options.appearance}),form=BOT_FORMS.find(f=>f.id===appearance.shape),palette=BOT_PALETTES.find(p=>p.id===appearance.palette),geo=geometry(form);
 const engine=window.GrokBall.create(mount,{shape:'naumi-'+form.id,color:palette.color,eyeColor:'#FFFFFF',eyeScale:options.eyeScale??1,emotion:options.emotion??appearanceEmotion(options.state),autostart:false,lite:options.lite??options.autostart===false,label:options.label??form.name});
 const svg=engine.ball.svg,body=svg.children[2],left=body.children[1],right=body.children[2];
 svg.dataset.botShape=form.id;svg.dataset.botPalette=palette.id;
 const shadow=node('ellipse',{cx:C,cy:224,rx:88,ry:11,fill:'#7B7FAD',opacity:'.16'},svg);svg.insertBefore(shadow,svg.children[1]);
 const decor=node('g',{},body),[badge,accent]=accessories(decor,form,palette.color);
 const pupils=(form.eyes==='round'||form.eyes==='wink')?[node('circle',{cx:form.eyes==='wink'?99:93,cy:form.eyes==='wink'?106:108,r:9,fill:palette.color},body),...(form.eyes==='round'?[node('circle',{cx:157,cy:103,r:10,fill:palette.color},body)]:[])]:[];
 const setExpr=engine._setExpr;engine._setExpr=function(index,speed){return setExpr.call(this,this.emotionId==='02'?geo.index:index,speed);};
 const apply=engine.ball.applyPose;engine.ball.applyPose=function(pose){
  apply(pose);const yaw=pose.body.yaw||0,cos=Math.cos(yaw),front=Math.max(0,Math.min(1,cos*4));
  decor.setAttribute('opacity',front);decor.setAttribute('transform',`translate(${C} 0) scale(${Math.max(.02,cos)} 1) translate(${-C} 0)`);
  // Glasses sit around, not in front of, the moving pupils. Role badges track the body's pose.
  badge.style.display='';
  accent.setAttribute('opacity',engine.emotionId==='00'?'.3':'1');
  pupils.forEach((p,i)=>{const eye=i?right:left;p.setAttribute('transform',eye.getAttribute('transform')??'');p.style.display=engine.emotionId==='02'?eye.style.display:'none';});
  svg.dataset.emotion=engine.emotionId;
 };
 engine.setEmotion(options.emotion??appearanceEmotion(options.state));
 const media=window.matchMedia?.('(prefers-reduced-motion: reduce)'),record={mount,engine,active:false,visible:true,sync(){const on=options.autostart!==false&&!media?.matches&&!document.hidden&&record.visible;record.active=on;engine.setActive(on);if(!on)engine.renderStatic();}};
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{record.visible=entries[0]?.isIntersecting??true;record.sync();}):null;
 observer?.observe(mount);media?.addEventListener('change',record.sync);attach(record);record.sync();
 const click=()=>{if(record.active)engine.spin(2);};mount.addEventListener('click',click);
 let destroyed=false;
 return {engine,appearance,setState(state){engine.setEmotion(appearanceEmotion(state));if(!record.active)engine.renderStatic();},setEmotion(id){return engine.setEmotion(id);},destroy(){if(destroyed)return;destroyed=true;observer?.disconnect();media?.removeEventListener('change',record.sync);mount.removeEventListener('click',click);detach(record);engine.destroy();}};
}
export const botAnimationDiagnostics=()=>({instances:live.size,active:[...live].filter(r=>r.active).length,pointerListeners:live.size?1:0});
