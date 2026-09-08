import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { digest } from "./digest.mjs";

const locks = new Map();

async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function serial(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => current, () => current);
  locks.set(key, tail);
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

export class OperationStore {
  constructor(root, now = () => new Date()) {
    this.root = path.resolve(root, "operations");
    this.now = now;
  }

  file(operationId) {
    if (!/^[0-9a-f-]{36}$/u.test(operationId)) throw new Error("invalid operation id");
    return path.join(this.root, `${operationId}.json`);
  }

  lockFile(operationId) {
    this.file(operationId);
    return path.join(this.root, ".locks", `${operationId}.lock`);
  }

  async withCommitLock(operationId, task) {
    const lockFile = this.lockFile(operationId);
    await mkdir(path.dirname(lockFile), { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(lockFile, "wx", 0o600);
      await handle.chmod(0o600);
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new Error("operation is already being committed; inspect its receipt before retrying");
      }
      throw error;
    }
    try {
      return await task();
    } finally {
      await handle.close();
      await rm(lockFile, { force: true });
    }
  }

  async create(proposal) {
    const operationId = randomUUID();
    const createdAt = this.now().toISOString();
    const proposalDigest = digest({ operationId, ...proposal });
    const operation = {
      schemaVersion: 1,
      operationId,
      proposalDigest,
      status: "prepared",
      createdAt,
      updatedAt: createdAt,
      ...proposal
    };
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const handle = await open(this.file(operationId), "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(operation, null, 2)}\n`, "utf8");
      await handle.chmod(0o600);
    } finally {
      await handle.close();
    }
    return operation;
  }

  async read(operationId) {
    return JSON.parse(await readFile(this.file(operationId), "utf8"));
  }

  async claim(operationId, proposalDigest, instanceBinding) {
    return await serial(operationId, async () => {
      const current = await this.read(operationId);
      if (current.proposalDigest !== proposalDigest) throw new Error("proposal digest mismatch");
      if (current.instanceBinding !== instanceBinding) {
        throw new Error("instance binding changed; prepare the operation again");
      }
      if (current.status === "complete") return { claimed: false, operation: current };
      if (["executing", "unknown"].includes(current.status) && !current.retrySafe) {
        throw new Error("external effect is unknown; inspect the target before any new send");
      }
      if (!["prepared", "executing", "unknown"].includes(current.status)) {
        throw new Error(`operation cannot be committed from ${current.status}`);
      }
      const next = {
        ...current,
        status: "executing",
        updatedAt: this.now().toISOString()
      };
      await atomicWrite(this.file(operationId), next);
      return { claimed: true, operation: next };
    });
  }

  async update(operationId, mutate) {
    return await serial(operationId, async () => {
      const current = await this.read(operationId);
      const next = mutate(structuredClone(current));
      next.updatedAt = this.now().toISOString();
      await atomicWrite(this.file(operationId), next);
      return next;
    });
  }
}
