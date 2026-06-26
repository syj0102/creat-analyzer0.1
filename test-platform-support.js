const assert = require("assert");
const path = require("path");
const {
  normalizePlatform,
  detectPlatform,
  resolvePlatform,
  buildMediaCrawlerArgs,
  buildStableDouyinArgs,
  buildStableBilibiliArgs,
} = require("./platform-support");

assert.strictEqual(normalizePlatform("dy"), "douyin");
assert.strictEqual(normalizePlatform("抖音"), "douyin");
assert.strictEqual(normalizePlatform("小红书"), "xhs");
assert.strictEqual(normalizePlatform("red"), "xhs");
assert.strictEqual(normalizePlatform("B站"), "bilibili");

assert.strictEqual(detectPlatform("https://v.douyin.com/abc/"), "douyin");
assert.strictEqual(detectPlatform("MS4wLjABAAAAxxx"), "douyin");
assert.strictEqual(detectPlatform("https://www.xiaohongshu.com/user/profile/abc"), "xhs");
assert.strictEqual(detectPlatform("https://xhslink.com/a/demo"), "xhs");
assert.strictEqual(detectPlatform("https://www.kuaishou.com/profile/abc"), "kuaishou");
assert.strictEqual(detectPlatform("https://space.bilibili.com/123"), "bilibili");
assert.strictEqual(detectPlatform("https://weibo.com/u/123"), "weibo");
assert.strictEqual(detectPlatform("https://tieba.baidu.com/home/main?id=abc"), "tieba");
assert.strictEqual(detectPlatform("https://www.zhihu.com/people/abc"), "zhihu");

assert.strictEqual(resolvePlatform("auto", "https://space.bilibili.com/123"), "bilibili");
assert.strictEqual(resolvePlatform("auto", "https://xhslink.com/a/demo"), "xhs");

const mcArgs = buildMediaCrawlerArgs({
  platform: "xhs",
  target: "https://www.xiaohongshu.com/user/profile/abc",
  maxNotes: 12,
  outputDir: "D:\\out",
});
assert.deepStrictEqual(mcArgs.slice(0, 6), ["run", "main.py", "--platform", "xhs", "--lt", "qrcode"]);
assert.ok(mcArgs.includes("--type"));
assert.ok(mcArgs.includes("creator"));
assert.ok(mcArgs.includes("--creator_id"));
assert.ok(mcArgs.includes("--crawler_max_notes_count"));
assert.ok(mcArgs.includes("12"));
assert.ok(mcArgs.includes("--save_data_option"));
assert.ok(mcArgs.includes("csv"));
assert.ok(mcArgs.includes("--get_comment"));
assert.ok(mcArgs.includes("false"));

const dyArgs = buildStableDouyinArgs({
  rootDir: "D:\\creator-analyzer",
  target: "MS4wLjABAAAAxxx",
  maxNotes: 8,
  outputDir: "D:\\out",
});
assert.strictEqual(dyArgs[0], path.join("D:\\creator-analyzer", "scrape-dy-creator-cdp.js"));
assert.strictEqual(dyArgs[1], "MS4wLjABAAAAxxx");
assert.strictEqual(dyArgs[2], "8");

const biliArgs = buildStableBilibiliArgs({
  rootDir: "D:\\creator-analyzer",
  target: "https://space.bilibili.com/123",
  maxNotes: 9,
  outputDir: "D:\\out",
});
assert.strictEqual(biliArgs[0], path.join("D:\\creator-analyzer", "scrape-bili-creator-cdp.js"));
assert.strictEqual(biliArgs[1], "https://space.bilibili.com/123");
assert.strictEqual(biliArgs[2], "9");

console.log("platform support tests passed");
