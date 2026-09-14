(() => {
  "use strict";

  const SUPPORTED_HOSTS = new Set([
    "chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com",
    "chat.deepseek.com", "deepseek.com", "www.deepseek.com", "chatglm.cn", "www.chatglm.cn"
  ]);
  const HISTORY_INDEX_KEY = "rockwellCaptureHistoryIndex";
  const SETTINGS_KEY = "rockwellBatchSettings041";
  const LEGACY_SETTINGS_KEY = "rockwellBatchSettings040";
  const UI_SETTINGS_KEY = "rockwellCaptureUiSettings041";
  const LEGACY_UI_SETTINGS_KEY = "rockwellCaptureUiSettings040";
  const core = globalThis.RockwellTowardsExportCore;

  const $ = (id) => document.getElementById(id);
  const ui = {
    refreshTabsButton: $("refreshTabsButton"), tabSummary: $("tabSummary"), tabList: $("tabList"),
    concurrencySelect: $("concurrencySelect"), speedMode: $("speedMode"), mediaMode: $("mediaMode"), autoScroll: $("autoScroll"), splitMessages: $("splitMessages"),
    includeUserImages: $("includeUserImages"), includeAiImages: $("includeAiImages"), includeAttachments: $("includeAttachments"),
    formatDocx: $("formatDocx"), formatMarkdown: $("formatMarkdown"), formatJson: $("formatJson"),
    selectAllTabsButton: $("selectAllTabsButton"), selectNoTabsButton: $("selectNoTabsButton"), startBatchButton: $("startBatchButton"), cancelBatchButton: $("cancelBatchButton"),
    batchNotice: $("batchNotice"), historyLimit: $("historyLimit"), refreshHistoryButton: $("refreshHistoryButton"), clearHistoryButton: $("clearHistoryButton"), historyList: $("historyList"), toast: $("toast")
  };

  let tasks = new Map();
  let batchRunning = false;
  let cancelRequested = false;
  let exportChain = Promise.resolve();

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { ui.toast.hidden = true; }, 2800);
  }

  function safeName(value) {
    return core?.safeName ? core.safeName(value) : String(value || "AI 对话").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").slice(0, 90);
  }

  function dateStamp(value) {
    return core?.dateStamp ? core.dateStamp(value) : new Date(value || Date.now()).toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  }

  function downloadBlob(blob, filename) {
    if (core?.download) return core.download(blob, filename);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function urlHost(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
  }

  function isSupportedUrl(url) {
    return SUPPORTED_HOSTS.has(urlHost(url));
  }

  function readSettings() {
    return {
      concurrency: Math.max(1, Math.min(2, Number(ui.concurrencySelect.value) || 2)),
      speedMode: ui.speedMode.value,
      mediaMode: ui.mediaMode.value,
      autoScroll: ui.autoScroll.value === "true",
      splitMessages: Math.max(0, Number(ui.splitMessages.value) || 0),
      includeUserImages: ui.includeUserImages.checked,
      includeAiImages: ui.includeAiImages.checked,
      includeAttachments: ui.includeAttachments.checked,
      formats: { docx: ui.formatDocx.checked, markdown: ui.formatMarkdown.checked, json: ui.formatJson.checked }
    };
  }

  async function saveSettings() {
    await chrome.storage.local.set({ [SETTINGS_KEY]: readSettings(), rockwellHistoryLimit: Number(ui.historyLimit.value) || 6 });
  }

  async function restoreSettings() {
    const stored = await chrome.storage.local.get([SETTINGS_KEY, LEGACY_SETTINGS_KEY, UI_SETTINGS_KEY, LEGACY_UI_SETTINGS_KEY, "rockwellHistoryLimit"]);
    const settings = stored[SETTINGS_KEY] || stored[LEGACY_SETTINGS_KEY] || stored[UI_SETTINGS_KEY] || stored[LEGACY_UI_SETTINGS_KEY] || {};
    if ([1, 2].includes(Number(settings.concurrency))) ui.concurrencySelect.value = String(settings.concurrency);
    if (["fast", "balanced", "complete"].includes(settings.speedMode)) ui.speedMode.value = settings.speedMode;
    if (["link", "standard", "full", "none"].includes(settings.mediaMode)) ui.mediaMode.value = settings.mediaMode;
    if (typeof settings.autoScroll === "boolean") ui.autoScroll.value = String(settings.autoScroll);
    if ([0, 500, 1000, 2000].includes(Number(settings.splitMessages))) ui.splitMessages.value = String(settings.splitMessages);
    for (const key of ["includeUserImages", "includeAiImages", "includeAttachments"]) {
      if (typeof settings[key] === "boolean") ui[key].checked = settings[key];
    }
    if (settings.formats) {
      ui.formatDocx.checked = settings.formats.docx !== false;
      ui.formatMarkdown.checked = Boolean(settings.formats.markdown);
      ui.formatJson.checked = Boolean(settings.formats.json);
    }
    const limit = Number(stored.rockwellHistoryLimit) || 6;
    ui.historyLimit.value = [3, 6, 10, 12].includes(limit) ? String(limit) : "6";
  }

  async function ensureContentScript(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "ROCKWELL_PING" });
      if (response?.ok) return response;
    } catch (error) {
      if (!/Receiving end does not exist|Could not establish connection|message port closed/i.test(error?.message || String(error))) throw error;
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const response = await chrome.tabs.sendMessage(tabId, { type: "ROCKWELL_PING" });
    if (!response?.ok) throw new Error("无法向该标签页注入 RockwellTowards。请刷新该 AI 对话页面后重试。");
    return response;
  }

  async function inspectTask(task) {
    task.status = "checking";
    renderTasks();
    try {
      await ensureContentScript(task.tabId);
      const status = await chrome.tabs.sendMessage(task.tabId, { type: "ROCKWELL_GET_STATUS", options: { extractionMode: "auto" } });
      if (!status?.ok || !status.supported) throw new Error("未识别到受支持的对话页面");
      task.title = status.title || task.title;
      task.platform = status.platform || "AI";
      task.modelLabel = status.modelLabel || task.platform;
      task.visibleMessageCount = status.visibleMessageCount || 0;
      task.status = status.captureActive ? "busy" : status.visibleMessageCount ? "ready" : "empty";
      task.detail = status.captureActive ? "此标签页已有捕获任务" : `当前可见 ${status.visibleMessageCount || 0} 条`;
      if (!status.visibleMessageCount) task.selected = false;
    } catch (error) {
      task.status = "failed";
      task.selected = false;
      task.detail = error?.message || String(error);
    }
    renderTasks();
  }

  async function refreshTabs() {
    if (batchRunning) return;
    ui.tabList.innerHTML = '<p class="empty">正在查找已打开的对话标签页…</p>';
    const tabs = (await chrome.tabs.query({})).filter((tab) => Number.isInteger(tab.id) && isSupportedUrl(tab.url || ""));
    tasks = new Map(tabs.map((tab) => [tab.id, {
      tabId: tab.id,
      title: tab.title || "AI 对话",
      url: tab.url || "",
      active: Boolean(tab.active),
      selected: true,
      status: "pending",
      detail: "等待检查",
      progress: 0
    }]));
    renderTasks();
    const queue = Array.from(tasks.values());
    for (let index = 0; index < queue.length; index += 4) {
      await Promise.all(queue.slice(index, index + 4).map(inspectTask));
    }
  }

  function statusLabel(task) {
    const map = {
      pending: "等待检查", checking: "检查中", ready: "可导出", empty: "无对话", busy: "已有任务",
      queued: "排队中", running: "捕获中", exporting: "生成文件", success: "完成", incomplete: "不完整", unverified: "未校验", failed: "失败", cancelled: "已停止"
    };
    return map[task.status] || task.status;
  }

  function renderTasks() {
    const list = Array.from(tasks.values()).sort((a, b) => Number(b.active) - Number(a.active) || a.tabId - b.tabId);
    ui.tabSummary.textContent = `${list.length} 个已打开对话标签页`;
    if (!list.length) {
      ui.tabList.innerHTML = '<p class="empty">没有找到已打开的 ChatGPT、Claude、Gemini、DeepSeek 或智谱清言对话。请先分别打开需要导出的对话标签页。</p>';
      return;
    }
    ui.tabList.textContent = "";
    const fragment = document.createDocumentFragment();
    for (const task of list) {
      const card = document.createElement("article");
      card.className = `task-card ${task.status}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(task.selected);
      checkbox.disabled = batchRunning || !["ready", "success", "incomplete", "unverified", "failed", "cancelled"].includes(task.status);
      checkbox.addEventListener("change", () => { task.selected = checkbox.checked; });
      const main = document.createElement("div");
      main.className = "task-main";
      const title = document.createElement("p");
      title.className = "task-title";
      title.textContent = task.title || "AI 对话";
      const meta = document.createElement("p");
      meta.className = "task-meta";
      meta.textContent = [task.modelLabel || task.platform, task.detail, task.url].filter(Boolean).join(" · ");
      const progress = document.createElement("div");
      progress.className = "task-progress";
      const bar = document.createElement("span");
      bar.style.width = `${Math.max(0, Math.min(100, task.progress || 0))}%`;
      progress.appendChild(bar);
      main.append(title, meta, progress);
      const state = document.createElement("div");
      state.className = "task-state";
      state.textContent = statusLabel(task);
      card.append(checkbox, main, state);
      fragment.appendChild(card);
    }
    ui.tabList.appendChild(fragment);
  }

  function captureOptions(settings) {
    const timeout = settings.speedMode === "complete" ? 18e5 : settings.speedMode === "fast" ? 6e5 : 12e5;
    return {
      autoScroll: settings.autoScroll,
      extractionMode: "auto",
      speedMode: settings.speedMode,
      mediaMode: settings.mediaMode,
      includeUserImages: settings.includeUserImages,
      includeAiImages: settings.includeAiImages,
      includeAttachments: settings.includeAttachments,
      maxDurationMs: timeout
    };
  }

  function setTaskProgress(task, payload = {}) {
    const phase = payload.phase || "";
    const current = Number(payload.current) || 0;
    const total = Math.max(1, Number(payload.total) || 1);
    let percent = Math.round(current / total * 100);
    if (phase === "up") percent = Math.min(47, 5 + Math.round(current / total * 42));
    if (phase === "down") percent = Math.min(96, 50 + Math.round(current / total * 46));
    if (phase === "archive") percent = 8;
    if (["done", "cancelled", "timeout", "quick"].includes(phase)) percent = 100;
    task.progress = Math.max(task.progress || 0, percent);
    const stats = payload.stats || {};
    task.detail = payload.detail || `已读取 ${stats.total || 0} 条`;
    renderTasks();
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== "ROCKWELL_CAPTURE_PROGRESS" || !sender.tab?.id) return;
    const task = tasks.get(sender.tab.id);
    if (task) setTaskProgress(task, message.payload);
  });

  function sliceCapture(capture, messages) {
    return {
      ...capture,
      messages,
      characterCount: messages.reduce((sum, message) => sum + (message.plainText?.length || 0), 0),
      userMessageCount: messages.filter((message) => message.role === "user").length,
      assistantMessageCount: messages.filter((message) => message.role === "assistant").length,
      imageCount: messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "image").length, 0),
      attachmentCount: messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "attachment").length, 0)
    };
  }

  async function exportCapture(capture, formats) {
    const base = `${dateStamp(capture.capturedAt)}_${safeName(capture.title)}_RockwellTowards`;
    const options = { template: "reading", pageSize: "A4", showMetadata: true, showHeader: true, showMessageNumbers: true, marginMm: 15 };
    if (formats.docx) {
      if (!core?.buildDocx) throw new Error("DOCX 生成核心未加载");
      const split = Math.max(0, Number(formats.splitMessages) || 0);
      const chunks = split ? Array.from({ length: Math.ceil((capture.messages?.length || 0) / split) }, (_, index) => (capture.messages || []).slice(index * split, (index + 1) * split)) : [capture.messages || []];
      for (let index = 0; index < chunks.length; index += 1) {
        const part = sliceCapture(capture, chunks[index]);
        const blob = await core.buildDocx(part, options);
        const suffix = chunks.length > 1 ? `_第${String(index + 1).padStart(2, "0")}卷` : "";
        downloadBlob(blob, `${base}${suffix}.docx`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    if (formats.markdown) {
      const markdown = core?.markdown ? core.markdown(capture, options) : JSON.stringify(capture, null, 2);
      downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    if (formats.json) {
      downloadBlob(new Blob([JSON.stringify(capture, null, 2)], { type: "application/json;charset=utf-8" }), `${base}.json`);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  async function runTask(task, settings) {
    if (cancelRequested) return;
    task.status = "running";
    task.progress = 2;
    task.detail = "准备读取页面";
    renderTasks();
    try {
      await ensureContentScript(task.tabId);
      const response = await chrome.tabs.sendMessage(task.tabId, { type: "ROCKWELL_CAPTURE", options: captureOptions(settings) });
      if (!response?.ok) throw new Error(response?.error || "捕获失败");
      const capture = response.payload;
      task.title = capture.title || task.title;
      task.modelLabel = capture.modelLabel || task.modelLabel;
      const completeness = capture.diagnostics?.completeness;
      const completenessText = completeness?.expectedMessageCount
        ? ` · 完整性 ${capture.messages?.length || 0}/${completeness.expectedMessageCount}`
        : capture.platformId === "chatgpt" ? " · 完整性未校验" : "";
      task.detail = `${capture.messages?.length || 0} 条 · 图片 ${capture.imageCount || 0}${Number.isFinite(capture.embeddedImageCount) ? `（嵌入 ${capture.embeddedImageCount || 0}${capture.failedImageCount ? ` / 失败 ${capture.failedImageCount}` : ""}）` : ""} · 附件 ${capture.attachmentCount || 0}${completenessText}`;
      task.progress = 100;
      task.status = "exporting";
      renderTasks();
      const exportJob = exportChain.then(() => exportCapture(capture, { ...settings.formats, splitMessages: settings.splitMessages }));
      exportChain = exportJob.catch(() => {});
      await exportJob;
      task.status = capture.captureStatus === "incomplete" ? "incomplete" : capture.captureStatus === "unverified" ? "unverified" : capture.partial ? "cancelled" : "success";
      task.detail += capture.captureStatus === "incomplete" ? " · 检测到缺失" : capture.captureStatus === "unverified" ? " · 无法验证全部历史" : capture.partial ? " · 部分结果已保存" : " · 已导出";
    } catch (error) {
      task.status = cancelRequested ? "cancelled" : "failed";
      task.detail = error?.message || String(error);
    }
    renderTasks();
  }

  async function startBatch() {
    if (batchRunning) return;
    const settings = readSettings();
    if (!settings.formats.docx && !settings.formats.markdown && !settings.formats.json) {
      toast("请至少选择一种导出格式");
      return;
    }
    const selected = Array.from(tasks.values()).filter((task) => task.selected && ["ready", "success", "incomplete", "unverified", "failed", "cancelled"].includes(task.status));
    if (!selected.length) {
      toast("请至少选择一个可导出的对话标签页");
      return;
    }
    await saveSettings();
    batchRunning = true;
    cancelRequested = false;
    ui.startBatchButton.disabled = true;
    ui.cancelBatchButton.disabled = false;
    ui.refreshTabsButton.disabled = true;
    selected.forEach((task) => { task.status = "queued"; task.progress = 0; task.detail = "等待开始"; });
    renderTasks();
    ui.batchNotice.textContent = `正在处理 ${selected.length} 条对话；并行捕获 ${settings.concurrency} 条。请保持本页与对话标签页打开。`;

    let cursor = 0;
    const worker = async () => {
      while (!cancelRequested) {
        const index = cursor++;
        if (index >= selected.length) return;
        await runTask(selected[index], settings);
      }
    };
    await Promise.all(Array.from({ length: Math.min(settings.concurrency, selected.length) }, worker));
    batchRunning = false;
    ui.startBatchButton.disabled = false;
    ui.cancelBatchButton.disabled = true;
    ui.refreshTabsButton.disabled = false;
    if (cancelRequested) selected.filter((task) => task.status === "queued").forEach((task) => { task.status = "cancelled"; task.detail = "未开始"; });
    renderTasks();
    ui.batchNotice.textContent = cancelRequested ? "批量任务已停止；已经完成的结果仍保存在最近记录中。" : "批量任务完成。所有捕获结果均已自动加入最近记录。";
    await loadHistory();
  }

  async function cancelBatch() {
    cancelRequested = true;
    ui.cancelBatchButton.disabled = true;
    const running = Array.from(tasks.values()).filter((task) => task.status === "running");
    await Promise.all(running.map(async (task) => {
      try { await chrome.tabs.sendMessage(task.tabId, { type: "ROCKWELL_CANCEL_CAPTURE" }); } catch {}
    }));
    toast("正在停止任务并保存已读取部分");
  }

  async function loadRecord(summary) {
    const result = await chrome.storage.local.get(summary.recordKey);
    const capture = result[summary.recordKey];
    if (!capture?.messages) throw new Error("该记录正文已不存在或存储损坏");
    return capture;
  }

  async function deleteHistoryRecord(summary) {
    const stored = await chrome.storage.local.get(HISTORY_INDEX_KEY);
    const index = (stored[HISTORY_INDEX_KEY] || []).filter((item) => item.id !== summary.id);
    await chrome.storage.local.remove(summary.recordKey);
    await chrome.storage.local.set({ [HISTORY_INDEX_KEY]: index });
    await loadHistory();
  }

  async function openHistoryPreview(summary) {
    const capture = await loadRecord(summary);
    await chrome.storage.local.set({ rockwellLastCapture: capture, rockwellPreviewPayload: capture });
    await chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") });
  }

  async function exportHistory(summary, format) {
    const capture = await loadRecord(summary);
    await exportCapture(capture, { docx: format === "docx", markdown: format === "markdown", json: format === "json" });
    toast(`${format.toUpperCase()} 已生成`);
  }

  async function loadHistory() {
    const stored = await chrome.storage.local.get(HISTORY_INDEX_KEY);
    const index = Array.isArray(stored[HISTORY_INDEX_KEY]) ? stored[HISTORY_INDEX_KEY] : [];
    ui.historyList.textContent = "";
    if (!index.length) {
      ui.historyList.innerHTML = '<p class="empty">暂无记录。完成一次捕获后，这里会自动保留最近几次结果。</p>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const summary of index) {
      const card = document.createElement("article");
      card.className = "history-card";
      const marker = document.createElement("span");
      marker.className = "pill";
      marker.textContent = summary.partial ? "部分" : "完整";
      const main = document.createElement("div");
      main.className = "history-main";
      const title = document.createElement("p");
      title.className = "history-title";
      title.textContent = summary.title || "AI 对话";
      const meta = document.createElement("p");
      meta.className = "history-meta";
      const time = summary.capturedAt ? new Date(summary.capturedAt).toLocaleString("zh-CN") : "未知时间";
      meta.textContent = `${summary.modelLabel || summary.platform || "AI"} · ${summary.messageCount || 0} 条 · 图片 ${summary.imageCount || 0} · 附件 ${summary.attachmentCount || 0} · ${time}`;
      main.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "history-actions";
      const button = (label, handler, className = "") => {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.className = className;
        element.addEventListener("click", async () => {
          element.disabled = true;
          try { await handler(); } catch (error) { toast(error?.message || String(error)); }
          finally { element.disabled = false; }
        });
        return element;
      };
      actions.append(
        button("预览整理", () => openHistoryPreview(summary)),
        button("DOCX", () => exportHistory(summary, "docx")),
        button("Markdown", () => exportHistory(summary, "markdown")),
        button("JSON", () => exportHistory(summary, "json")),
        button("删除", async () => {
          if (confirm(`确定删除“${summary.title || "该记录"}”吗？`)) await deleteHistoryRecord(summary);
        }, "delete")
      );
      card.append(marker, main, actions);
      fragment.appendChild(card);
    }
    ui.historyList.appendChild(fragment);
  }

  async function clearHistory() {
    if (!confirm("确定清空全部最近记录吗？此操作无法恢复。")) return;
    const stored = await chrome.storage.local.get(HISTORY_INDEX_KEY);
    const index = Array.isArray(stored[HISTORY_INDEX_KEY]) ? stored[HISTORY_INDEX_KEY] : [];
    await chrome.storage.local.remove([HISTORY_INDEX_KEY, ...index.map((item) => item.recordKey).filter(Boolean)]);
    await loadHistory();
    toast("最近记录已清空");
  }

  ui.refreshTabsButton.addEventListener("click", refreshTabs);
  ui.selectAllTabsButton.addEventListener("click", () => { tasks.forEach((task) => { if (task.status === "ready") task.selected = true; }); renderTasks(); });
  ui.selectNoTabsButton.addEventListener("click", () => { tasks.forEach((task) => { task.selected = false; }); renderTasks(); });
  ui.startBatchButton.addEventListener("click", startBatch);
  ui.cancelBatchButton.addEventListener("click", cancelBatch);
  ui.refreshHistoryButton.addEventListener("click", loadHistory);
  ui.clearHistoryButton.addEventListener("click", clearHistory);
  ui.historyLimit.addEventListener("change", async () => { await saveSettings(); toast("保留数量会在下一次捕获后生效"); });
  [ui.concurrencySelect, ui.speedMode, ui.mediaMode, ui.autoScroll, ui.splitMessages, ui.includeUserImages, ui.includeAiImages, ui.includeAttachments, ui.formatDocx, ui.formatMarkdown, ui.formatJson]
    .forEach((element) => element.addEventListener("change", () => saveSettings().catch(() => {})));

  (async () => {
    if (!core) {
      ui.batchNotice.textContent = "导出核心加载失败，请重新加载扩展。";
      ui.startBatchButton.disabled = true;
      return;
    }
    await restoreSettings();
    await Promise.all([refreshTabs(), loadHistory()]);
  })().catch((error) => {
    ui.batchNotice.textContent = `初始化失败：${error?.message || error}`;
  });
})();
