import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
test('LineScout does not mount or retain its automatic home-screen install prompt',()=>{
 const layout=readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(layout,/InstallPrompt/);
 assert.equal(existsSync(new URL('../components/InstallPrompt.tsx',import.meta.url)),false);
});
