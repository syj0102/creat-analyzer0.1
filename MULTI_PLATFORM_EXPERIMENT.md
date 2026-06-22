# 多平台采集实验版

当前实验版不修改原来的抖音稳定采集器。新增入口只负责做平台识别和路由：

- 抖音：默认继续调用 `scrape-dy-creator-cdp.js`
- 小红书、快手、B站、微博、贴吧、知乎：调用本机 `D:\MediaCrawler`

## 支持平台

| 平台 | 参数 | 入口识别 |
| --- | --- | --- |
| 抖音 | `dy` / `douyin` | `douyin.com`、`v.douyin.com`、`sec_uid` |
| 小红书 | `xhs` | `xiaohongshu.com`、`xhslink.com` |
| 快手 | `ks` | `kuaishou.com` |
| B站 | `bili` | `bilibili.com`、`b23.tv` |
| 微博 | `wb` | `weibo.com`、`weibo.cn` |
| 百度贴吧 | `tieba` | `tieba.baidu.com` |
| 知乎 | `zhihu` | `zhihu.com`、`zhuanlan.zhihu.com` |

## 离线测试

```powershell
cd D:\creator-analyzer
node test-platform-support.js
node scrape-creator-multi.js auto https://space.bilibili.com/123 5 --output-dir D:\creator-analyzer\output\multi-test --dry-run
```

## 真实采集测试

真实采集前需要确认 `D:\MediaCrawler` 已经可以运行，并按平台完成登录/扫码。

```powershell
cd D:\creator-analyzer
node scrape-creator-multi.js auto "博主主页链接或ID" 20 --output-dir D:\creator-analyzer\output\multi-test
```

也可以手动指定平台：

```powershell
node scrape-creator-multi.js xhs "小红书主页链接" 20 --output-dir D:\creator-analyzer\output\multi-test
node scrape-creator-multi.js bili "https://space.bilibili.com/123456" 20 --output-dir D:\creator-analyzer\output\multi-test
node scrape-creator-multi.js wb "https://weibo.com/u/123456" 20 --output-dir D:\creator-analyzer\output\multi-test
```

## 合并原则

只有在目标平台至少完成一次真实采集，并确认输出 CSV 能被后续分析/转写流程读取后，再把对应平台合进原来的图形界面。
