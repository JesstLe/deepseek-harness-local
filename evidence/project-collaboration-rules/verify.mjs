import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const evidence=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(evidence,'manifest.json'),'utf8'));
const phase=process.argv[2];
const root=path.resolve(process.argv[3]??path.join(evidence,'../..'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
if(['baseline','rollback'].includes(phase)){
  for(const entry of manifest.files){
    const target=path.join(root,entry.path);
    assert.equal(fs.existsSync(target),entry.existed,entry.path);
    if(entry.existed)assert.equal(hash(target),entry.originalSha256,entry.path);
  }
  console.log(`${phase.toUpperCase()} documents=1/4 project_rules=absent original_hashes=PASS`);
}else if(phase==='modified'){
  const agents=read('AGENTS.md');
  const requirements=[
    'git fetch origin main','codex/<任务名>','同文件并行修改先明确负责人',
    '保留共享 checkout 的分支及他人未提交内容','不擅自切分支、reset、clean、stash、覆盖目录或强推 main',
    '只 `git add` 本任务明确路径','不提交环境文件、凭据或密钥',
    '完成→普通 merge 合入 main→推送→删除已合并的本任务分支和 worktree，当日闭环',
    '清理前核对已合入、工作树干净且无运行任务','生产相关修复不隔夜滞留，小改动以小时计',
    '合并前再次刷新 origin/main','普通 push 被拒绝时重新整合，不强推',
    '超一天的任务每天整合一次主线','每完成 3 个功能模块也执行一次同步',
    '文档修改不计功能迭代','超过 48 小时未合并','在交接文档标红说明原因',
    '发布只从 main 构建固定版本','Git 合并和推送不等于服务器发布',
    '缺少远端仓库时建立对应仓库后推送','尽量完成一个完整模块或业务切片后集中测试',
    '成功、失败、重试及并发边界','提交→持久化/排队→供应商→处理→存储→作品/父子回执→账务→用户可见结果',
    '不混写为线上完成','不只依赖会话上下文','职责、依赖与迁移状态',
    '纯规则/文档修改执行内容、引用和差异核验，不触发业务发布，不增加功能迭代或成功发布计数',
    '模块与职责：','公共接口、依赖方向、数据/状态/事务归属：','本次实现与迁移状态：',
    '验证命令、结果及证据层级：','未完成项与下一步：',
  ];
  for(const requirement of requirements)assert(agents.includes(requirement),requirement);
  assert(!agents.includes('branch_hygiene.py'),'Do not restore a removed Naumi-specific rule');
  const original=fs.readFileSync(path.join(evidence,'original/README.md'),'utf8').replace(/\r\n/g,'\n');
  const addition='\n## 开发协作\n\n开工前阅读 [项目规则](AGENTS.md)、[协作与交接说明](docs/AGENT_COLLABORATION.md) 及相关模块文档。规则适用于本仓库；文档变更不触发业务发布。\n';
  assert.equal(read('README.md'),original.replace('# DeepSeek Harness Local\n','# DeepSeek Harness Local\n'+addition));
  let links=0;
  for(const entry of manifest.files){
    const content=read(entry.path);
    assert(content.trim(),entry.path);
    if(entry.modifiedSha256&&!process.argv.includes('--content-only'))assert.equal(hash(path.join(root,entry.path)),entry.modifiedSha256,entry.path);
    for(const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){
      if(/^[a-z]+:/i.test(match[1])||match[1].startsWith('#'))continue;
      const target=path.resolve(root,path.dirname(entry.path),match[1].split('#')[0]);
      assert(fs.existsSync(target),`${entry.path} -> ${match[1]}`);links++;
    }
  }
  if(!process.argv.includes('--content-only')){
    const changes=execFileSync('git',['diff','--name-only',manifest.originMainBaseline,'--'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
    for(const changed of changes)assert(manifest.files.some(e=>e.path===changed)||changed.startsWith('evidence/project-collaboration-rules/'),changed);
    execFileSync('git',['diff','--check'],{cwd:root});
  }
  console.log(`MODIFIED documents=4 rules=${requirements.length} links=${links} original_readme=preserved scope=docs-only PASS`);
}else throw Error('Expected baseline, modified or rollback');
