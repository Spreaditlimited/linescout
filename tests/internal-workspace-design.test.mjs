import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.cwd();const read=path=>readFileSync(resolve(root,path),'utf8');
test('internal navigation targets existing pages or the consolidated affiliate admin',()=>{
 const shell=read('app/internal/_components/InternalWorkspace.tsx');
 const paths=[...shell.matchAll(/href: "([^"]+)"/g)].map(match=>match[1]);
 assert.ok(paths.length>=20);
 for(const path of paths) { if(path.startsWith('https:')) assert.equal(path,'https://admin.sureimports.com/dashboard/affiliate-program'); else assert.ok(existsSync(resolve(root,'app'+path+'/page.tsx')),path); }
});
test('sidebar remains permission-aware and shares the existing theme provider',()=>{
 const shell=read('app/internal/_components/InternalWorkspace.tsx');
 assert.match(shell,/user\.role === "admin"/);assert.match(shell,/user\.permissions\[item\.permission\]/);assert.match(shell,/useTheme/);assert.match(shell,/Dialog\.Content/);assert.match(shell,/aria-current/);
});
test('auth has a standalone split layout with the original staff sign-in endpoint',()=>{
 const auth=read('app/internal/sign-in/InternalSignInClient.tsx');
 assert.match(auth,/\/api\/internal\/auth\/sign-in/);assert.match(auth,/app: "admin"/);assert.match(auth,/autoComplete="current-password"/);assert.match(auth,/safeNext/);assert.match(auth,/role="alert"/);
 const shell=read('components/Shell.tsx');assert.match(shell,/!isAuth && !isInternal/);
});
test('design rules are scoped and colours use central theme tokens',()=>{
 const css=read('app/internal/internal-design.css');assert.match(css,/\.ls-internal-content/);assert.match(css,/var\(--ls-theme-surface\)/);assert.match(css,/var\(--ls-theme-ink\)/);
 const layout=read('app/internal/layout.tsx');assert.match(layout,/InternalWorkspace/);assert.doesNotMatch(layout,/InternalTopBar/);
});
test('operational details and destructive confirmation remain available',()=>{
 const page=read('app/internal/agent-handoffs/page.tsx');assert.match(page,/<details className="li-insights">/);assert.match(page,/summary\.sla_alerts/);assert.match(page,/summary\.agent_points_top/);
 const dialog=read('app/internal/_components/ConfirmModal.tsx');assert.match(dialog,/Dialog\.Content/);assert.match(dialog,/cancelRef\.current\?\.focus/);assert.match(dialog,/data-danger/);
});
