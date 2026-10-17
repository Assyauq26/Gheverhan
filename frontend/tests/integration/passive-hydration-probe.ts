import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';

/** Diagnostic-only response patch. Leaves the built application untouched and
 * executes additional browser code only if React actually throws a mismatch. */
export async function installPassiveHydrationProbe(context: BrowserContext, artifacts: string, viewport: number) {
  const directory = path.join(process.cwd(), '.next/static/chunks');
  let script: { name: string; body: string } | undefined;
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(path.join(directory, name), 'utf8');
    const match = /var \w+=null,(\w+)=null,\w+=!1,\w+=null,\w+=!1,\w+=Error\(\w+\(519\)\);function (\w+)\((\w+)\)\{var \w+=Error\(\w+\(418,/.exec(source);
    if (!match) continue;
    const at = match.index + match[0].lastIndexOf('var ');
    const body = `try {
      if (['/admin/inventory','/admin/products','/shop'].includes(location.pathname)) {
        const describe = n => !n ? null : { name:n.nodeName,type:n.nodeType,value:n.nodeType===8?n.nodeValue:null,id:n.nodeType===1?n.id:null,className:n.nodeType===1?n.getAttribute('class'):null };
        const stack=[];for(let f=${match[3]};f&&stack.length<30;f=f.return) stack.push({tag:f.tag,type:typeof f.type==='string'?f.type:(f.type?.displayName||f.type?.name||null),className:typeof f.pendingProps?.className==='string'?f.pendingProps.className:null});
        const children=[]; const visit=(f,depth=0)=>{if(!f||depth>12||children.length>120)return;children.push({tag:f.tag,type:typeof f.type==='string'?f.type:(f.type?.displayName||f.type?.name||null),className:f.pendingProps?.className,dehydrated:describe(f.memoizedState?.dehydrated),loading:f.pendingProps?.loading===null?'null':typeof f.pendingProps?.loading,rsc:f.pendingProps?.cacheNode?.rsc===null?'null':typeof f.pendingProps?.cacheNode?.rsc,tree:f.pendingProps?.tree});visit(f.child,depth+1);visit(f.sibling,depth);};visit(${match[3]}.child);
        const cursor=${match[1]};
        console.debug('[r19-passive-claim]'+JSON.stringify({ path:location.pathname,page:new URL(location.href).searchParams.get('page'),readyState:document.readyState,at:performance.now(),stack,children,expectedChildrenType:typeof ${match[3]}.pendingProps.children,cursor:describe(cursor),previous:describe(cursor?.previousSibling),next:describe(cursor?.nextSibling),parent:describe(cursor?.parentNode),cursorHtml:cursor?.outerHTML?.slice(0,3000),parentHtml:cursor?.parentNode?.outerHTML?.slice(0,12000),mainChildren:[...(document.querySelector('main')?.childNodes||[])].map(describe) }));
      }
    } catch (diagnosticError) { console.debug('[r19-passive-probe-error]'+diagnosticError.message); }
    `;
    script = { name, body: source.slice(0, at) + body + source.slice(at) };
    break;
  }
  if (!script) throw new Error('Passive probe could not identify this compiled React runtime');
  const selected = script;
  await context.route(`**/_next/static/chunks/${selected.name}`, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: selected.body }));
  const claims: unknown[] = [];
  let writes = Promise.resolve();
  context.on('page', page => page.on('console', message => {
    if (!message.text().startsWith('[r19-passive-claim]')) return;
    claims.push(JSON.parse(message.text().slice('[r19-passive-claim]'.length)));
    const snapshot = JSON.stringify(claims, null, 2);
    writes = writes.then(() => writeFile(path.join(artifacts, `passive-claims-${viewport}.json`), snapshot));
  }));
  return async () => { await writes; };
}
