#!/usr/bin/env node
/**
 * 抖音创作者爬虫 — Playwright + Chrome headless + 可选口播转录
 *
 * 用法:
 *   node scrape-dy-creator.js "https://v.douyin.com/xxx/" [max]              仅爬元数据
 *   node scrape-dy-creator.js "https://v.douyin.com/xxx/" [max] --transcribe 爬取 + 口播转文字
 *
 * 转录需要 GROQ_API_KEY 环境变量（免费，https://console.groq.com 注册即得）
 */

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const ffmpegPath = require("ffmpeg-static");

const DATA_DIR = path.join(__dirname, "data");
const AUDIO_DIR = path.join(__dirname, "audio");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const transcribeFlag = args.includes("--transcribe");
const cleanArgs = args.filter((a) => a !== "--transcribe");
const SHORT_URL = cleanArgs[0];
const MAX_NOTES = parseInt(cleanArgs[1] || "30", 10);

const GROQ_KEY =
  process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || "";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 短链接解析 ──
async function resolveShortLink(shortUrl) {
  const resp = await fetch(shortUrl, { redirect: "manual" });
  const location = resp.headers.get("location") || "";
  const secUidMatch = location.match(/sec_uid=([^&]+)/);
  return { location, secUid: secUidMatch ? secUidMatch[1] : "" };
}

// ── 爬取创作者元数据 ──
async function scrapeCreator(shortUrl) {
  console.log(`\n 解析短链接: ${shortUrl}`);
  const { location, secUid } = await resolveShortLink(shortUrl);
  if (!secUid) throw new Error("无法从短链接提取 sec_uid");

  let creatorName = "";
  try {
    const shareResp = await fetch(location, {
      headers: { "User-Agent": USER_AGENT },
    });
    const html = await shareResp.text();
    const nameMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    if (nameMatch) creatorName = nameMatch[1];
  } catch {}

  console.log(` 创作者: ${creatorName || "(未知)"} | sec_uid: ${secUid}`);
  console.log(` 启动浏览器...`);

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  const videos = [];
  const seenIds = new Set();

  function collectVideos(items, authorFallback) {
    for (const aweme of items) {
      const vid = aweme?.aweme_id || "";
      if (!vid || seenIds.has(vid)) continue;
      seenIds.add(vid);
      const stats = aweme?.statistics || {};
      videos.push({
        id: vid,
        desc: (aweme?.desc || "").replace(/\n/g, " ").replace(/#/g, ""),
        author: aweme?.author?.nickname || authorFallback,
        likes: stats.digg_count ?? 0,
        collects: stats.collect_count ?? 0,
        comments: stats.comment_count ?? 0,
        shares: stats.share_count ?? 0,
        plays: stats.play_count ?? 0,
        duration: aweme?.video?.duration ?? 0,
        cover: aweme?.video?.cover?.url_list?.[0] || "",
        videoUrl: aweme?.video?.play_addr?.url_list?.[0] || "",
        create_time: aweme?.create_time
          ? new Date(aweme.create_time * 1000).toISOString().slice(0, 10)
          : "",
      });
    }
  }

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      locale: "zh-CN",
    });

    const page = await context.newPage();

    const userPage = `https://www.douyin.com/user/${secUid}`;
    console.log(` 访问: ${userPage}`);
    let retries = 0;
    while (retries < 3) {
      try {
        await page.goto(userPage, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        break;
      } catch (e) {
        retries++;
        if (retries >= 3) throw e;
        console.log(`  重试 ${retries}/3: ${e.message.slice(0, 50)}`);
        await sleep(3000);
      }
    }
    await sleep(3000);

    // 主动 API 翻页
    let cursor = 0;
    let pageNum = 0;
    const MAX_PAGES = 20;

    while (videos.length < MAX_NOTES && pageNum < MAX_PAGES) {
      pageNum++;
      const result = await page.evaluate(async ({ secUid, cursor }) => {
        const url = `https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=${secUid}&max_cursor=${cursor}&count=20&aid=6383&version_code=170400`;
        const resp = await fetch(url, { credentials: "include" });
        const json = await resp.json();
        return {
          items: json?.aweme_list || [],
          hasMore: json?.has_more === 1,
          maxCursor: json?.max_cursor || 0,
        };
      }, { secUid, cursor });

      const { items, hasMore, maxCursor } = result;
      collectVideos(items, creatorName);
      cursor = maxCursor;

      // 如果开了转录，立即下载当前批次视频（链接过期快）
      if (transcribeFlag && items.length > 0) {
        await downloadBatch(items, pageNum);
      }

      process.stdout.write(`\r  第${pageNum}页: +${items.length}条, 累计${videos.length}条, has_more=${hasMore ? 1 : 0}`);

      if (!hasMore || items.length === 0) {
        console.log(`\n  API 返回 has_more=0，创作者视频已全部获取`);
        break;
      }

      await sleep(800);
    }

    console.log(`\n  完成，请求 ${pageNum} 次，采集 ${videos.length} 条视频`);
    return { videos: videos.slice(0, MAX_NOTES), creatorName, secUid };
  } finally {
    await browser.close();
  }
}

