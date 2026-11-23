// Interactive local terminal input. Passwords never appear as command arguments.
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

export async function promptVisible(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(label)).trim(); }
  finally { rl.close(); }
}

export function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Run this command in an interactive local terminal (not via a pipe).');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = process.stdin.isRaw;
    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function onData(chunk) {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') { cleanup(); resolve(value); return; }
        if (character === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
        if (character === '\b' || character === '\u007f') { value = value.slice(0, -1); continue; }
        // No keystroke is displayed or echoed.
        if (character >= ' ' && value.length < 512) value += character;
      }
    }
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}
