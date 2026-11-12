// Keep storage growth small on the existing testnet hub. No code semantics are changed.
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
const wasm = resolve(import.meta.dirname, '../target/near/kumi_contract/kumi_contract.wasm');
const output = `${wasm}.compact`;
execFileSync('wasm-opt', ['-Oz', '--enable-nontrapping-float-to-int', '--enable-bulk-memory', wasm, '-o', output], { stdio: 'inherit' });
renameSync(output, wasm);
console.log(`Compact hub: ${readFileSync(wasm).length} bytes`);
