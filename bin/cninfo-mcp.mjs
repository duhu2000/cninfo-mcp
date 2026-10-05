#!/usr/bin/env node

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { queryReports } from "../lib/cninfo.mjs";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

function createServer() {
  const server = new McpServer({
    name: "cninfo-server",
    version,
    description: "Read-only search for Chinese listed-company periodic reports on CNINFO.",
  });

  server.registerTool(
    "query_annual_reports_tool",
    {
      title: "查询巨潮资讯上市公司报告",
      description: "查询巨潮资讯网中的上市公司年度、半年度、季度报告或招股书。只返回公告元数据及巨潮 HTTPS 附件链接，不下载或修改文件。",
      inputSchema: z.object({
      stock_code: z.string().regex(/^[0-9]{6}$/).describe("六位股票代码，例如 000001"),
      year: z.number().int().min(2001).max(2100).optional().describe("可选会计年度；查询招股书时为公告年份"),
      report_type: z.enum(["annual", "semiannual", "q1", "q3", "prospectus"]).default("annual"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ stock_code, year, report_type }) => {
      try {
        const result = await queryReports(stock_code, report_type, year);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.status === "error",
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, status: "error", error: error.message }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  return server;
}

void serveStdio(createServer);
console.error(`CNINFO read-only MCP ${version} running on stdio`);
