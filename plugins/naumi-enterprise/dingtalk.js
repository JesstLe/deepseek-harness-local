import {fileURLToPath} from 'node:url';
import * as filesystemSkills from '@deepseek-ai/dsh-skill-filesystem';

export function installDingTalk(ctx){
  ctx.inject(['skills'],scope=>scope.plugin(filesystemSkills,{providerName:'naumi-dingtalk',includeDefaultRoots:false,watch:false,customSkillDirs:[],bundledSkillDir:fileURLToPath(new URL('./dingtalk-skills',import.meta.url))}));
}
