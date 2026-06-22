#!/usr/bin/env node
/**
 * 抖音创作者采集（CDP 登录态版）
 *
 * 用法:
 *   node scrape-dy-creator-cdp.js <短链/主页/sec_uid> [max_notes] [--output-dir <dir>]
 *
 * 需要先启动带 --remote-debugging-port=9222 的 Chrome，并在其中登录抖音。
 * 输出增强 CSV：标题、封面、互动数据、视频播放地址等。
 */

const fs = require("fs");
const path = require("path");

const CDP_VERSION_URL = "http://127.0.0.1:9222/json/version";
const CDP_LIST_URL = "http://127.0.0.1:9222/json/list";
const target = process.argv[2];
const maxNotes = parseInt(process.argv[3] || "60", 10);
const outputDirArgIndex = process.argv.indexOf("--output-dir");
const outputDir = outputDirArgIndex >= 0 && process.argv[outputDirArgIndex + 1]
  ? process.argv[outputDirArgIndex + 1]
  : path.join(__dirname, "data");

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function getBrowserWsUrl() {
  const resp = await fetch(CDP_VERSION_URL);
  if (!resp.ok) throw new Error(`无法连接 Chrome CDP: ${resp.status}`);
  const json = await resp.json();
  if (!json.webSocketDebuggerUrl) throw new Error("Chrome CDP 未返回 webSocketDebuggerUrl");
  return json.webSocketDebuggerUrl;
}

async function getPageWsUrl(secUid) {
  const resp = await fetch(CDP_LIST_URL);
  if (!resp.ok) throw new Error(`无法读取 Chrome 页面列表: ${resp.status}`);
  const targets = await resp.json();
  const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  const userPage = pages.find((p) => (p.url || "").includes(`/user/${secUid}`));
  const douyinPage = pages.find((p) => (p.url || "").includes("douyin.com"));
  const page = userPage || douyinPage || pages[0];
  if (!page) throw new Error("未找到可用的 Chrome 页面，请先点“打开/登录浏览器”");
  return page.webSocketDebuggerUrl;
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const timeout = setTimeout(() => reject(new Error("连接页面 CDP 超时")), 15000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve({
        call(method, params = {}) {
          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params }));
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              if (pending.has(msgId)) {
                pending.delete(msgId);
                rej(new Error(`CDP 调用超时: ${method}`));
              }
            }, 120000);
            pending.set(msgId, { res, rej, timer });
          });
        },
        close() {
          ws.close();
        },
      });
    };
    ws.onerror = () => reject(new Error("连接页面 CDP 失败"));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const { res, rej, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message || "CDP error"} ${msg.error.data || ""}`.trim()));
      else res(msg.result);
    };
  });
}

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

function toVideoRow(aweme) {
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
    desc: (aweme?.desc || "").replace(/\n/g, " ").replace(/#/g, ""),
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

async function main() {
  if (!target) {
    console.log("用法: node scrape-dy-creator-cdp.js <短链/主页/sec_uid> [max_notes] [--output-dir <dir>]");
    process.exit(1);
  }

  const secUid = await resolveSecUid(target);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  await getBrowserWsUrl();
  const cdp = await createCdpClient(await getPageWsUrl(secUid));
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
  cdp.close();
  if (evalResult.exceptionDetails) {
    throw new Error(evalResult.exceptionDetails.text || "页面执行抓取脚本失败");
  }
  const result = evalResult.result.value;

  const rows = result.rows.slice(0, maxNotes);
  const safeName = (rows[0]?.author || "douyin").replace(/[/\\:*?"<>|]/g, "-");
  const filepath = path.join(outputDir, `dy_${safeName}_with_video_${Date.now()}.csv`);
  const headers = [
    "id", "desc", "author", "likes", "collects", "comments", "shares", "plays",
    "duration", "cover", "video_url", "video_uri", "video_width", "video_height",
    "video_size", "video_format", "create_time",
  ];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(","))].join("\n");
  fs.writeFileSync(filepath, csv, "utf-8");

  console.log(JSON.stringify({
    file: filepath,
    secUid,
    count: rows.length,
    title: result.title,
    pages: result.pages,
    sample: rows[0],
  }, null, 2));

}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
