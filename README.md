# RockwellTowards v0.4.3

RockwellTowards 是面向 Microsoft Edge / Chromium 的本地 AI 对话导出扩展，支持 DOCX、PDF、Markdown、JSON、批量任务、最近记录和长对话分卷。

## v0.4.3 重点修复

### ChatGPT 图片不再只靠网页节点

ChatGPT 长对话中的旧图片、用户上传图和 AI 生成图不一定仍存在于当前网页 DOM。v0.4.3 会同时读取：

- 当前页面渲染图片；
- 对话档案中的图片 URL；
- `image_asset_pointer`；
- `file-service://` 与 `sediment://` 资源；
- 附件元数据；
- 隐藏的 `image_gen/tool` 媒体结果。

隐藏工具消息中的图片会并入对应的可见 AI 回复，不会额外导出一堆内部工具消息。

捕获完成后会显示：

```text
图片 12（嵌入 11 / 失败 1）
```

“图片”表示发现的内容图片，“嵌入”表示已取得实体并可写入 DOCX/PDF，“失败”表示识别到图片但下载失败。

### 严格完整性校验

捕获流程为：

1. 读取 ChatGPT 当前活动分支；
2. 滚动页面补充格式、附件和可见媒体；
3. 捕获结束前再次刷新活动分支；
4. 比较预期消息数与实际消息数。

数量不一致时会标记为“不完整”，不会再出现 `124/123` 却声称完整的情况。

## 安装

1. 完整解压安装 ZIP。
2. 打开 `edge://extensions/`。
3. 开启“开发人员模式”。
4. 停用旧版 RockwellTowards。
5. 点击“加载解压缩的扩展”。
6. 选择 `RockwellTowards-Edge-Load-This-Folder-v0.4.3` 文件夹。
7. 刷新已经打开的 ChatGPT 对话页面。

## 推荐测试步骤

1. 先选择一条包含 1—3 张 ChatGPT 生成图的短对话。
2. 开启“AI 生成/回复图片”。
3. 图片处理选择“标准图”或“尽量保留高清图”。
4. 捕获后检查图片发现数、嵌入数和失败数。
5. 导出 DOCX，确认图片实体存在。
6. 再测试长对话并检查完整性分数。

## 具体模型名称

工具会汇总对话中识别到的具体模型，例如：

```text
GPT-5.6 Thinking / GPT-5.4 Thinking
```

页面没有公开准确名称时，可在弹窗中手动填写，手动名称按当前对话 URL 保存。

## 已知边界

- ChatGPT 内部对话和文件接口可能随网站更新变化。
- 已删除、无权限或签名彻底失效的图片无法恢复。
- 平台未把图片资源写入对话档案、页面也未加载时，扩展无法凭空取得实体。
- 本版尚未在用户真实登录环境中完成大规模图片压力测试。

## 下载

两个包都在 [Releases](https://github.com/rockwell425/rockwell-towards-edge/releases) 页面下载：

- **安装包** `RockwellTowards-Edge-v0.4.3.zip` —— 只含运行所需文件，解压后按上面的步骤加载即可。
- **完整源码包** `RockwellTowards-Edge-v0.4.3-source.zip` —— 额外包含 `tests/` 自动化测试脚本和 `legacy/` 历史版本。

## 开发与测试

需要 Node.js。测试脚本使用合成数据，不会读取你的真实对话：

```bash
cd tests
node test-chatgpt-archive.js
node test-chatgpt-scale.js
node test-chatgpt-media.js
node test-chatgpt-media-resolver.js
```

## 隐私

扩展完全在本地运行，不上传任何对话内容。捕获到的对话与图片只写入你本机下载的文件。申请的各站点权限仅用于在对应 AI 对话页面读取内容。

## 许可证

[MIT](LICENSE) © 2026 rockwell425
