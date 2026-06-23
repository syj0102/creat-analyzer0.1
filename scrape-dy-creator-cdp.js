#!/usr/bin/env node
/**
 * 抖音创作者采集（CDP 登录态版）
 *
 * 用法:
 *   node scrape-dy-creator-cdp.js <短链/主页/sec_uid> [max_notes] [--output-dir <dir>]
 *
 * 需要先启动带 --remote-debugging-port=9222 的 Chrome，并在其中登录抖音。
 */

const fs = require("fs");
const path = require("path");
const { getBrowserWsUrl, getPageWsUrl, createCdpClient } = require("./lib/cdp-client");
const { writeCsvFile } = require("./lib/csv");
const { readMaxNotes, readOutputDir, safeFilenamePart } = require("./lib/cli");

const target = process.argv[2];
const maxNotes = readMaxNotes(process.argv[3], 60);
const outputDir = readOutputDir(process.argv, path.join(__dirname, "data"));

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveSecUid(input) {
  const raw = (input || "").trim();
  if (!raw) throw new Error("请输入抖音短链、主页链接或 sec_uid");
  if (/^MS4wLjAB/i.test(raw)) return raw;

  let url = raw;
  if (!/^https?:\/\//i.test(url)) {
    if (raw.includes("douyin.com")) url = `https://${raw}`;
    else throw new Error("无法识别输入，请粘贴抖音分享链接/主页链接，或直接输入 sec_uid");
  }

  const directMatch = url.match(/\/user\/([^/?#]+)/) || url.match(/[?&]sec_uid=([^&#]+)/);
  if (directMatch) return decodeURIComponent(directMatch[1]);

  const resp = await fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const location = resp.headers.get("location") || "";
  const secUidMatch = location.match(/\/user\/([^/?#]+)/) || location.match(/[?&]sec_uid=([^&#]+)/);
  if (secUidMatch) return decodeURIComponent(secUidMatch[1]);

  throw new Error(`无法从链接解析 sec_uid: ${location || url}`);
}

async function main() {
  if (!target) {
    console.log("用法: node scrape-dy-creator-cdp.js <短链/主页/sec_uid> [max_notes] [--output-dir <dir>]");
    process.exit(1);
  }

  const secUid = await resolveSecUid(target);
  fs.mkdirSync(outputDir, { recursive: true });

  await getBrowserWsUrl();
  const cdp = await createCdpClient(await getPageWsUrl({
    preferUrlIncludes: [`/user/${secUid}`, "douyin.com"],
    emptyMessage: "未找到可用的 Chrome 页面，请先点“打开/登录浏览器”",
  }));

  try {
    await cdp.call("Runtime.enable").catch(() => {});
    await cdp.call("Page.enable").catch(() => {});
    await cdp.call("Page.navigate", { url: `https://www.douyin.com/user/${secUid}` }).catch(() => {});
    await delay(4000);

    const expression = `(${async ({ secUid, maxNotes }) => {
      const videos = [];
      const seenIds = new Set();
      const pages = [];
      let cursor = 0;

      for (let pageNum = 1; videos.length < maxNotes && pageNum <= 20; pageNum++) {
        const url = `https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=${secUid}&max_cursor=${cursor}&count=20&aid=6383&version_code=170400`;
        const resp = await fetch(url, { credentials: "include" });
        const body = await resp.text();
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {}

        const items = json?.aweme_list || [];
        pages.push({
          pageNum,
          httpStatus: resp.status,
          statusCode: json?.status_code,
          hasMore: json?.has_more,
          maxCursor: json?.max_cursor,
          count: items.length,
        });

        if (!items.length) break;
        for (const aweme of items) {
          const id = aweme?.aweme_id || "";
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          videos.push(aweme);
        }

        cursor = json?.max_cursor || 0;
        if (json?.has_more !== 1) break;
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      function toRow(aweme) {
        const stats = aweme?.statistics || {};
        const video = aweme?.video || {};
        const playAddr = video.play_addr || {};
        const bitRate = Array.isArray(video.bit_rate) ? video.bit_rate[0] : null;
        const bestPlayAddr = bitRate?.play_addr || playAddr;
        const videoUrl = bestPlayAddr?.url_list?.find((u) => u.includes("video_mp4")) ||
          playAddr?.url_list?.find((u) => u.includes("video_mp4")) ||
          bestPlayAddr?.url_list?.[0] ||
          playAddr?.url_list?.[0] ||
          "";

        return {
          id: aweme?.aweme_id || "",
          desc: (aweme?.desc || "").replace(/\\n/g, " ").replace(/#/g, ""),
          author: aweme?.author?.nickname || "",
          likes: stats.digg_count ?? 0,
          collects: stats.collect_count ?? 0,
          comments: stats.comment_count ?? 0,
          shares: stats.share_count ?? 0,
          plays: stats.play_count ?? 0,
          duration: video.duration ?? 0,
          cover: video.cover?.url_list?.[0] || "",
          video_url: videoUrl,
          video_uri: playAddr.uri || video.play_addr_h264?.uri || "",
          video_width: playAddr.width || video.width || "",
          video_height: playAddr.height || video.height || "",
          video_size: playAddr.data_size || bestPlayAddr?.data_size || "",
          video_format: bitRate?.format || video.format || "",
          create_time: aweme?.create_time
            ? new Date(aweme.create_time * 1000).toISOString().slice(0, 10)
            : "",
        };
      }

      return {
        title: document.title,
        pages,
        rows: videos.map(toRow),
      };
    }})((${JSON.stringify({ secUid, maxNotes })}))`;

    const evalResult = await cdp.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 120000,
    });

    if (evalResult.exceptionDetails) {
      throw new Error(evalResult.exceptionDetails.text || "页面执行抓取脚本失败");
    }

    const result = evalResult.result.value;
    const rows = result.rows.slice(0, maxNotes);
    const safeName = safeFilenamePart(rows[0]?.author, "douyin");
    const filepath = path.join(outputDir, `dy_${safeName}_with_video_${Date.now()}.csv`);
    const headers = [
      "id", "desc", "author", "likes", "collects", "comments", "shares", "plays",
      "duration", "cover", "video_url", "video_uri", "video_width", "video_height",
      "video_size", "video_format", "create_time",
    ];

    writeCsvFile(filepath, rows, headers);

    console.log(JSON.stringify({
      file: filepath,
      secUid,
      count: rows.length,
      title: result.title,
      pages: result.pages,
      sample: rows[0] || null,
    }, null, 2));
  } finally {
    cdp.close();
  }
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
