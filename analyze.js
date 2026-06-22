#!/usr/bin/env node
/**
 * 博主内容分析工具 — 爬取 + AI 分析 + Obsidian 报告
 *
 * 用法:
 *   node analyze.js scrape xhs "博主主页URL"      爬取小红书博主笔记
 *   node analyze.js scrape dy "博主主页URL"       爬取抖音博主笔记
 *   node analyze.js analyze data.csv              分析 CSV 数据，输出报告
 *   node analyze.js quick xhs "URL"               快速模式: 爬取 + 分析一键完成
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const MEDIACRAWLER_DIR = "D:/MediaCrawler";
const UV = path.join(process.env.HOME || "C:/Users/Administrator", ".local/bin/uv.exe");
const OUTPUT_DIR = "D:/Obsidian/qclaw-vault/02-领域/自媒体/竞品分析";
const DATA_DIR = path.join(__dirname, "data");
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

// ── Config ──
function loadKey() {
  return process.env.OPENAI_API_KEY || "";
}

async function gptChat(system, prompt, maxTokens = 16000) {
  const key = loadKey();
  if (!key) throw new Error("未找到 OPENAI_API_KEY，已停止分析，避免误用 Agnes");
  const payload = {
    model: OPENAI_MODEL,
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.5,
  };
  const payloadPath = path.join(DATA_DIR, `.openai_payload_${Date.now()}_${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify(payload), "utf-8");
  const ps = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `$ErrorActionPreference='Stop'; ` +
      `$body = Get-Content -LiteralPath '${payloadPath}' -Raw -Encoding UTF8; ` +
      `$headers = @{ Authorization = 'Bearer ${key}'; 'Content-Type' = 'application/json' }; ` +
      `$resp = Invoke-RestMethod -Method Post -Uri '${OPENAI_BASE_URL}/chat/completions' -Headers $headers -Body $body -TimeoutSec 180; ` +
      `$resp | ConvertTo-Json -Depth 20`,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let j;
  try {
    j = await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      ps.stdout.on("data", (d) => { stdout += d.toString(); });
      ps.stderr.on("data", (d) => { stderr += d.toString(); });
      ps.on("error", reject);
      ps.on("close", (code) => {
        if (code !== 0) return reject(new Error(`OpenAI API request failed: ${stderr.slice(0, 500)}`));
        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          reject(new Error(`OpenAI API response parse failed: ${err.message}`));
        }
      });
    });
  } finally {
    try { fs.unlinkSync(payloadPath); } catch {}
  }

  return j.choices[0].message.content;
}

// ── Scrape ──
async function scrape(platform, targetUrl) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const args = ["run", "main.py", "--platform", platform, "--lt", "qrcode", "--type", "creator", "--save_data_option", "csv"];
  if (targetUrl) args.push("--creator_id", targetUrl);

  console.log(` 启动爬虫: ${platform}, 目标: ${targetUrl}`);
  console.log(` 扫码登录后开始采集...`);

  return new Promise((resolve, reject) => {
    const proc = spawn(UV, args, { cwd: MEDIACRAWLER_DIR, stdio: "inherit", env: { ...process.env, UV_LINK_MODE: "copy" } });
    proc.on("close", (code) => {
      if (code === 0) {
        // 找最新生成的 CSV
        const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv")).sort((a, b) => fs.statSync(path.join(DATA_DIR, b)).mtimeMs - fs.statSync(path.join(DATA_DIR, a)).mtimeMs);
        const latest = files[0];
        if (latest) {
          const csvPath = path.join(DATA_DIR, latest);
          console.log(` 采集完成: ${csvPath}`);
          resolve(csvPath);
        } else {
          // MediaCrawler默认输出到自身目录
          const mcFiles = fs.readdirSync(MEDIACRAWLER_DIR).filter((f) => f.endsWith(".csv")).sort((a, b) => fs.statSync(path.join(MEDIACRAWLER_DIR, b)).mtimeMs - fs.statSync(path.join(MEDIACRAWLER_DIR, a)).mtimeMs);
          const mc = mcFiles[0];
          if (mc) {
            const dest = path.join(DATA_DIR, `${platform}_${Date.now()}.csv`);
            fs.copyFileSync(path.join(MEDIACRAWLER_DIR, mc), dest);
            console.log(` 采集完成: ${dest}`);
            resolve(dest);
          } else {
            reject(new Error("未找到输出文件"));
          }
        }
      } else {
        reject(new Error(`爬虫退出码: ${code}`));
      }
    });
  });
}

// ── Parse CSV ──
function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, "utf-8");
  const rows = [];
  let current = "";
  let inQuotes = false;
  const allFields = [];

  // 状态机解析：处理引号包裹的字段
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      allFields.push(current.trim());
      current = "";
    } else if (ch === "\n" && !inQuotes) {
      allFields.push(current.trim());
      rows.push(allFields.splice(0));
      current = "";
    } else if (ch === "\r") {
      // skip
    } else {
      current += ch;
    }
  }
  // 最后一行
  if (current) {
    allFields.push(current.trim());
    rows.push(allFields.splice(0));
  }

  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
}

// ── Build analysis prompt ──
function buildAnalysisData(rows) {
  const sample = rows.slice(0, 30);
  const hasTranscript = sample.some((r) => (r.transcript || "").length > 10);
  let text = `共 ${rows.length} 条笔记。以下是前 ${sample.length} 条数据:\n\n`;
  sample.forEach((r, i) => {
    const title = r.title || r.desc || r.note_title || "";
    const likes = r.likes || r.liked_count || "0";
    const collects = r.collects || r.collected_count || "0";
    const comments = r.comments || r.comment_count || "0";
    const cover = r.cover || r.image_list || "";
    const transcript = r.transcript || "";
    text += `[${i + 1}] 标题: ${title}\n点赞:${likes} 收藏:${collects} 评论:${comments}\n封面:${cover}\n`;
    if (transcript && transcript.length > 5) {
      text += `口播内容: ${transcript.slice(0, 500)}\n`;
    }
    text += `\n`;
  });
  if (hasTranscript) {
    text += `\n注意：以上数据包含"口播内容"字段，是视频中实际说出的话，是分析标题党vs实际内容差异、内容深度、价值密度的重要依据。\n`;
  }
  return text;
}

async function analyzeData(csvPath) {
  const rows = parseCSV(csvPath);
  if (rows.length === 0) throw new Error("CSV 为空");

  console.log(` 已解析 ${rows.length} 条笔记，启动 AI 分析...`);

  const dataText = buildAnalysisData(rows);

  // 分维度分析，避免单次 prompt 过长
  const tasks = [
    { key: "概览与定位", system: "你是社交媒体策略分析师，擅长账号定位和内容策略分析。输出使用中文。", prompt: `根据以下博主笔记数据，分析账号定位、人设标签、内容栏目分类、受众画像。输出结构化分析报告，包含具体数据引用。\n\n${dataText}` },
    { key: "爆款拆解", system: "你是爆款内容分析师，擅长拆解热门笔记的成功要素。", prompt: `从以下数据中识别点赞/收藏/评论最高的 Top 8 笔记，对每一条拆解：标题公式（用了什么结构）、封面视觉元素（颜色/构图/文字层次）、爆款原因。输出逐条详细分析。\n\n${dataText}` },
    { key: "数据对比", system: "你是数据分析师，擅长从数据中发现规律。", prompt: `对以下笔记数据进行点赞/收藏/评论三围对比分析：找出数据分布规律、异常值、高收藏低点赞（实用型内容）vs 高点赞低收藏（情绪型内容）的分类特征、最佳发布时间。\n\n${dataText}` },
    { key: "用户需求", system: "你是用户研究员，擅长从内容互动中洞察用户深层需求。", prompt: `从以下笔记数据中分析用户需求：哪些内容类型最受欢迎、用户在点赞/收藏/评论中体现了什么需求（情绪共鸣/实用技巧/身份认同/消费决策）、未满足的需求缺口是什么。\n\n${dataText}` },
    { key: "种草与转化", system: "你是电商内容策略师，擅长拆解内容营销逻辑。", prompt: `从以下笔记数据中拆解种草逻辑和转化路径：种草类笔记占比、种草结构模式（痛点→场景→产品→效果→行动指令）、评论区购买意向关键词、转化率线索。\n\n${dataText}` },
    { key: "模板提取", system: "你是内容策略师，擅长将成功模式提炼为可复用模板。", prompt: `从以下笔记数据中提炼可模仿的模板：
1. 标题模板（3-5 个公式，每个带1个原例子）
2. 封面模板（颜色搭配+排版结构的通用公式）
3. 正文结构模板（开头钩子→中间展开→结尾行动指令的通用框架）
每个模板要具体可操作，不能是泛泛的概括。\n\n${dataText}` },
  ];

  const results = {};
  for (const t of tasks) {
    console.log(`\n 分析 [${t.key}] ...`);
    const start = Date.now();
    results[t.key] = await gptChat(t.system, t.prompt);
    console.log(`  完成, 耗时 ${((Date.now() - start) / 1000).toFixed(0)}s`);
  }
  return { rows, results };
}

// ── Generate Obsidian Report ──
function generateReport(blogger, platform, analysisResult) {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = blogger.replace(/[\\/:*?"<>|]/g, "-");
  const filename = `${date}_${safeName}_${platform}竞品分析.md`;
  const filepath = path.join(OUTPUT_DIR, filename);

  const { rows, results } = analysisResult;

  let md = `---
platform: ${platform}
blogger: "${blogger}"
date: ${date}
type: 竞品分析
笔记数: ${rows.length}
tags: [竞品分析, ${platform}, 爆款拆解, 内容策略]
---

# ${blogger} ${platform}竞品分析

> 分析日期: ${date} | 采集笔记数: ${rows.length} | 分析工具: GPT (${OPENAI_MODEL})

---

## 一、账号概览与定位

${results["概览与定位"]}

---

## 二、爆款笔记逐条拆解

${results["爆款拆解"]}

---

## 三、数据对比分析

${results["数据对比"]}

---

## 四、评论区用户需求洞察

${results["用户需求"]}

---

## 五、种草逻辑与转化路径

${results["种草与转化"]}

---

## 六、可模仿模板

${results["模板提取"]}

---

## 七、行动建议（AI 生成，仅供参考）

### 下周可测试的方向
1. 基于以上分析，优先级最高的 3 个内容方向
2. 可立即套用的标题公式
3. 封面优化建议

### 风险管理
- 以上分析基于 ${rows.length} 条公开笔记数据，样本量有限
- 互动数据受平台推荐算法影响，不完全反映内容质量
- 建议持续观察 2-4 周验证模板有效性

---

*报告由 creator-analyzer 自动生成 | 数据源: MediaCrawler | 分析引擎: GPT (${OPENAI_MODEL})*
`;

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, md, "utf-8");
  console.log(`\n 报告已保存: ${filepath}`);
  return filepath;
}

// ── CLI ──
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log(`博主内容分析工具

用法:
  node analyze.js scrape xhs "博主主页URL"      爬取小红书
  node analyze.js scrape dy "博主主页URL"       爬取抖音
  node analyze.js analyze data.csv              分析已有 CSV
  node analyze.js quick xhs "博主主页URL"       爬取+分析一键完成
  node analyze.js quick dy "博主主页URL"        爬取+分析一键完成`);
    return;
  }

  const cmd = args[0];

  try {
    if (cmd === "scrape") {
      const platform = args[1];     // xhs or dy → MediaCrawler platform name
      const url = args[2];
      const p = platform === "dy" ? "douyin" : "xhs";
      const csvPath = await scrape(p, url);
      console.log(`\nCSV 已保存: ${csvPath}`);
      console.log("下一步: node analyze.js analyze", csvPath);
    } else if (cmd === "analyze") {
      const csvPath = args[1];
      const rows = parseCSV(csvPath);
      const blogger = rows[0]?.author || rows[0]?.authorId || path.basename(csvPath, ".csv");
      const platform = csvPath.includes("dy_") ? "抖音" : "小红书";
      const result = await analyzeData(csvPath);
      generateReport(blogger, platform, result);
    } else if (cmd === "quick") {
      const platform = args[1];
      const url = args[2];
      const p = platform === "dy" ? "douyin" : "xhs";
      const csvPath = await scrape(p, url);
      const rows = parseCSV(csvPath);
      const blogger = rows[0]?.author || path.basename(csvPath, ".csv").replace(/^dy_|^xhs_/, "").replace(/_\d+$/, "");
      const platformName = platform === "dy" ? "抖音" : "小红书";
      const result = await analyzeData(csvPath);
      generateReport(blogger, platformName, result);
    } else {
      console.log("未知命令:", cmd);
    }
  } catch (err) {
    console.error("错误:", err.message);
    process.exit(1);
  }
}

main();
