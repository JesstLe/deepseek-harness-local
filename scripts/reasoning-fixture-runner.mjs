import {pathToFileURL} from 'node:url';import fs from 'node:fs';import path from 'node:path';
// Call the exported CLI explicitly: Windows worktree junctions can make import.meta.main false.
const {runCli}=await import(pathToFileURL(fs.realpathSync(path.resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'))).href);await runCli();
