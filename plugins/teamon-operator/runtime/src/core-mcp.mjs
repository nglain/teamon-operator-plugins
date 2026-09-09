import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { coreMcpCall } from './core-mcp-contract.mjs';
import { validateResourceSession } from './resource-session.mjs';
import {resourceCredential} from './resource-oauth.mjs';
import { adapterError, OPERATOR_ERRORS } from './compatibility.mjs';
import packageInfo from '../package.json' with {type:'json'};

const error = code => adapterError(code, `Core MCP ${code}`);
export class CoreMcp {
  constructor({fetchImpl = fetch, readSession = binding => resourceCredential(binding,{fetchImpl}), maxBytes = 2 * 1024 * 1024} = {}) {
    this.fetch = fetchImpl; this.readSession = readSession; this.maxBytes = maxBytes;
    this.pending = new Set(); this.closed = false;
  }
  async request(instance, pathname, params, body, timeoutMs = 15_000) {
    if (this.closed) throw error('request_failed');
    const call = coreMcpCall(pathname, params, body);
    const binding = instance.core.mcp;
    const session = await this.readSession(binding);
    if (this.closed) throw error('request_failed');
    const abort = new AbortController();
    let dispatched = false, transportFailure;
    const fail = reason => {transportFailure = reason; return error(reason);};
    const timer = setTimeout(() => abort.abort(),timeoutMs); timer.unref();
    const client = new Client({name:'teamon-operator',version:packageInfo.version}, {
      versionNegotiation:{mode:{pin:'2026-07-28'}}
    });
    // Stateless per-call connection: no stale account/session cache and no
    // background GET/SSE reconnect. SDK owns the protocol, not a JSON-RPC clone.
    const transport = new StreamableHTTPClientTransport(new URL(binding.url), {
      authProvider:{token: async () => session.accessToken},
      insufficientScopeBehavior:'throw',
      reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1},
      fetch: async (url, init = {}) => {
        validateResourceSession(session,binding);
        if (new URL(url instanceof Request ? url.url : url).href !== binding.url) throw fail('permission_denied');
        // Even a future SDK corrective retry must not redispatch an operation.
        // Discovery may negotiate; an accepted tools/call may have side effects.
        if (typeof init.body === 'string' && JSON.parse(init.body).method === 'tools/call') {
          if (dispatched) throw fail('request_failed');
          dispatched = true;
        }
        const response = await this.fetch(url, {...init,redirect:'error',signal:AbortSignal.any([abort.signal,...(init.signal ? [init.signal] : [])])});
        if (!response.ok) {
          void response.body?.cancel().catch(()=>{});
          throw fail(({401:'authentication_failed',403:'permission_denied',404:'endpoint_missing'})[response.status] || 'upstream_error');
        }
        if (response.status === 204 || !response.body) return response;
        // Bound JSON and SSE bytes before SDK parsing, including chunked bodies.
        let bytes = 0;
        return new Response(response.body.pipeThrough(new TransformStream({transform:(chunk,controller)=>{
          bytes += chunk.byteLength;
          if (bytes > this.maxBytes) {controller.error(fail('response_too_large'));abort.abort();return;}
          controller.enqueue(chunk);
        }}),{signal:abort.signal}),{status:response.status,headers:response.headers});
      }
    });
    const pending = {client,abort}; this.pending.add(pending);
    try {
      await client.connect(transport, {timeout:timeoutMs,signal:abort.signal});
      // Only one tools/call. No authProvider.onUnauthorized or step-up replay.
      const result = await client.callTool({name:call.name,arguments:call.arguments},{timeout:timeoutMs,signal:abort.signal});
      if (result.isError) throw error('endpoint_error');
      const envelope = result.structuredContent;
      if (envelope?.schemaVersion !== 1 || envelope.instanceId !== instance.id
        || envelope.actor?.issuer !== binding.issuer || envelope.actor?.subject !== binding.subject
        || !Number.isInteger(envelope.status) || envelope.status < 200 || envelope.status > 599
        || !envelope.data || typeof envelope.data !== 'object') throw error('invalid_response');
      if (envelope.status >= 300) {
        const reason = ({401:'authentication_failed',403:'permission_denied'})[envelope.status]
          || (pathname.startsWith('/api/operator/') && OPERATOR_ERRORS.has(envelope.data.code) ? envelope.data.code : null)
          || (envelope.status === 404 ? 'endpoint_missing' : 'upstream_error');
        throw error(reason);
      }
      const raw = JSON.stringify(envelope.data);
      return JSON.parse(raw.split(session.accessToken).join('[REDACTED]'));
    } catch (e) {
      if (transportFailure) throw error(transportFailure);
      if (e?.operatorReason) throw error(e.operatorReason);
      if (e?.code === 'INVALID_RESULT') throw error('invalid_response');
      throw error(abort.signal.aborted ? 'request_timeout' : 'request_failed');
    } finally {
      clearTimeout(timer); abort.abort(); this.pending.delete(pending);
      await client.close().catch(()=>{});
    }
  }
  async close() {
    this.closed = true;
    await Promise.allSettled([...this.pending].map(({client,abort}) => {abort.abort();return client.close();}));
  }
}
