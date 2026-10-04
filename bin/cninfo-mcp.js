#!/usr/bin/env node

/**
 * 巨潮资讯 MCP 服务器启动器。
 *
 * 默认启动只探测已有 Python 环境，不创建目录、不安装依赖。需要安装时，
 * 用户必须显式运行 `npx @duhu2000/cninfo-mcp --setup`。
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PACKAGE_ROOT = path.join(__dirname, "..");
const PYTHON_SCRIPT = path.join(PACKAGE_ROOT, "python", "mcp_server.py");
const DEPS_CHECK = path.join(PACKAGE_ROOT, "python", "check_deps.py");
const SETUP_SCRIPT = path.join(PACKAGE_ROOT, "scripts", "install-python-deps.js");
const CACHED_VENV_PYTHON = process.platform === "win32"
  ? path.join(os.homedir(), ".cninfo-mcp", "venv", "Scripts", "python.exe")
  : path.join(os.homedir(), ".cninfo-mcp", "venv", "bin", "python3");

function spawnAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || "pipe",
      shell: false,
      ...options,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => { stdout += data.toString(); });
    child.stderr?.on("data", (data) => { stderr += data.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else {
        const error = new Error(`Command failed with exit code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        error.code = code;
        reject(error);
      }
    });
    child.on("error", reject);
  });
}

async function isSupportedPython(command) {
  try {
    const result = await spawnAsync(command, ["--version"]);
    const version = `${result.stdout || ""} ${result.stderr || ""}`.match(
      /\bPython (\d+)\.(\d+)\.(\d+)\b/,
    );
    return Boolean(version && Number(version[1]) === 3 && Number(version[2]) >= 10);
  } catch {
    return false;
  }
}

async function hasDependencies(command) {
  try {
    await spawnAsync(command, [DEPS_CHECK]);
    return true;
  } catch {
    return false;
  }
}

async function findReadyPython() {
  const candidates = [
    process.env.CNINFO_MCP_PYTHON,
    CACHED_VENV_PYTHON,
    "python3",
    "python",
    "python3.12",
    "python3.11",
    "python3.10",
  ].filter(Boolean);

  for (const command of [...new Set(candidates)]) {
    if (await isSupportedPython(command) && await hasDependencies(command)) return command;
  }
  return null;
}

async function runSetup() {
  const child = spawn(process.execPath, [SETUP_SCRIPT], {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  child.on("error", (error) => {
    console.error("Failed to run explicit setup:", error.message);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code || 0));
}

async function main() {
  if (process.argv.slice(2).includes("--setup")) {
    await runSetup();
    return;
  }
  if (!fs.existsSync(PYTHON_SCRIPT)) {
    throw new Error(`mcp_server.py not found at ${PYTHON_SCRIPT}`);
  }

  const python = await findReadyPython();
  if (!python) {
    throw new Error(
      "Python 3.10+ with cninfo-mcp dependencies was not found. "
      + "Run `npx @duhu2000/cninfo-mcp --setup` explicitly, "
      + "or set CNINFO_MCP_PYTHON to a prepared Python executable.",
    );
  }

  console.error("巨潮资讯 MCP 服务器已启动，等待连接...");
  const child = spawn(python, [PYTHON_SCRIPT], {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, PYTHONPATH: path.join(PACKAGE_ROOT, "python") },
  });
  child.on("error", (error) => {
    console.error("Failed to start MCP Server:", error.message);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code || 0));
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
