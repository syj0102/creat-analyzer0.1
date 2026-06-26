# 创作者选题雷达

这个项目不是单纯的采集器。

它的目标是帮创作者回答一个更值钱的问题：

> 我明天到底写什么、拍什么、怎么开头？

第一阶段先把公开账号内容整理成表格；第二阶段找出数据好的内容；第三阶段生成能直接用的选题、标题和账号拆解报告。

## 现在能做什么

当前稳定能力：

- 抖音博主作品整理
- 抖音视频口播转文字
- B站 UP 主作品整理
- CSV 输出
- 后续可接 GPT 做选题、话术和运营分析

当前实验能力：

- 小红书、快手、微博、贴吧、知乎保留实验路由
- 小红书优先验证
- 未跑通前，不标记为稳定能力

> 本项目仅建议用于个人学习、公开内容研究和合规的数据分析。请遵守平台规则、版权要求和相关法律法规，不要处理敏感、非公开或未经授权的数据。

## 一句话定位

给创作者看的选题工具。

不是告诉你“这个账号有多少数据”，而是帮你看懂：

- 哪些内容火了
- 为什么火
- 评论区在要什么
- 普通创作者能不能学
- 明天可以发什么

## 适合谁

适合这些人：

- 写公众号的人
- 做短视频的人
- 做小红书的人
- 想拆对标账号的人
- 不知道每天发什么的人
- 想把爆款内容拆成人话的人

不适合这些人：

- 想批量搬运别人内容的人
- 想绕平台规则的人
- 想采集非公开数据的人
- 只想看热闹、不想做内容的人

## 最小赚钱方式

先不要卖软件。

先卖一份简单服务：

> 我帮你拆一个对标账号，找出 10 个可写选题。

可以从三个档开始：

- 体验版：拆 1 个账号，给 10 个选题
- 标准版：拆 3 个账号，给选题、标题、开头方向
- 深度版：做 1 份账号拆解报告和 30 天选题表

真正能卖钱的不是“能采集”。

真正能卖钱的是：

> 帮别人省掉不知道写什么的痛苦。

## 文件说明

```text
creator-analyzer/
├─ lib/
│  ├─ cdp-client.js        # Chrome CDP 连接与浏览器内 fetch
│  ├─ csv.js               # CSV 转义与写入
│  └─ cli.js               # 命令行参数与安全文件名
├─ scrape-dy-creator-cdp.js      # 抖音作品整理脚本
├─ scrape-bili-creator-cdp.js    # B站 UP 主作品整理脚本
├─ scrape-creator-multi.js       # 多平台实验入口
├─ transcribe-dy-videos.py       # 抖音视频口播转写脚本
├─ analyze.js                    # 数据分析脚本
├─ douyin-crawler-gui.ps1        # 抖音图形界面
├─ 抖音博主采集器.cmd             # 双击启动抖音图形界面
├─ MULTI_PLATFORM_EXPERIMENT.md  # 多平台实验说明
├─ ROADMAP.md                    # 产品路线图
└─ DISCLAIMER.md                 # 免责声明
```

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

## 常用命令

查看多平台入口是否能正常解析参数：

```powershell
npm run dry-run
```

抖音：

```powershell
npm run dy -- "抖音主页链接或sec_uid" 20 --output-dir D:\creator-analyzer\output
```

B站：

```powershell
npm run bili -- "B站主页链接" 20 --output-dir D:\creator-analyzer\output\multi-test
```

多平台实验入口：

```powershell
node scrape-creator-multi.js auto "主页链接或ID" 20 --output-dir D:\creator-analyzer\output\multi-test
```

## 当前阶段

现在项目还在“工具地基”阶段。

下一步重点不是继续堆平台，而是做三件事：

1. 把小红书公开账号流程跑通
2. 把不同平台 CSV 整理成统一字段
3. 输出一份普通人能看懂的账号拆解报告

## 后续产品形态

最终希望输出三类东西：

- 爆款内容表：哪些内容值得学
- 评论需求表：用户到底想要什么
- 选题建议表：明天可以写什么

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
