import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  internals,
  isReportTitle,
  normalizeReportType,
  normalizeStockCode,
  resolveAttachmentUrl,
} from "../lib/cninfo.mjs";

test("validates six-digit stock codes", () => {
  assert.equal(normalizeStockCode(" 000001 "), "000001");
  assert.throws(() => normalizeStockCode("1;rm -rf"), /six ASCII digits/);
});

test("normalizes report aliases and rejects unknown types", () => {
  assert.equal(normalizeReportType("半年报"), "semiannual");
  assert.equal(normalizeReportType("Q3"), "q3");
  assert.throws(() => normalizeReportType("monthly"), /Unsupported/);
});

test("filters summaries and accepts report bodies", () => {
  assert.equal(isReportTitle("平安银行：2024年年度报告", "annual", 2024), true);
  assert.equal(isReportTitle("平安银行：2024年年度报告摘要", "annual", 2024), false);
  assert.equal(isReportTitle("示例公司招股说明书（申报稿）", "prospectus"), true);
  assert.equal(isReportTitle("关于招股说明书问询的回复", "prospectus"), false);
});

test("allows only CNINFO HTTPS attachment URLs", () => {
  assert.equal(resolveAttachmentUrl("finalpage/2025-01-01/test.pdf"), "https://static.cninfo.com.cn/finalpage/2025-01-01/test.pdf");
  assert.throws(() => resolveAttachmentUrl("http://static.cninfo.com.cn/a.pdf"), /must use/);
  assert.throws(() => resolveAttachmentUrl("https://example.com/a.pdf"), /must use/);
});

test("builds HTTPS report query inputs without credentials", () => {
  const query = internals.reportQuery(1, "000001", "annual", "szse", "sz");
  assert.equal(query.pageNum, 1);
  assert.equal(query.searchkey, "000001");
  assert.equal(query.category, "category_ndbg_szsh");
  assert.match(query.seDate, /^2001-01-01~\d{4}-\d{2}-\d{2}$/);
});

test("stdio initialize and tools/list expose one read-only tool", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const child = spawn(process.execPath, [path.join(root, "bin", "cninfo-mcp.mjs")], { stdio: ["pipe", "pipe", "pipe"] });
  const messages = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) messages.push(JSON.parse(line));
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })}\n`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  child.kill();
  const initialized = messages.find((message) => message.id === 1)?.result;
  const tools = messages.find((message) => message.id === 2)?.result?.tools;
  assert(initialized?.serverInfo?.version);
  assert.equal(tools?.length, 1);
  assert.equal(tools[0].name, "query_annual_reports_tool");
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[0].annotations.destructiveHint, false);
});
