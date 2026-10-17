import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const [directory, prefix, output] = process.argv.slice(2);
if (!directory || !prefix || !output) throw new Error('Usage: navigation-stability-matrix.mjs DIRECTORY RUN_PREFIX OUTPUT_DIRECTORY');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = (await readdir(directory)).filter(name => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length))).sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
const runs = [];
for (const name of files) {
  const file = path.join(directory, name, 'navigation-results.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  runs.push({ run: Number(name.slice(prefix.length)), sha: data.commitSha, node: data.nodeVersion,
    browser: data.browserVersion, build: data.buildId, viewports: data.viewports, status: data.status,
    checks: data.checks, pageErrors: data.browserErrors?.length, passedCheckpoints: data.checkpoints?.filter(c => c.status === 'PASS').length, hydrationErrors: data.browserErrors?.filter(e => /418|hydration/i.test(e.message)).length,
    diagnostic: Boolean(data.passiveHydrationProbe || data.hydrationProbe || data.diagnosticContinueAfterFailure), evidence: file });
}
const problems = [];
if (runs.length !== 10) problems.push('Exactly ten full runs are required');
if (runs.some((r, i) => r.run !== i + 1)) problems.push('Run numbers must be consecutive from 1 to 10');
if (runs.some(r => r.sha !== sha)) problems.push('Every run must use the current identical HEAD');
if (new Set(runs.map(r => r.build)).size !== 1 || runs.some(r => !r.build)) problems.push('Every run must use one identifiable production build');
if (new Set(runs.map(r => r.browser)).size !== 1 || runs.some(r => !r.browser)) problems.push('Every run must use one identifiable browser version');
if (new Set(runs.map(r => r.node)).size !== 1 || runs.some(r => !/^v22\./.test(r.node || ''))) problems.push('Every run must use one supported Node 22 version');
if (runs.some(r => r.status !== 'PASS' || r.checks !== 36 || r.passedCheckpoints !== 36 || r.pageErrors !== 0 || r.hydrationErrors !== 0 || r.diagnostic)) problems.push('All strict full runs must pass 36 checks with zero hydration errors and no diagnostic patches');
if (runs.some(r => JSON.stringify(r.viewports) !== '[390,768,1024,1360]')) problems.push('Every run must cover all four required viewports');
const result = { status: problems.length ? 'FAILED' : 'PASS', sha, problems, runs };
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'navigation-stability-matrix.json'), JSON.stringify(result, null, 2));
const markdown = ['# R19 — Matriks stabilitas', '', `Gate: **${result.status}**. SHA: \`${sha}\`.`, '',
  '| Run | SHA | Node | Chromium | Viewport | Hasil | Pemeriksaan | Bukti |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...runs.map(r => `| ${r.run} | ${r.sha} | ${r.node} | ${r.browser} | ${r.viewports?.join(', ')} | ${r.status} | ${r.checks}/36 | ${r.evidence} |`), '', ...problems.map(p => `- ${p}`), ''].join('\n');
await writeFile(path.join(output, 'navigation-stability-matrix.md'), markdown);
console.log(`Navigation stability gate: ${result.status}; ${runs.length}/10 runs on ${sha}`);
if (problems.length) process.exitCode = 1;
