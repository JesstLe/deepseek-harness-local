/** Image-one silhouettes. Pure data shared by validation and browser rendering. */
export const BOT_FORMS=Object.freeze([
 {id:'researcher',name:'研究员',palette:'blue',path:'M218 114A104 104 0 1 1 10 114A104 104 0 1 1 218 114Z',badge:'glasses',eyes:'round'},
 {id:'planner',name:'规划者',palette:'violet',path:'M65 16H163Q216 16 216 69V161Q216 216 161 216H67Q12 216 12 163V70Q12 16 65 16Z',badge:'trend',eyes:'focused'},
 {id:'executor',name:'执行者',palette:'orange',path:'M78 13H158Q169 13 176 25L222 101Q229 114 222 127L177 203Q170 215 157 215H76Q63 215 56 203L11 127Q4 114 11 101L56 25Q63 13 78 13Z',badge:'wrench',eyes:'focused'},
 {id:'guardian',name:'守护者',palette:'green',path:'M92 43H139C190 43 225 74 225 121S190 205 139 205H84C35 205 2 178 2 133S34 43 92 43Z',badge:'shield',eyes:'happy'},
 {id:'creator',name:'创作者',palette:'pink',path:'M38 89C26 54 55 28 88 41C107 0 167 0 181 45C217 42 235 77 224 101C254 122 241 174 211 179C201 208 154 214 127 202C91 224 51 210 43 195C4 204 -12 160 5 139C-7 119 5 93 38 89Z',badge:'sparkle',eyes:'wink'},
 {id:'analyst',name:'分析师',palette:'amber',path:'M95 18Q114 -11 133 18L225 179Q243 212 208 212H20Q-14 212 4 179Z',badge:'chart',eyes:'focused'},
 {id:'coordinator',name:'协调者',palette:'teal',path:'M211 88C236 137 232 185 195 204C149 230 41 215 11 178C-17 141 12 88 51 54C104 7 179 24 211 88Z',badge:'link',eyes:'oval'},
 {id:'observer',name:'观察者',palette:'slate',path:'M103 9Q114 -3 127 10C158 40 209 92 220 139C232 190 185 225 123 225C58 225 7 201 9 154C11 111 69 44 103 9Z',badge:'radar',eyes:'round'},
].map(Object.freeze));
export const BOT_PALETTES=Object.freeze([
 {id:'blue',name:'晴空蓝',color:'#2877FF'}, {id:'violet',name:'星云紫',color:'#8950E8'},
 {id:'orange',name:'活力橙',color:'#FF7F26'}, {id:'green',name:'常青绿',color:'#16AD68'},
 {id:'pink',name:'莓果粉',color:'#F74C98'}, {id:'amber',name:'琥珀黄',color:'#FFAE0B'},
 {id:'teal',name:'湖水青',color:'#04C7BD'}, {id:'slate',name:'雾岩灰',color:'#89909F'},
].map(Object.freeze));
const hash=id=>{let h=2166136261;for(const c of String(id)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}h^=h>>>16;return h>>>0;};
export function botAppearance(bot={}){
 const form=BOT_FORMS.find(f=>f.id===bot.appearance?.shape)??BOT_FORMS[hash(bot.id)%BOT_FORMS.length];
 return {shape:form.id,palette:BOT_PALETTES.some(p=>p.id===bot.appearance?.palette)?bot.appearance.palette:form.palette};
}
export function appearanceEmotion(state){return ({idle:'02',unknown:'02',starting:'31',queued:'36',running:'32',waiting:'35',completed:'33',failed:'34',cancelled:'41',interrupted:'41'})[state]??'02';}
