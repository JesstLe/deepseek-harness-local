// Text-first React rendering; no raw HTML injection or executable URL schemes.
export function createChatMarkdown(React){const h=React.createElement;
 const inline=text=>String(text).split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part,i)=>{
  if(part.startsWith('`')&&part.endsWith('`'))return h('code',{key:i},part.slice(1,-1));
  if(part.startsWith('**')&&part.endsWith('**'))return h('strong',{key:i},part.slice(2,-2));
  const link=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);if(link&&/^https?:\/\//i.test(link[2]))return h('a',{key:i,href:link[2],target:'_blank',rel:'noopener noreferrer'},link[1]);return part;
 });
 return function Markdown({text=''}){const lines=text.replaceAll('\r\n','\n').split('\n'),blocks=[];let i=0;
  while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
   if(line.startsWith('```')){const language=line.slice(3).trim(),code=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i++]);i++;blocks.push(h('pre',{key:blocks.length,'data-language':language||undefined},h('code',null,code.join('\n'))));continue;}
   const heading=line.match(/^(#{1,4})\s+(.+)/);if(heading){blocks.push(h('h'+Math.min(heading[1].length+1,5),{key:blocks.length},inline(heading[2])));i++;continue;}
   if(/^\s*([-*]|\d+[.)])\s/.test(line)){const ordered=/^\s*\d/.test(line),items=[];while(i<lines.length&&/^\s*([-*]|\d+[.)])\s/.test(lines[i]))items.push(h('li',{key:items.length},inline(lines[i++].replace(/^\s*([-*]|\d+[.)])\s+/,''))));blocks.push(h(ordered?'ol':'ul',{key:blocks.length},items));continue;}
   if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]??'')){const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim()),head=cells(line),rows=[];i+=2;while(i<lines.length&&lines[i].includes('|'))rows.push(cells(lines[i++]));blocks.push(h('div',{key:blocks.length,className:'nbc-table'},h('table',null,h('thead',null,h('tr',null,head.map((c,k)=>h('th',{key:k},inline(c))))),h('tbody',null,rows.map((r,k)=>h('tr',{key:k},r.map((c,j)=>h('td',{key:j},inline(c)))))))));continue;}
   if(line.startsWith('> ')){blocks.push(h('blockquote',{key:blocks.length},inline(line.slice(2))));i++;continue;}
   // Keep inline token keys local to each line during streaming reconciliation.
   const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(#|```|> |[-*] |\d+[.)] )/.test(lines[i]))paragraph.push(lines[i++]);blocks.push(h('p',{key:blocks.length},paragraph.map((l,k)=>h(React.Fragment,{key:k},k?h('br'):null,inline(l)))));
  }
  return h('div',{className:'nbc-markdown'},blocks);
 };
}
