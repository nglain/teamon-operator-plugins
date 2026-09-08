import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import packageInfo from "../package.json" with { type: "json" };

export class ChannelMcpPool {
  #clients = new Map();

  async #client(instance) {
    if (this.#clients.has(instance.id)) return await this.#clients.get(instance.id);
    const pending = (async () => {
      const client = new Client({ name: "teamon-operator", version: packageInfo.version });
      const transport = new StdioClientTransport({
        command: instance.channelMcp.command,
        args: instance.channelMcp.args,
        cwd: instance.channelMcp.cwd,
        env: process.env,
        stderr: "inherit"
      });
      // A closed native process must not poison subsequent explicit requests.
      // Never retry the interrupted call: its external effect may be unknown.
      client.onclose = () => {
        if (this.#clients.get(instance.id) === pending) this.#clients.delete(instance.id);
      };
      try {
        await client.connect(transport);
      } catch (error) {
        await client.close().catch(() => {});
        throw error;
      }
      return { client, transport };
    })();
    this.#clients.set(instance.id, pending);
    try {
      return await pending;
    } catch (error) {
      if (this.#clients.get(instance.id) === pending) this.#clients.delete(instance.id);
      throw error;
    }
  }

  async call(instance, name, args) {
    const { client } = await this.#client(instance);
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      const message = result.content?.find(({ type }) => type === "text")?.text || `${name} failed`;
      throw new Error(message);
    }
    return result.structuredContent || {};
  }

  async discover(instance) {
    const { client } = await this.#client(instance);
    const deadline = Date.now() + 15_000;
    const names = new Set(), cursors = new Set();
    let cursor;
    for (let page = 0; page < 10; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { tools: [...names], complete: false };
      const result = await client.listTools(cursor ? { cursor } : {}, { timeout: remaining });
      for (const tool of result.tools) {
        names.add(tool.name);
        if (names.size > 1000) return { tools: [...names].slice(0, 1000), complete: false };
      }
      if (!result.nextCursor) return { tools: [...names], complete: true };
      if (cursors.has(result.nextCursor)) return { tools: [...names], complete: false };
      cursor = result.nextCursor;
      cursors.add(cursor);
    }
    return { tools: [...names], complete: false };
  }

  async close() {
    const entries = [...this.#clients.values()];
    this.#clients.clear();
    await Promise.allSettled(entries.map(async (pending) => {
      const { client } = await pending;
      await client.close();
    }));
  }
}
