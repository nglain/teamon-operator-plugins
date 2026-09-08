import { spawn } from "node:child_process";

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export async function callControlRpc(instance, method, params, { timeoutMs = 20_000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(instance.controlRpc.command, instance.controlRpc.args, {
      cwd: instance.controlRpc.cwd,
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        finish(new Error("instance control response exceeded 2 MiB"));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => finish(error));
    child.stdin.on("error", (error) => {
      child.kill("SIGTERM");
      finish(new Error(`instance control input failed: ${error.message}`));
    });
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8").trim();
      let response;
      try {
        response = JSON.parse(output);
      } catch {
        finish(new Error(`instance control returned invalid JSON (exit ${code}): ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      if (code !== 0 || response.ok !== true) {
        finish(new Error(response.error || `instance control failed with exit ${code}`));
        return;
      }
      finish(undefined, response.result);
    });
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`instance control timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdin.end(`${JSON.stringify({ method, params })}\n`);
  });
}
