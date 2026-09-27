# 知识探险岛

一、二年级语文数学的手机、平板网页游戏。四座岛对应四册资料，36 个单元、177 课、662 个知识点按教学顺序展示。每天推荐约五个任务，也可以在地图上自由选关。

在线游玩：<https://i.joysb.icu/>。本仓库包含源码、原创练习任务与语音；原始教材资料不在仓库中。

## 运行

需要 Node.js 20 或更新版本。

```bash
npm ci
npm run dev
```

浏览器打开终端显示的地址。开发模式用于调试，离线功能只在构建后的版本中启用。

## 构建与部署

```bash
npm run check:data
npm test
npm run build
npm run preview
```

线上地址：<https://i.joysb.icu/>。将 `dist/` 的**全部文件和目录**原样放到支持 HTTPS 的静态网站空间；也可以部署在网站的子路径。首次打开时保持联网，等待“可离线使用”提示出现，再添加到主屏幕。提示出现代表所有游戏内容与普通话语音已进入当前浏览器缓存。`localhost` 可用于本地安装测试，普通 HTTP 网址不能注册离线服务。静态托管须允许访问 `sw.js`、`manifest.webmanifest`、`assets/` 和 `audio/`，并以正确的 JavaScript、CSS、MP3 类型返回资源。更新部署包后，保持联网打开一次，让新的离线资源下载完成。

`dist/` 是完整的部署产物；不必上传原始教材资料、开发脚本或 `node_modules/`。首版不含账号和云同步。服务器的 OpenResty 配置和证书续期钩子见 `deploy/`。证书由 Certbot 的系统定时器自动续期；续期后钩子会复制新证书到容器挂载目录并重载 OpenResty。

## 游戏记录

- 客观题每个知识点有三种题目。不同日期正确完成三次后显示“已掌握”；前两次分别在次日和三天后安排复习。答错会出现提示并可重试。
- 朗读、口语、书写、写话和动手探究提供练习提示与自查项，可记录“已练习”或“自评会了”。自评不计入自动掌握。
- 多字识读任务也采用自评：这类知识点还要求读准整组字词、组词或书写，单道听音选择题不足以证明全部掌握。
- 星星记录每天的尝试，每个知识点每天最多一颗，不影响掌握判定。
- 进度保存在本设备浏览器中。家长设置支持导出 JSON 备份、导入备份和清空全部进度。清除浏览器网站数据会删除本地记录；换设备前请先导出。
- 指定课文的原文朗读、背诵保留教材页码，供有教材时对照；游戏中的练习可以独立使用。

## AI 语音功能

家长设置里的 AI 伴学实验室支持按需使用 MiMo 普通话识别和示范朗读。朗读任务会显示 AI 入口；录音仅在点击录制并结束后发送识别，结果作为练习参考，不会代替孩子自评或自动掌握判定。离线语音和玩法仍可单独工作。

服务端配置见 `server/`。在服务器 `/etc/knowledge-islands/ai.env` 设置 `XIAOMI_BASE_URL`、`XIAOMI_API_KEY`、`AI_ACCESS_PASSWORD` 和随机生成的 `AI_SESSION_SECRET`，再通过 Docker Compose 启动。标准 API 使用 `https://api.xiaomimimo.com/v1` 与 `sk-...` Key；Token Plan 使用 `https://token-plan-cn.xiaomimimo.com/v1` 与 `tp-...` Key。后端会在 BaseURL 后拼接 `/chat/completions`。`deploy/i.joysb.icu.conf` 将同域 `/api/ai/*` 请求转发给服务端。不要将真实环境文件提交到仓库。开发时可参考 `server/.env.example`；前端只保存短期会话令牌于当前标签页的 `sessionStorage`，密钥仅由服务端读取。

## 内容维护

运行中的应用只加载 `src/data/catalog.json` 与 `public/audio/`，不会加载资料目录。目录下的题目由 `scripts/generate_catalog.py` 从合并后的 `knowledge_base.json` 生成，语音由 `scripts/generate_audio.py` 生成。调整生成脚本后重新生成内容，再运行数据校验、测试和构建。

生成语音需要 macOS 的普通话 `Tingting` 语音及 `ffmpeg`；已有 `public/audio/` 文件时，安装和部署不需要这两个工具。脚本用法：

```bash
python3 scripts/generate_catalog.py '/path/to/knowledge_base.json'
python3 scripts/generate_audio.py --force --prune
npm run check:data
```

题目数据以 `kp_id` 为键，客观题与自评题采用不同结构。`npm run check:data` 检查知识点数量、引用、题目变体、答案、提示、解析和语音文件；`npm test` 检查复习安排、掌握与自评区分、跨册衔接和导入校验。
