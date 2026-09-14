(() => {
  "use strict";
  const DRAFTS_KEY = "rockwellPreviewDrafts040";
  let capture = null;
  let applying = false;
  let saveTimer = null;
  let statusNode = null;

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function showStatus(text) {
    if (!statusNode) {
      statusNode = document.createElement("small");
      statusNode.style.cssText = "display:block;margin-top:3px;color:#70767c;font-size:10px";
      document.querySelector(".brand > div")?.appendChild(statusNode);
    }
    statusNode.textContent = text;
  }

  async function waitUntilReady() {
    for (let i = 0; i < 80; i += 1) {
      const cards = document.querySelectorAll(".message-card");
      if (cards.length || !document.querySelector("#messageList .loading")) return;
      await delay(100);
    }
  }

  function readDraft() {
    const messages = capture?.messages || [];
    const selectedIds = [];
    document.querySelectorAll('.message-card input[type="checkbox"]').forEach((checkbox, index) => {
      if (checkbox.checked && messages[index]?.id) selectedIds.push(messages[index].id);
    });
    return {
      captureId: capture?.captureId || "",
      title: document.querySelector("#titleInput")?.value || capture?.title || "AI 对话",
      selectedIds,
      template: document.querySelector("#templateSelect")?.value || "reading",
      pageSize: document.querySelector("#pageSizeSelect")?.value || "A4",
      margin: document.querySelector("#marginSelect")?.value || "15",
      split: document.querySelector("#splitSelect")?.value || "0",
      metadata: document.querySelector("#metadataCheck")?.checked !== false,
      header: document.querySelector("#headerCheck")?.checked !== false,
      numbers: document.querySelector("#numbersCheck")?.checked !== false,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveNow() {
    if (applying || !capture?.captureId) return;
    const result = await chrome.storage.local.get(DRAFTS_KEY);
    const drafts = result[DRAFTS_KEY] && typeof result[DRAFTS_KEY] === "object" ? result[DRAFTS_KEY] : {};
    drafts[capture.captureId] = readDraft();
    const entries = Object.entries(drafts).sort((a, b) => String(b[1]?.updatedAt || "").localeCompare(String(a[1]?.updatedAt || ""))).slice(0, 12);
    await chrome.storage.local.set({ [DRAFTS_KEY]: Object.fromEntries(entries) });
    showStatus(`整理状态已自动保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow().catch(() => showStatus("自动保存暂时失败")), 450);
  }

  async function restoreDraft() {
    const result = await chrome.storage.local.get(["rockwellPreviewPayload", "rockwellLastCapture", DRAFTS_KEY]);
    capture = result.rockwellPreviewPayload || result.rockwellLastCapture;
    if (!capture?.captureId) return;
    await waitUntilReady();
    const draft = result[DRAFTS_KEY]?.[capture.captureId];
    if (!draft) {
      showStatus("整理状态会自动保存，误触或关闭后可继续");
      scheduleSave();
      return;
    }
    applying = true;
    try {
      const setValue = (id, value) => {
        const element = document.querySelector(`#${id}`);
        if (!element || value == null) return;
        element.value = String(value);
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const setChecked = (id, value) => {
        const element = document.querySelector(`#${id}`);
        if (!element || typeof value !== "boolean") return;
        element.checked = value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const title = document.querySelector("#titleInput");
      if (title && draft.title) {
        title.value = draft.title;
        title.dispatchEvent(new Event("input", { bubbles: true }));
      }
      setValue("templateSelect", draft.template);
      setValue("pageSizeSelect", draft.pageSize);
      setValue("marginSelect", draft.margin);
      setValue("splitSelect", draft.split);
      setChecked("metadataCheck", draft.metadata);
      setChecked("headerCheck", draft.header);
      setChecked("numbersCheck", draft.numbers);
      const selected = new Set(Array.isArray(draft.selectedIds) ? draft.selectedIds : []);
      const messages = capture.messages || [];
      document.querySelectorAll('.message-card input[type="checkbox"]').forEach((checkbox, index) => {
        const desired = selected.has(messages[index]?.id);
        if (checkbox.checked !== desired) {
          checkbox.checked = desired;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      showStatus(`已恢复 ${new Date(draft.updatedAt).toLocaleString("zh-CN")} 的整理状态`);
    } finally {
      applying = false;
    }
  }

  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("#titleInput, #searchInput")) scheduleSave();
  }, true);
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.('input, select')) scheduleSave();
  }, true);
  document.addEventListener("click", (event) => {
    if (event.target?.matches?.("#selectAllButton, #selectNoneButton, #selectUserButton, #selectAssistantButton")) setTimeout(scheduleSave, 40);
  }, true);
  window.addEventListener("beforeunload", () => { saveNow().catch(() => {}); });
  setInterval(() => { if (!document.hidden) saveNow().catch(() => {}); }, 10000);
  restoreDraft().catch(() => showStatus("自动保存初始化失败"));
})();
