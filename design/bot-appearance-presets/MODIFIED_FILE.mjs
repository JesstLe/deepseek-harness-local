// Shape and palette are independent axes. No identity, role or task-state mutation.
export const SHAPES=Object.freeze([
  {id:'pebble',name:'圆团',path:'M50 14C73 14 86 30 86 52C86 75 73 86 50 86S14 75 14 52C14 30 27 14 50 14Z'},
  {id:'capsule',name:'豆荚',path:'M40 13H60C75 13 81 24 81 39V63C81 79 70 87 50 87S19 79 19 63V39C19 24 25 13 40 13Z'},
  {id:'cube',name:'方糖',path:'M31 18H69Q84 18 84 33V67Q84 82 69 82H31Q16 82 16 67V33Q16 18 31 18Z'},
  {id:'spark',name:'星团',path:'M50 10C58 10 61 23 66 26S84 25 88 33S80 50 80 55S88 73 81 79S63 77 57 80S45 93 37 88S32 73 26 69S9 64 11 54S23 43 25 37S23 20 32 17S43 13 50 10Z'},
  {id:'sprout',name:'芽芽',path:'M47 24C33 21 20 30 17 45C12 66 24 85 47 86C70 88 85 75 84 55C84 36 72 26 56 25C65 21 70 14 69 7C57 7 49 14 47 24Z'},
  {id:'antenna',name:'机灵',path:'M47 22V13C40 9 43 3 50 3S60 9 53 13V22H67Q82 22 82 37V65Q82 81 66 81H34Q18 81 18 65V37Q18 22 33 22Z'},
].map(Object.freeze));
export const PALETTES=Object.freeze([
  {id:'iris',name:'鸢尾紫',base:'#A58BDC',light:'#E9DFF9',shade:'#8062B7',ink:'#403251'},
  {id:'sky',name:'晴空蓝',base:'#7CA8E1',light:'#DFEDFF',shade:'#5280BC',ink:'#263D59'},
  {id:'mint',name:'薄荷绿',base:'#79BBA7',light:'#DCF3E7',shade:'#4D9580',ink:'#294B40'},
  {id:'peach',name:'杏桃橙',base:'#E9AC82',light:'#FFEDD8',shade:'#C78255',ink:'#614330'},
  {id:'rose',name:'蔷薇粉',base:'#DA94B0',light:'#FBE3ED',shade:'#B86F8E',ink:'#5D3548'},
  {id:'citrus',name:'柠檬黄',base:'#DBC36D',light:'#FFF4C7',shade:'#B49B47',ink:'#554B27'},
  {id:'slate',name:'雾石灰',base:'#9CAFC0',light:'#E7EDF4',shade:'#71889F',ink:'#344351'},
  {id:'lilac',name:'雾丁香',base:'#B2A6CB',light:'#ECE5F7',shade:'#8D80AA',ink:'#443C53'},
].map(Object.freeze));
const hash=value=>{let n=2166136261;for(const c of String(value)){n^=c.codePointAt(0);n=Math.imul(n,16777619);}n^=n>>>16;n=Math.imul(n,0x85ebca6b);n^=n>>>13;n=Math.imul(n,0xc2b2ae35);return(n^(n>>>16))>>>0;};
export function resolveAppearance(bot={}){
  const shape=SHAPES.find(s=>s.id===bot.appearance?.shape)??SHAPES[hash('shape:'+bot.id)%SHAPES.length];
  const palette=PALETTES.find(p=>p.id===bot.appearance?.palette)??PALETTES[hash('palette:'+bot.id)%PALETTES.length];
  return {shape:shape.id,palette:palette.id};
}
export function avatarSVG(appearance,{size=80,uid='bot',label=''}={}){
  const shape=SHAPES.find(s=>s.id===appearance.shape),palette=PALETTES.find(p=>p.id===appearance.palette);
  if(!shape||!palette)throw Error('BOT_APPEARANCE_INVALID');
  if(!Number.isFinite(size)||size<16||size>512)throw Error('BOT_AVATAR_SIZE_INVALID');
  if(!/^[a-zA-Z][\w-]*$/.test(uid))throw Error('BOT_AVATAR_UID_INVALID');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" ${label?`role="img" aria-label="${escape(label)}"`:'aria-hidden="true"'}><defs><linearGradient id="${uid}-body" x1="0" y1="0" x2=".75" y2="1"><stop stop-color="${palette.light}"/><stop offset=".52" stop-color="${palette.base}"/><stop offset="1" stop-color="${palette.shade}"/></linearGradient><linearGradient id="${uid}-glint" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path d="${shape.path}" fill="url(#${uid}-body)"/><path d="M30 31Q42 21 58 26" fill="none" stroke="url(#${uid}-glint)" stroke-width="5" stroke-linecap="round"/><rect x="27" y="39" width="46" height="30" rx="14" fill="${palette.light}" fill-opacity=".72"/><path d="M39 49V54M61 49V54" stroke="${palette.ink}" stroke-width="4.8" stroke-linecap="round"/><path d="M45 60Q50 64 55 60" fill="none" stroke="${palette.ink}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}
export const combinations=()=>SHAPES.flatMap(shape=>PALETTES.map(palette=>({shape:shape.id,palette:palette.id})));
