# DSH/QCC maintained cninfo-mcp

[![npm version](https://img.shields.io/npm/v/@duhu2000/cninfo-mcp)](https://www.npmjs.com/package/@duhu2000/cninfo-mcp)

本仓库是由 DSH/QCC 团队维护的安全加固社区分支，源自
[`youhaozhao/cninfo-mcp`](https://github.com/youhaozhao/cninfo-mcp)。它不是深圳证券
信息有限公司或巨潮资讯官方产品，也不暗示其背书。

通过 MCP 协议查询和下载巨潮资讯网上市公司定期报告及招股书 PDF 的工具，适用于 Claude Desktop / Claude Code。

## 并发限制
巨潮资讯网后端禁止大量并发，推荐将并发数设置为 4 以防止后端返回大量 403 导致 IP 短暂被封

## 使用方法

在 Claude Desktop / Claude Code 配置文件中添加：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cninfo": {
      "command": "npx",
      "args": ["-y", "@duhu2000/cninfo-mcp@1.4.3"]
    }
  }
}
```

`1.4.3` 起服务为纯 Node 实现；`npx` 安装完成后即可启动，不需要 Python、
虚拟环境、`pip install` 或额外的初始化命令。

## 可用工具

- **`query_annual_reports_tool`** — 查询报告列表，参数：股票代码（必填）、年份（可选）、报告类型（可选，默认 `annual`）
本安全分支只注册只读查询工具，不提供本地文件下载工具。

支持的 `report_type`：

- `annual` — 年度报告 / 年报
- `semiannual` — 半年度报告 / 半年报 / 中报
- `q1` — 第一季度报告 / 一季报
- `q3` — 第三季度报告 / 三季报
- `prospectus` — 招股书 / 招股说明书 / 招股意向书（招股书无固定年份，省略年份参数即可）

示例对话：

```
查询 000888 的 2024 年报
查询 000001 的 2024 半年报
查询 600519 的 2024 一季报
查询 920185 的年报      # 北交所，新旧代码（如 835185）均可
查询 688777 的招股书
```

## 系统要求

- Node.js 20+

## 安全边界

- 公告检索、页面来源和附件下载均只使用 `https://www.cninfo.com.cn` 或
  `https://static.cninfo.com.cn`。
- 默认仅暴露只读查询工具，并声明 MCP `readOnlyHint`、`destructiveHint`、
  `idempotentHint` 与 `openWorldHint`。
- 不注册文件下载工具，不创建用户目录，也不会启动 Python 或执行 `pip install`。
- 本项目是独立社区项目，并非深圳证券信息有限公司或巨潮资讯官方产品；使用时
  仍应遵守巨潮资讯网站规则与数据使用边界。

## 数据来源

[巨潮资讯网](https://www.cninfo.com.cn) — 支持沪深两市（主板、创业板、科创板）及北京证券交易所（北交所）

## Credits

爬虫逻辑基于 [gaodechen/cninfo_process](https://github.com/gaodechen/cninfo_process)。

## 结果与错误

股票代码必须为六位数字，可带首尾空白（如 `" 000001 "`）；无效输入在请求或创建目录前被拒绝。
查询和下载结果包含 `status`：`complete` 表示完整完成（包括成功查询到零条），`partial` 表示部分完成，`error` 表示失败。只有 `complete` 的 `success` 为 `true`。
查询中断时保留已取得的报告，并返回 `error` / `errors`；Python 的 `query_reports` 调用方可从 `QueryError.reports` 取得部分结果。
下载返回 `downloaded`、`files`、`failed`、`failures`，另有 `query_status` 和查询失败时的 `query_errors`。单个附件失败后继续处理其余附件。
文件名包含附件 URL 的稳定 SHA-256 标识；下载经 PDF 签名与响应类型检查后，使用临时文件原子替换。
附件链接统一解析为 `https://static.cninfo.com.cn` 地址；下载最多跟随五次重定向，每一跳都校验协议、主机和端口。无效链接在查询结果中显示为空并附带 `attachmentError`，下载时作为单个附件失败返回。

## 开发测试

安装 Node 依赖后执行回归测试：

```bash
npm ci
npm test
```
