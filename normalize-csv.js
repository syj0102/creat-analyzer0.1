#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { normalizeCsvFile, STANDARD_HEADERS } = require("./lib/normalize-csv");

function printUsage() {
  console.log(`统一 CSV 字段\n\n用法：\n  node normalize-csv.js <input.csv> [output.csv]\n\n示例：\n  node normalize-csv.js output/raw.csv output/normalized.csv\n\n标准字段：\n  ${STANDARD_HEADERS.join(", ")}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args.length < 1) {
    printUsage();
    process.exit(args.length < 1 ? 1 : 0);
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    console.error(`错误：找不到输入文件：${inputPath}`);
    process.exit(1);
  }

  const parsed = path.parse(inputPath);
  const outputPath = path.resolve(args[1] || path.join(parsed.dir, `${parsed.name}.normalized.csv`));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const result = normalizeCsvFile(inputPath, outputPath);
  console.log(JSON.stringify(result, null, 2));
}

main();
