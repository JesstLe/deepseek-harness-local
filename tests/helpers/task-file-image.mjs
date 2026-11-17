import {deflateSync} from 'node:zlib';
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const tag=Buffer.from(type),bytes=Buffer.concat([tag,data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(bytes));return Buffer.concat([head,bytes,tail]);};
/** Real PNG file fixture, not a Markdown/text substitute for binary delivery. */
export function taskFileImage(color=[55,104,233]){const header=Buffer.alloc(13);header.writeUInt32BE(64,0);header.writeUInt32BE(64,4);header[8]=8;header[9]=2;const scan=Buffer.alloc((1+64*3)*64);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const p=y*(1+64*3)+1+x*3;color.forEach((v,i)=>scan[p+i]=Math.min(255,v+Math.floor((x+y)/12)));}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);}
