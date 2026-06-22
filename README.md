# Creator Analyzer

本地运行的创作者作品采集与内容分析工具。

当前稳定能力：

- 抖音博主作品采集
- 抖音视频口播转文字
- B站 UP 主作品采集
- CSV 输出
- 后续可接 GPT 做选题、话术和运营分析

> 本项目仅建议用于个人学习、竞品研究和合规的数据分析。请遵守平台规则、版权要求和相关法律法规，不要采集或传播敏感、非公开或未经授权的数据。

## v0.2.0 更新

- 新增 B站 UP 主作品采集：`scrape-bili-creator-cdp.js`
- 新增多平台实验入口：`scrape-creator-multi.js`
- 抖音仍默认使用原来已跑通的稳定采集器
- B站已用真实主页测试通过
- 小红书、快手、微博、贴吧、知乎目前只保留实验路由，未标记为稳定能力

## 文件说明

- `抖音博主采集器.cmd`：双击启动抖音图形界面
- `douyin-crawler-gui.ps1`：抖音图形界面
- `scrape-dy-creator-cdp.js`：抖音作品采集脚本
- `scrape-bili-creator-cdp.js`：B站 UP 主作品采集脚本
- `scrape-creator-multi.js`：多平台实验入口
- `transcribe-dy-videos.py`：抖音视频口播转写脚本
- `analyze.js`：数据分析脚本
- `MULTI_PLATFORM_EXPERIMENT.md`：多平台实验说明
- `DISCLAIMER.md`：免责声明

## 安装

需要：

- Node.js 18+
- Python 3.10+
- Chrome 或 Edge 浏览器

安装 Node 依赖：

```powershell
cd D:\creator-analyzer
npm install
```

如果需要抖音口播转写：

```powershell
cd D:\creator-analyzer
python -m venv .venv-transcribe
.\.venv-transcribe\Scripts\python.exe -m pip install -U pip faster-whisper
```

## 抖音采集

1. 双击 `D:\creator-analyzer\抖音博主采集器.cmd`
2. 输入抖音分享短链、主页链接或 `sec_uid`
3. 选择输出目录
4. 首次使用先点“打开/登录浏览器”
5. 在浏览器中登录抖音并完成验证码
6. 回到工具点击“开始抓取”
7. 如需口播文字，勾选“抓取后转写口播”

默认输出目录：

```text
D:\creator-analyzer\output
```

## B站采集

B站脚本需要复用一个已登录的 9222 调试浏览器。

启动浏览器：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=D:\UserCaches\bilibili-cdp-profile https://www.bilibili.com
```

在打开的浏览器里登录 B站后，运行：

```powershell
cd D:\creator-analyzer
node scrape-creator-multi.js auto "https://space.bilibili.com/1375678265" 20 --output-dir D:\creator-analyzer\output\multi-test
```

也可以直接调用 B站脚本：

```powershell
node scrape-bili-creator-cdp.js "https://space.bilibili.com/1375678265" 20 --output-dir D:\creator-analyzer\output\multi-test
```

B站 CSV 字段包括：

- 标题
- 封面
- 播放
- 点赞
- 投币
- 收藏
- 评论
- 分享
- 弹幕
- 发布时间
- 视频链接

## 多平台实验入口

实验入口会自动识别平台：

```powershell
node scrape-creator-multi.js auto "主页链接或ID" 20 --output-dir D:\creator-analyzer\output\multi-test
```

当前状态：

- 抖音：稳定
- B站：稳定，已真实测试
- 小红书、快手、微博、贴吧、知乎：实验路由，依赖 `D:\MediaCrawler`，尚未逐个平台验证

## GitHub 上传前检查

仓库通过 `.gitignore` 排除了：

- 输出数据和转写结果
- 浏览器缓存和模型缓存
- Python 虚拟环境
- Node 依赖目录
- 密钥、环境变量文件和日志数据库
- 大体积压缩包和视频/音频临时文件

上传前可执行：

```powershell
rg -a -n "OPENAI_API_KEY|api_key|token" D:\creator-analyzer
git status --short
```
