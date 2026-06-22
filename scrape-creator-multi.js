#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  SUPPORTED_PLATFORMS,
  resolvePlatform,
  buildMediaCrawlerArgs,
  buildStableDouyinArgs,
  buildStableBilibiliArgs,
} = require("./platform-support");

const rootDir = __dirname;

function parseArgs(argv) {
  const args = [...argv];
  const result = {
    platform: "auto",
    target: "",
    maxNotes: 60,
    outputDir: path.join(rootDir, "output"),
    mediaCrawlerDir: "D:\\MediaCrawler",
    loginType: "qrcode",
    dryRun: false,
    useMediaCrawlerForDouyin: false,
    useMediaCrawlerForBilibili: false,
  };

  if (args[0] && !args[0].startsWith("--")) result.platform = args.shift();
  if (args[0] && !args[0].startsWith("--")) result.target = args.shift();
  if (args[0] && !args[0].startsWith("--")) result.maxNotes = parseInt(args.shift(), 10);

  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const value = args[i + 1];
    if (key === "--output-dir") {
      result.outputDir = value;
      i++;
    } else if (key === "--media-crawler-dir") {
      result.mediaCrawlerDir = value;
      i++;
    } else if (key === "--lt") {
      result.loginType = value;
      i++;
    } else if (key === "--dry-run") {
      result.dryRun = true;
    } else if (key === "--douyin-mediacrawler") {
      result.useMediaCrawlerForDouyin = true;
    } else if (key === "--bili-mediacrawler") {
      result.useMediaCrawlerForBilibili = true;
    } else {
      throw new Error(`未知参数：${key}`);
    }
  }

  if (!result.target) {
    throw new Error("用法: node scrape-creator-multi.js <auto|dy|xhs|ks|bili|wb|tieba|zhihu> <主页/ID/链接> [max] [--output-dir DIR] [--dry-run]");
  }
  if (!Number.isFinite(result.maxNotes) || result.maxNotes < 1) result.maxNotes = 60;

  return result;
}

function findNewestCsv(dir, sinceMs) {
  if (!fs.existsSync(dir)) return null;
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
        const stat = fs.statSync(fullPath);
        if (!sinceMs || stat.mtimeMs >= sinceMs - 2000) files.push({ path: fullPath, mtimeMs: stat.mtimeMs });
      }
    }
  }

  walk(dir);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.path || null;
}

function runProcess(file, args, options) {
  return new Promise((resolve, reject) => {
    const proc = spawn(file, args, options);
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    proc.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`命令失败，退出码 ${code}`));
    });
  });
}

async function main() {
  const startedAt = Date.now();
  const opts = parseArgs(process.argv.slice(2));
  const platform = resolvePlatform(opts.platform, opts.target);
  const platformConfig = SUPPORTED_PLATFORMS[platform];

  fs.mkdirSync(opts.outputDir, { recursive: true });

  let runner;
  if (platform === "douyin" && !opts.useMediaCrawlerForDouyin) {
    runner = {
      file: "node",
      args: buildStableDouyinArgs({
        rootDir,
        target: opts.target,
        maxNotes: opts.maxNotes,
        outputDir: opts.outputDir,
      }),
      cwd: rootDir,
      env: process.env,
      mode: "stable-douyin",
    };
  } else if (platform === "bilibili" && !opts.useMediaCrawlerForBilibili) {
    runner = {
      file: "node",
      args: buildStableBilibiliArgs({
        rootDir,
        target: opts.target,
        maxNotes: opts.maxNotes,
        outputDir: opts.outputDir,
      }),
      cwd: rootDir,
      env: process.env,
      mode: "stable-bilibili",
    };
  } else {
    runner = {
      file: "uv",
      args: buildMediaCrawlerArgs({
        platform,
        target: opts.target,
        maxNotes: opts.maxNotes,
        outputDir: opts.outputDir,
        loginType: opts.loginType,
      }),
      cwd: opts.mediaCrawlerDir,
      env: { ...process.env, UV_LINK_MODE: "copy", PYTHONIOENCODING: "utf-8" },
      mode: "mediacrawler",
    };
  }

  const plan = {
    platform,
    label: platformConfig.label,
    mode: runner.mode,
    command: runner.file,
    args: runner.args,
    cwd: runner.cwd,
    outputDir: opts.outputDir,
  };

  if (opts.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2));
    return;
  }

  await runProcess(runner.file, runner.args, {
    cwd: runner.cwd,
    env: runner.env,
    shell: false,
  });

  const csvPath = findNewestCsv(opts.outputDir, startedAt) ||
    (runner.mode === "mediacrawler" ? findNewestCsv(path.join(opts.mediaCrawlerDir, "data"), startedAt) : null);

  console.log(JSON.stringify({
    ...plan,
    file: csvPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`错误：${error.message}`);
  process.exit(1);
});
