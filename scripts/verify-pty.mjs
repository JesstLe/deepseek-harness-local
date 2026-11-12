import pty from 'node-pty';
const terminal = pty.spawn('pwsh.exe', ['-NoProfile', '-Command', 'Write-Output DSH_PTY_OK'], {
  name: 'xterm-color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
});
let output = '';
const timeout = setTimeout(() => { terminal.kill(); process.exit(1); }, 10000);
terminal.onData(data => { output += data; });
terminal.onExit(event => {
  clearTimeout(timeout);
  if (event.exitCode !== 0 || !output.includes('DSH_PTY_OK')) process.exit(1);
  console.log('WINDOWS_PTY=PASS marker=DSH_PTY_OK exit=0');
  // node-pty's Windows native worker can retain the smoke process after ConPTY exits.
  process.exit(0);
});
