(() => {
  "use strict";

  const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
  const MAX_JSON_BYTES = 64 * 1024 * 1024;
  const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function sniffImageMime(buffer, declared = "") {
    const bytes = new Uint8Array(buffer);
    const text4 = String.fromCharCode(...bytes.slice(0, 4));
    if (bytes[0] === 0x89 && text4.slice(1) === "PNG") return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (text4 === "GIF8") return "image/gif";
    if (text4 === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
    if (text4 === "BM") return "image/bmp";
    if (String.fromCharCode(...bytes.slice(4, 12)).includes("ftypavif")) return "image/avif";
    return /^image\//i.test(declared) ? declared.split(";")[0] : "";
  }

  async function responseToImage(response, target, maxBytes) {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength && contentLength > maxBytes) throw new Error("图片超过大小限制");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error("图片超过大小限制");
    const declared = response.headers.get("content-type") || "";
    const mime = sniffImageMime(buffer, declared);
    if (!mime) throw new Error(`返回内容不是可识别图片：${declared || "unknown"}`);
    return {
      ok: true,
      dataUrl: `data:${mime};base64,${arrayBufferToBase64(buffer)}`,
      mime,
      size: buffer.byteLength,
      finalUrl: response.url || target
    };
  }

  async function fetchImage(url, maxBytes = MAX_IMAGE_BYTES, headers = {}) {
    const target = String(url || "").trim();
    if (!/^https?:\/\//i.test(target)) throw new Error("不是可下载的 HTTP 图片地址");
    let lastError = null;
    for (const credentials of ["include", "omit"]) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch(target, {
            credentials,
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal,
            headers: {
              Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              ...headers
            }
          });
          return await responseToImage(response, target, maxBytes);
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("图片下载失败");
  }

  function allowedJsonUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && CHATGPT_HOSTS.has(url.hostname);
    } catch {
      return false;
    }
  }

  async function fetchJson(url, headers = {}, timeoutMs = 25000) {
    if (!allowedJsonUrl(url)) throw new Error("不允许读取该 JSON 地址");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(3000, Math.min(Number(timeoutMs) || 25000, 60000)));
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
        headers: { Accept: "application/json", ...headers },
        signal: controller.signal
      });
      const length = Number(response.headers.get("content-length") || 0);
      if (length && length > MAX_JSON_BYTES) throw new Error("JSON 响应超过大小限制");
      const text = await response.text();
      if (text.length > MAX_JSON_BYTES) throw new Error("JSON 响应超过大小限制");
      let data;
      try { data = JSON.parse(text); } catch { throw new Error("返回内容不是 JSON"); }
      if (!response.ok) throw new Error(`HTTP ${response.status}${data?.detail ? ` · ${data.detail}` : ""}`);
      return { ok: true, data };
    } finally {
      clearTimeout(timer);
    }
  }

  function safeChatGptOrigin(sourceUrl) {
    try {
      const url = new URL(sourceUrl || "https://chatgpt.com/");
      if (url.protocol === "https:" && CHATGPT_HOSTS.has(url.hostname)) return url.origin;
    } catch {}
    return "https://chatgpt.com";
  }

  async function chatGptAccessToken(origin) {
    const candidates = [`${origin}/api/auth/session`, "https://chatgpt.com/api/auth/session"];
    for (const url of [...new Set(candidates)]) {
      try {
        const response = await fetch(url, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) continue;
        const data = await response.json();
        const token = data?.accessToken || data?.access_token || "";
        if (token) return token;
      } catch {}
    }
    return "";
  }

  function assetIds(...values) {
    const result = [];
    const add = (value) => {
      let raw = String(value || "").trim();
      if (!raw) return;
      if (/^https?:/i.test(raw)) {
        try {
          const url = new URL(raw);
          const match = url.pathname.match(/\/(?:files?|assets?)\/([^/?#]+)(?:\/download)?/i);
          if (match?.[1]) raw = decodeURIComponent(match[1]); else return;
        } catch { return; }
      } else {
        raw = raw.replace(/^(?:file-service|sediment|asset):\/\//i, "").replace(/^\/+/, "").split(/[?#]/)[0];
      }
      for (const candidate of [raw, raw.split("/").filter(Boolean).at(-1)]) {
        if (candidate && !result.includes(candidate)) result.push(candidate);
      }
    };
    values.forEach(add);
    return result;
  }

  function collectHttpUrls(value, result = [], depth = 0) {
    if (depth > 7 || value == null) return result;
    if (typeof value === "string") {
      const direct = value.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
      direct.forEach((url) => { if (!result.includes(url)) result.push(url.replace(/\\u0026/g, "&")); });
      return result;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectHttpUrls(item, result, depth + 1));
      return result;
    }
    if (typeof value === "object") {
      const priority = ["download_url", "downloadUrl", "signed_url", "signedUrl", "image_url", "imageUrl", "content_url", "contentUrl", "file_url", "fileUrl", "asset_url", "assetUrl", "url", "src"];
      priority.forEach((key) => collectHttpUrls(value[key], result, depth + 1));
      Object.entries(value).forEach(([key, child]) => { if (!priority.includes(key)) collectHttpUrls(child, result, depth + 1); });
    }
    return result;
  }

  async function endpointImageOrUrls(url, headers, maxBytes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "image/*,application/json,*/*", ...headers }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") || "";
      if (/^image\//i.test(type) || /octet-stream/i.test(type)) return await responseToImage(response, url, maxBytes);
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch { data = text; }
      const urls = collectHttpUrls(data);
      for (const candidate of urls) {
        try { return await fetchImage(candidate, maxBytes); } catch {}
      }
      throw new Error(`资源接口未返回可下载图片：${type || "unknown"}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveChatGptAsset(message) {
    const maxBytes = Math.max(1024, Math.min(Number(message.maxBytes) || MAX_IMAGE_BYTES, MAX_IMAGE_BYTES));
    const directUrl = String(message.url || "").trim();
    if (/^https?:\/\//i.test(directUrl)) {
      try { return await fetchImage(directUrl, maxBytes); } catch {}
    }
    const origin = safeChatGptOrigin(message.sourceUrl);
    const token = await chatGptAccessToken(origin);
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    const ids = assetIds(message.fileId, message.assetPointer, directUrl);
    if (!ids.length) throw new Error("ChatGPT 图片没有可解析的资源 ID");
    let lastError = null;
    for (const id of ids) {
      const encoded = encodeURIComponent(id);
      const endpoints = [
        `${origin}/backend-api/files/${encoded}/download`,
        `${origin}/backend-api/files/${encoded}/download?download=1`,
        `${origin}/backend-api/files/${encoded}`,
        `${origin}/backend-api/assets/${encoded}/download`,
        `${origin}/backend-api/assets/${encoded}`
      ];
      for (const endpoint of endpoints) {
        try {
          return await endpointImageOrUrls(endpoint, authHeaders, maxBytes);
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw lastError || new Error("ChatGPT 图片资源解析失败");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ROCKWELL_FETCH_IMAGE") {
      fetchImage(message.url, Math.max(1024, Math.min(Number(message.maxBytes) || MAX_IMAGE_BYTES, MAX_IMAGE_BYTES)), message.headers || {})
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "ROCKWELL_RESOLVE_CHATGPT_ASSET") {
      resolveChatGptAsset(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "ROCKWELL_FETCH_JSON") {
      fetchJson(message.url, message.headers || {}, message.timeoutMs)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    return false;
  });
})();
