(() => {
  const SETTINGS_KEY = "rockwellCaptureUiSettings041";
  const LEGACY_SETTINGS_KEY = "rockwellCaptureUiSettings040";
  const MODEL_OVERRIDE_URL_KEY = "rockwellModelOverrideByUrl041";
  const MODEL_OVERRIDE_HOST_KEY = "rockwellModelOverrideByHost041";
  const fields = {
    speedMode: document.querySelector("#speedMode"),
    mediaMode: document.querySelector("#mediaMode"),
    modelOverride: document.querySelector("#modelOverride"),
    includeUserImages: document.querySelector("#includeUserImages"),
    includeAiImages: document.querySelector("#includeAiImages"),
    includeAttachments: document.querySelector("#includeAttachments"),
    autoScroll: document.querySelector("#autoScroll")
  };
  const workspaceButton = document.querySelector("#workspaceButton");
  const captureButton = document.querySelector("#captureButton");
  let currentTarget = null;

  function readSettings() {
    return {
      speedMode: fields.speedMode?.value || "balanced",
      mediaMode: fields.mediaMode?.value || "standard",
      includeUserImages: fields.includeUserImages?.checked !== false,
      includeAiImages: fields.includeAiImages?.checked !== false,
      includeAttachments: fields.includeAttachments?.checked !== false,
      autoScroll: fields.autoScroll?.checked !== false
    };
  }

  async function resolveCurrentTarget() {
    if (currentTarget) return currentTarget;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab?.url || "");
      url.hash = "";
      currentTarget = { url: url.href, host: url.hostname.toLowerCase() };
    } catch {
      currentTarget = { url: "", host: "" };
    }
    return currentTarget;
  }

  async function saveSettings() {
    const target = await resolveCurrentTarget();
    const stored = await chrome.storage.local.get([MODEL_OVERRIDE_URL_KEY, MODEL_OVERRIDE_HOST_KEY]);
    const byUrl = { ...(stored[MODEL_OVERRIDE_URL_KEY] || {}) };
    const modelOverride = String(fields.modelOverride?.value || "").trim();
    if (target.url) {
      if (modelOverride) byUrl[target.url] = modelOverride;
      else delete byUrl[target.url];
    }
    await chrome.storage.local.set({ [SETTINGS_KEY]: readSettings(), [MODEL_OVERRIDE_URL_KEY]: byUrl });
  }

  async function restoreSettings() {
    const target = await resolveCurrentTarget();
    const stored = await chrome.storage.local.get([SETTINGS_KEY, LEGACY_SETTINGS_KEY, MODEL_OVERRIDE_URL_KEY, MODEL_OVERRIDE_HOST_KEY, "rockwellCaptureHistoryIndex"]);
    const settings = stored[SETTINGS_KEY] || stored[LEGACY_SETTINGS_KEY] || {};
    if (fields.speedMode && ["fast", "balanced", "complete"].includes(settings.speedMode)) fields.speedMode.value = settings.speedMode;
    if (fields.mediaMode && ["link", "standard", "full", "none"].includes(settings.mediaMode)) fields.mediaMode.value = settings.mediaMode;
    for (const key of ["includeUserImages", "includeAiImages", "includeAttachments", "autoScroll"]) {
      if (fields[key] && typeof settings[key] === "boolean") fields[key].checked = settings[key];
    }
    const byUrl = stored[MODEL_OVERRIDE_URL_KEY] || {};
    const byHost = stored[MODEL_OVERRIDE_HOST_KEY] || {};
    if (fields.modelOverride) fields.modelOverride.value = String(byUrl[target.url] || byHost[target.host] || "");
    const count = Array.isArray(stored.rockwellCaptureHistoryIndex) ? stored.rockwellCaptureHistoryIndex.length : 0;
    if (workspaceButton) workspaceButton.textContent = count ? `批量导出与最近记录（${count}）` : "批量导出与最近记录";
  }

  Object.entries(fields).forEach(([key, field]) => {
    if (!field) return;
    field.addEventListener(key === "modelOverride" ? "input" : "change", () => {
      clearTimeout(saveSettings.timer);
      saveSettings.timer = setTimeout(() => saveSettings().catch(() => {}), key === "modelOverride" ? 120 : 0);
    });
  });

  captureButton?.addEventListener("click", async (event) => {
    if (captureButton.dataset.rockwellSettingsReady === "1") {
      delete captureButton.dataset.rockwellSettingsReady;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    await saveSettings().catch(() => {});
    captureButton.dataset.rockwellSettingsReady = "1";
    captureButton.click();
  }, true);

  workspaceButton?.addEventListener("click", async () => {
    await saveSettings();
    await chrome.tabs.create({ url: chrome.runtime.getURL("workspace.html") });
    window.close();
  });
  restoreSettings().catch(() => {});
})();
