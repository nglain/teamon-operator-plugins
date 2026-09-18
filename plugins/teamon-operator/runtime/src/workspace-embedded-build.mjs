import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { startEmbeddedWorkspace } from './workspace-embedded-frame.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export async function buildEmbeddedWorkspace() {
  const source = await readFile(new URL('./workspace.html',import.meta.url),'utf8');
  const protocol = await readFile(new URL('./workspace-embedded-protocol.mjs',import.meta.url),'utf8');
  const start = source.indexOf('  async function request(method, params) {');
  const end = source.indexOf('  function node(',start);
  if (start < 0 || end < 0 || source.indexOf('  async function request(method, params) {',start+1) >= 0) throw Error('Canonical workspace transport changed; review embedded export');
  const replacement = "  async function request(method, params) {\n    if (method !== 'tools/call') throw Error('Unsupported operation');\n    return globalThis.TeamONOperatorEmbedded.read(params.name,params.arguments || {});\n  }\n";
  const transported = source.slice(0,start)+replacement+source.slice(end);
  const contract = protocol.replace(/^export /gm,'');
  const bootstrap = `(() => {\n${contract}\n(${startEmbeddedWorkspace.toString()})({EMBED_VERSION,EMBED_READS,EMBED_LIMITS,validateEmbedBinding,matchesEmbedBinding,isBoundedJson,validateEmbedRead,projectOperatorContext});\n})();`;
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
  const html = transported.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${csp}">`)
    .replace('<script>',`<script>${bootstrap}</script><script>`);
  if (html === transported || /\bfetch\s*\(/.test(html)) throw Error('Embedded workspace must have only the host transport');
  return { html, protocol, manifest:{schema:'operator_embedded_workspace/v1',source:'src/workspace.html',sourceSha256:hash(source),htmlSha256:hash(html),protocolSha256:hash(protocol),protocolVersion:1,readOnly:true} };
}

export async function writeEmbeddedWorkspace(outputDirectory) {
  const result = await buildEmbeddedWorkspace();
  await mkdir(outputDirectory,{recursive:true});
  await writeFile(path.join(outputDirectory,'workspace.html'),result.html);
  await writeFile(path.join(outputDirectory,'protocol.mjs'),result.protocol);
  await writeFile(path.join(outputDirectory,'manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');
  return result.manifest;
}
