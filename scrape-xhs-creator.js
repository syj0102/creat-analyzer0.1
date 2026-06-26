#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

function printUsage() {
  console.log(`小红书创作者采集入口\n\n用法：\n  node scrape-xhs-creator.js <小红书主页链接或creator_id> [max] [--output-dir DIR] [--media-crawler-dir DIR] [--lt qrcode|phone|cookie] [--dry-run]\n\n示例：\n  node scrape-xhs-creator.js "https://www.xiaohongshu.com/user/profile/xxxx" 20 --output-dir D:\\creator-analyzer\\output\\xhs-test\n\n说明：\n  - 本入口固定走小红书平台，不需要再手动输入 xhs。\n  - 依赖本机 MediaCrawler，默认目录是 D:\\MediaCrawler。\n  - 只建议采集公开内容，用于个人学习、竞品研究和合规分析。\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  if (args[0].startsWith("--")) {
    console.error("错误：缺少小红书主页链接或 creator_id。\n");
    printUsage();
    process.exit(1);
  }

  const multiEntry = path.join(__dirname, "scrape-creator-multi.js");
  const forwardedArgs = [multiEntry, "xhs", ...args];
  const result = spawnSync(process.execPath, forwardedArgs, {
    cwd: __dirname,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(`错误：${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

main();
