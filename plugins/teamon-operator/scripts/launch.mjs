#!/usr/bin/env node
// No dependencies before the preflight. No downloads or host config writes.
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 24 || minor < 15) {
  process.stderr.write("TeamON Operator: нужен Node >=24.15.0 <25. Настройте Node в PATH MCP-клиента и переподключите плагин.\n");
  process.exitCode = 1;
} else {
  const cli = new URL("../runtime/src/cli.mjs", import.meta.url);
  try { await access(cli); }
  catch {
    process.stderr.write("TeamON Operator: runtime отсутствует. Установлен source-шаблон, а нужен собранный distribution release. Не устанавливайте зависимости вручную в plugin cache.\n");
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    process.argv[1] = fileURLToPath(cli);
    try { await import(cli.href); }
    catch (error) {
      // Native exceptions can contain configuration fragments. Keep stderr diagnostic-only.
      const reason = error?.code === "ERR_MODULE_NOT_FOUND" ? "пакет неполон" : "ошибка конфигурации или запуска";
      process.stderr.write(`TeamON Operator: ${reason}. Проверьте установку и doctor; не отправляйте ключи/конфигурацию в чат.\n`);
      process.exitCode = 1;
    }
  }
}