// ── 下载视频（爬取时立即调用，避免链接过期） ──
async function downloadBatch(items, pageNum) {
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
  for (const aweme of items) {
    const vid = aweme?.aweme_id || "";
    const url = aweme?.video?.play_addr?.url_list?.[0] || "";
    if (!vid || !url) continue;
    const videoPath = path.join(AUDIO_DIR, `${vid}.mp4`);
    if (fs.existsSync(videoPath)) continue;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Referer: "https://www.douyin.com/" },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(videoPath, buf);
      process.stdout.write(` v`);
    } catch {
      process.stdout.write(` x`);
    }
  }
}

// ── 音频提取（ffmpeg: MP4 → 16kHz mono WAV） ──
function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-i", videoPath,
      "-vn",               // 丢弃视频
      "-acodec", "pcm_s16le",
      "-ar", "16000",      // 16kHz (Whisper 推荐)
      "-ac", "1",          // mono
      "-y",                // 覆盖
      audioPath,
    ], { stdio: "pipe", timeout: 60000 });

    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code === 0) resolve(audioPath);
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-200)}`));
    });
    proc.on("error", reject);
  });
}

// ── Groq Whisper 转录 ──
async function transcribeAudio(audioPath) {
  if (!GROQ_KEY) throw new Error("未设置 GROQ_API_KEY 环境变量");

  const fileBuffer = fs.readFileSync(audioPath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), "audio.wav");
  formData.append("model", "whisper-large-v3");
  formData.append("language", "zh");
  formData.append("response_format", "text");

  const resp = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
      body: formData,
      signal: AbortSignal.timeout(120000),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq ${resp.status}: ${err.slice(0, 300)}`);
  }

  return (await resp.text()).trim();
}

// ── 对已下载视频提取音频 + 转录 ──
async function transcribeVideos(videos) {
  console.log(`\n 口播转录 (${videos.filter((v) => v.videoUrl).length} 条)...\n`);

  let done = 0;
  const withUrl = videos.filter((v) => v.videoUrl);
  for (const v of videos) {
    if (!v.videoUrl) {
      v.transcript = "";
      continue;
    }

    process.stdout.write(`  [${++done}/${withUrl.length}] ${v.desc.slice(0, 35)}... `);

    try {
      const videoPath = path.join(AUDIO_DIR, `${v.id}.mp4`);
      const audioPath = path.join(AUDIO_DIR, `${v.id}.wav`);

      // 视频已在爬取阶段下载
      if (!fs.existsSync(videoPath)) {
        // 降级：尝试现下载
        const resp = await fetch(v.videoUrl, {
          headers: { "User-Agent": USER_AGENT, Referer: "https://www.douyin.com/" },
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(videoPath, buf);
      }

      // 提取音频
      await extractAudio(videoPath, audioPath);

      // 转录
      v.transcript = await transcribeAudio(audioPath);
      console.log(`✓ (${v.transcript.length} 字)`);

      // 清理
      try { fs.unlinkSync(audioPath); } catch {}
      try { fs.unlinkSync(videoPath); } catch {}
    } catch (err) {
      v.transcript = "";
      console.log(`✗ ${err.message.slice(0, 80)}`);
    }

    await sleep(500);
  }

  console.log(`\n 转录完成: ${videos.filter((v) => v.transcript).length} 条`);
}

// ── 保存 CSV ──
function saveCSV(videos, creatorName) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const safeName = (creatorName || "douyin").replace(/[/\\:*?"<>|]/g, "-");
  const filename = `dy_${safeName}_${Date.now()}.csv`;
  const filepath = path.join(DATA_DIR, filename);

  const headers = [
    "id", "desc", "author", "likes", "collects", "comments",
    "shares", "plays", "duration", "cover", "create_time",
  ];
  if (transcribeFlag) headers.push("transcript");

  const rows = videos.map((v) =>
    headers.map((h) => {
      const val = (v[h] ?? "").toString();
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    })
  );

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  fs.writeFileSync(filepath, csv, "utf-8");
  console.log(` CSV 已保存: ${filepath}`);
  return filepath;
}

// ── Main ──
async function main() {
  if (!SHORT_URL) {
    console.log(`用法: node scrape-dy-creator.js <短链接> [最大数] [--transcribe]

示例:
  node scrape-dy-creator.js "https://v.douyin.com/xxx/" 30              仅爬元数据
  node scrape-dy-creator.js "https://v.douyin.com/xxx/" 30 --transcribe 爬取+口播转录

转录需要 GROQ_API_KEY 环境变量:
  set GROQ_API_KEY=gsk_xxx
  node scrape-dy-creator.js ... --transcribe`);
    process.exit(1);
  }

  if (transcribeFlag && !GROQ_KEY) {
    console.error(" 错误: --transcribe 需要 GROQ_API_KEY 环境变量");
    console.error(" 免费获取: https://console.groq.com/keys");
    process.exit(1);
  }

  try {
    const { videos, creatorName } = await scrapeCreator(SHORT_URL);
    if (videos.length === 0) {
      console.error(" 未采集到任何视频");
      process.exit(1);
    }

    if (transcribeFlag) {
      await transcribeVideos(videos);
    }

    const csvPath = saveCSV(videos, creatorName);
    console.log(`\n 下一步: node analyze.js analyze "${csvPath}"`);
  } catch (err) {
    console.error(" 错误:", err.message);
    process.exit(1);
  }
}

main();
