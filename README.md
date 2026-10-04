# cninfo-mcp

[![npm version](https://img.shields.io/npm/v/@youhaozhao/cninfo-mcp)](https://www.npmjs.com/package/@youhaozhao/cninfo-mcp)

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
      "args": ["-y", "@youhaozhao/cninfo-mcp"]
    }
  }
}
```

首次使用前需显式准备 Python 依赖（安装过程会在用户目录创建
`.cninfo-mcp/venv` 并访问 Python 包索引）：

```bash
npx -y @youhaozhao/cninfo-mcp --setup
```

安装完成后重启 Claude Desktop 即可使用。普通 MCP 启动只复用已准备的
Python 环境，不会创建虚拟环境或执行 `pip install`。也可通过
`CNINFO_MCP_PYTHON` 指向已安装 `python/requirements.txt` 依赖的 Python 3.10+
解释器。

## 可用工具

- **`query_annual_reports_tool`** — 查询报告列表，参数：股票代码（必填）、年份（可选）、报告类型（可选，默认 `annual`）
- **`download_annual_reports_tool`** — 下载报告 PDF；默认不注册。仅在启动前显式设置
  `CNINFO_MCP_DOWNLOAD_ROOT` 后启用，`save_path` 只能是该目录内的相对路径。

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
下载 300750 的 2023 三季报
下载 688777 的年报
查询 920185 的年报      # 北交所，新旧代码（如 835185）均可
查询 688777 的招股书
```

## 系统要求

- Node.js 18+
- Python 3.10+（依赖只在用户显式执行 `--setup` 时安装；需要 MCP Python SDK v2）

## 安全边界

- 公告检索、页面来源和附件下载均只使用 `https://www.cninfo.com.cn` 或
  `https://static.cninfo.com.cn`。
- 默认仅暴露只读查询工具，并声明 MCP `readOnlyHint`、`destructiveHint`、
  `idempotentHint` 与 `openWorldHint`。
- 下载能力必须通过 `CNINFO_MCP_DOWNLOAD_ROOT` 显式启用；工具拒绝绝对路径与
  `..` 越界路径，并声明为可能覆盖同名文件的非只读工具。
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

在独立环境中安装运行依赖和 pytest 后执行全部 Python 与 Node 回归测试：

```bash
python3 -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
python -m pip install -r python/requirements.txt pytest
npm test
```

也可使用 uv 临时环境：

```bash
uv run --no-project --with pytest --with requests --with 'mcp~=2.1.1' npm test
```
