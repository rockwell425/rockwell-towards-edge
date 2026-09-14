(() => {
  // src/extractor.js
  var ROLE_HINTS = /* @__PURE__ */ new WeakMap();
  var ORDER_HINTS = /* @__PURE__ */ new WeakMap();
  var IMAGE_DATA_CACHE = /* @__PURE__ */ new WeakMap();
  var MESSAGE_SNAPSHOT_CACHE = /* @__PURE__ */ new WeakMap();
  var PLATFORM_DEFINITIONS = [
    {
      id: "chatgpt",
      platform: "ChatGPT",
      assistantLabel: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      titleSuffix: /\s*[|\-–—]\s*ChatGPT\s*$/i,
      messageSelectors: [
        { selector: '[data-message-author-role="user"]', role: "user" },
        { selector: '[data-message-author-role="assistant"]', role: "assistant" }
      ]
    },
    {
      id: "claude",
      platform: "Claude",
      assistantLabel: "Claude",
      hosts: ["claude.ai"],
      titleSuffix: /\s*[|\-–—]\s*Claude\s*$/i,
      messageSelectors: [
        { selector: '[data-testid="user-message"]', role: "user" },
        { selector: '[data-testid="assistant-message"]', role: "assistant" },
        { selector: '[class~="font-user-message"], [class*="!font-user-message"]', role: "user" },
        { selector: '[class~="font-claude-response"]', role: "assistant" },
        { selector: '[class~="font-claude-response-body"]', role: "assistant" },
        { selector: '[data-is-streaming="true"]', role: "assistant" }
      ]
    },
    {
      id: "gemini",
      platform: "Gemini",
      assistantLabel: "Gemini",
      hosts: ["gemini.google.com"],
      titleSuffix: /\s*[|\-–—]\s*Gemini\s*$/i,
      messageSelectors: [
        { selector: "user-query", role: "user" },
        { selector: "model-response", role: "assistant" },
        { selector: '[data-test-id="user-query"], [data-testid="user-query"]', role: "user" },
        { selector: '[data-test-id="model-response"], [data-testid="model-response"]', role: "assistant" },
        { selector: '[class~="user-query-container"]', role: "user" },
        { selector: '[class~="model-response"]', role: "assistant" }
      ]
    },
    {
      id: "deepseek",
      platform: "DeepSeek",
      assistantLabel: "DeepSeek",
      hosts: ["chat.deepseek.com", "deepseek.com", "www.deepseek.com"],
      titleSuffix: /\s*[|\-–—]\s*DeepSeek\s*$/i,
      messageSelectors: [
        { selector: '[data-message-author-role="user"], [data-role="user"]', role: "user" },
        { selector: '[data-message-author-role="assistant"], [data-role="assistant"]', role: "assistant" },
        { selector: "._9663006 .fbb737a4", role: "user" },
        { selector: ".ds-message", role: null },
        { selector: '[class*="_43c05b5"]', role: "assistant" },
        { selector: "div.ds-markdown", role: "assistant" }
      ]
    },
    {
      id: "glm",
      platform: "\u667A\u8C31\u6E05\u8A00",
      assistantLabel: "\u667A\u8C31\u6E05\u8A00",
      hosts: ["chatglm.cn", "www.chatglm.cn"],
      titleSuffix: /\s*[|\-–—]\s*(智谱清言|ChatGLM)\s*$/i,
      messageSelectors: [
        { selector: '[data-message-author-role="user"], [data-role="user"], [data-author="user"]', role: "user" },
        { selector: '[data-message-author-role="assistant"], [data-role="assistant"], [data-author="assistant"]', role: "assistant" },
        { selector: '[data-testid*="user-message" i], [data-test-id*="user-message" i]', role: "user" },
        { selector: '[data-testid*="assistant-message" i], [data-test-id*="assistant-message" i]', role: "assistant" },
        { selector: '[class*="user-message" i], [class*="question" i]', role: "user" },
        { selector: '[class*="assistant-message" i], [class*="answer" i], [class*="markdown" i]', role: "assistant" }
      ]
    }
  ];
  var UI_REMOVAL_SELECTORS = [
    "script",
    "style",
    "noscript",
    "svg",
    "button",
    "form",
    "textarea",
    "input",
    '[data-testid*="copy" i]',
    '[data-testid*="feedback" i]',
    '[aria-label*="copy" i]',
    '[aria-label*="\u590D\u5236" i]',
    '[aria-label*="good response" i]',
    '[aria-label*="bad response" i]',
    '[aria-label*="like" i]',
    '[aria-label*="dislike" i]',
    '[contenteditable="true"]',
    '[role="toolbar"]',
    ".ds-message-feedback-container"
  ].join(",");
  function normalizeText(value = "") {
    return String(value).replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  }
  function safeQueryAll(root, selector) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }
  function fnv1a(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function hostnameFrom(doc = document) {
    try {
      return (doc.location?.hostname || globalThis.location?.hostname || "").toLowerCase();
    } catch {
      return "";
    }
  }
  function detectPlatform(doc = document) {
    const hostname = hostnameFrom(doc);
    const exact = PLATFORM_DEFINITIONS.find((definition) => definition.hosts.includes(hostname));
    if (exact) return exact;
    if (doc.querySelector?.("user-query, model-response")) return PLATFORM_DEFINITIONS.find((item) => item.id === "gemini");
    if (doc.querySelector?.('[data-testid="user-message"], .font-claude-response, .font-user-message')) return PLATFORM_DEFINITIONS.find((item) => item.id === "claude");
    if (doc.querySelector?.(".ds-message, .ds-markdown, .fbb737a4")) return PLATFORM_DEFINITIONS.find((item) => item.id === "deepseek");
    if (doc.querySelector?.("[data-message-author-role], [data-role]") && /智谱清言|ChatGLM|GLM-/i.test(`${doc.title || ""} ${doc.body?.innerText || ""}`)) return PLATFORM_DEFINITIONS.find((item) => item.id === "glm");
    return PLATFORM_DEFINITIONS[0];
  }
  function supportedHost(hostname = "") {
    const host = String(hostname).toLowerCase();
    return PLATFORM_DEFINITIONS.some((definition) => definition.hosts.includes(host));
  }
  function setHint(element, role, order = null) {
    if (role) ROLE_HINTS.set(element, role);
    if (Number.isFinite(order)) ORDER_HINTS.set(element, order);
  }
  function compareDomOrder(a, b) {
    if (a === b) return 0;
    const position = a.compareDocumentPosition(b);
    const NodeCtor = a.ownerDocument?.defaultView?.Node || globalThis.Node;
    if (NodeCtor && position & NodeCtor.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (NodeCtor && position & NodeCtor.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }
  function inferDeepSeekRole(element) {
    if (element.matches?.("._9663006 .fbb737a4, .fbb737a4")) return "user";
    if (element.matches?.('[class*="_43c05b5"], div.ds-markdown')) return "assistant";
    if (element.querySelector?.('div.ds-markdown, [class*="_43c05b5"]')) return "assistant";
    if (element.querySelector?.("._9663006 .fbb737a4, .fbb737a4")) return "user";
    const className = String(element.className || "");
    if (/user|human|question/i.test(className)) return "user";
    if (/assistant|answer|response/i.test(className)) return "assistant";
    return null;
  }
  function inferRoleFromElement(element, platform) {
    const hinted = ROLE_HINTS.get(element);
    if (hinted) return hinted;
    const explicit = element.getAttribute?.("data-message-author-role") || element.getAttribute?.("data-role") || element.getAttribute?.("data-author") || "";
    if (/user|human/i.test(explicit)) return "user";
    if (/assistant|model|bot|ai/i.test(explicit)) return "assistant";
    const tag = element.tagName?.toLowerCase();
    if (tag === "user-query") return "user";
    if (tag === "model-response") return "assistant";
    const testId = `${element.getAttribute?.("data-testid") || ""} ${element.getAttribute?.("data-test-id") || ""}`;
    if (/user[-_ ]?message|user[-_ ]?query/i.test(testId)) return "user";
    if (/assistant[-_ ]?message|model[-_ ]?response/i.test(testId)) return "assistant";
    const className = String(element.className || "");
    if (/font-user-message|user-query|human-message/i.test(className)) return "user";
    if (/font-claude-response|model-response|assistant-message|answer-content|ai-message/i.test(className)) return "assistant";
    if (/user-message|question-content|human-message/i.test(className)) return "user";
    if (platform.id === "deepseek") return inferDeepSeekRole(element) || "assistant";
    return "assistant";
  }
  function collectConfiguredCandidates(root, platform) {
    const candidates = [];
    platform.messageSelectors.forEach((entry, priority) => {
      safeQueryAll(root, entry.selector).forEach((element) => {
        candidates.push({ element, role: entry.role || inferRoleFromElement(element, platform), priority, selector: entry.selector });
      });
    });
    return candidates;
  }
  function acceptTopLevelCandidates(candidates) {
    candidates.sort((a, b) => a.priority - b.priority || compareDomOrder(a.element, b.element));
    const accepted = [];
    for (const candidate of candidates) {
      const hasText = normalizeText(candidate.element.innerText || candidate.element.textContent || "");
      const mediaSelector = 'img, a[download], [data-testid*="attachment" i], [data-testid*="file" i], [aria-label*="\u9644\u4EF6" i], [aria-label*="\u6587\u4EF6" i]';
      const nearbyEnvelope = candidate.element.closest?.('[data-testid^="conversation-turn-"], .ds-message, user-query, model-response, [data-role], [data-author], article, section');
      const hasMedia = candidate.element.querySelector?.(mediaSelector) || nearbyEnvelope?.querySelector?.(mediaSelector);
      if (!hasText && !hasMedia) continue;
      const conflict = accepted.find((existing) => existing.role === candidate.role && (existing.element.contains(candidate.element) || candidate.element.contains(existing.element)));
      if (conflict) continue;
      accepted.push(candidate);
    }
    accepted.sort((a, b) => compareDomOrder(a.element, b.element));
    accepted.forEach((candidate, index) => setHint(candidate.element, candidate.role, index));
    return accepted;
  }
  function collectConfiguredElements(root, platform) {
    return acceptTopLevelCandidates(collectConfiguredCandidates(root, platform)).map((candidate) => candidate.element);
  }
  function chatGptFallback(root) {
    const turns = safeQueryAll(root, '[data-testid^="conversation-turn-"]');
    return turns.map((turn, index) => {
      const nested = turn.querySelector("[data-message-author-role]");
      if (nested) return nested;
      const match = (turn.getAttribute("data-testid") || "").match(/conversation-turn-(\d+)/);
      setHint(turn, index % 2 === 0 ? "user" : "assistant", match ? Number(match[1]) : index);
      return turn;
    });
  }
  function deepSeekContainerFallback(root) {
    const container = root.querySelector('.dad65929, [class*="chat"][class*="container"], [class*="conversation"]');
    if (!container) return [];
    const result = [];
    Array.from(container.children).forEach((child, index) => {
      const userContent = child.querySelector("._9663006 .fbb737a4, .fbb737a4");
      if (userContent) {
        setHint(userContent, "user", index);
        result.push(userContent);
      } else if (child.querySelector("div.ds-markdown") || inferDeepSeekRole(child) === "assistant") {
        setHint(child, "assistant", index);
        result.push(child);
      }
    });
    return result;
  }
  function genericElements(root, platform) {
    const generic = safeQueryAll(root, '[data-message-author-role], [data-role="user"], [data-role="assistant"], [data-author="user"], [data-author="assistant"], user-query, model-response');
    generic.forEach((element, index) => setHint(element, inferRoleFromElement(element, platform), index));
    return generic;
  }
  function getMessageElements(root = document, platform = detectPlatform(root.ownerDocument || root), options = {}) {
    const mode = options.mode || "auto";
    if (mode === "generic") return genericElements(root, platform);
    const configured = collectConfiguredElements(root, platform);
    if (configured.length > 0) return configured;
    if (platform.id === "chatgpt") {
      const fallback = chatGptFallback(root);
      if (fallback.length || mode === "platform") return fallback;
    }
    if (platform.id === "deepseek") {
      const fallback = deepSeekContainerFallback(root);
      if (fallback.length || mode === "platform") return fallback;
    }
    return mode === "platform" ? [] : genericElements(root, platform);
  }
  function sanitizeClone(element) {
    const clone = element.cloneNode(true);
    safeQueryAll(clone, UI_REMOVAL_SELECTORS).forEach((node) => node.remove());
    safeQueryAll(clone, '[aria-hidden="true"], [hidden]').forEach((node) => {
      if (!normalizeText(node.textContent || "")) node.remove();
    });
    return clone;
  }
  function candidateIsTopLevel(candidate, root) {
    const selector = "h1,h2,h3,h4,h5,h6,p,pre,blockquote,ul,ol,table,hr";
    let parent = candidate.parentElement;
    while (parent && parent !== root) {
      if (parent.matches(selector)) return false;
      parent = parent.parentElement;
    }
    return true;
  }
  function sameRunStyle(a, b) {
    return Boolean(a && b) && a.bold === b.bold && a.italics === b.italics && a.code === b.code && a.href === b.href;
  }
  function trimAndMergeRuns(runs) {
    const merged = [];
    for (const run of runs) {
      const text = String(run.text || "").replace(/\u00a0/g, " ");
      if (!text) continue;
      const normalized = { text, bold: Boolean(run.bold), italics: Boolean(run.italics), code: Boolean(run.code), href: run.href || "" };
      if (sameRunStyle(merged.at(-1), normalized)) merged.at(-1).text += normalized.text;
      else merged.push(normalized);
    }
    if (merged.length) {
      merged[0].text = merged[0].text.replace(/^\s+/, "");
      merged.at(-1).text = merged.at(-1).text.replace(/\s+$/, "");
    }
    return merged.filter((run) => run.text);
  }
  function inlineRuns(element) {
    const runs = [];
    const NodeCtor = element.ownerDocument?.defaultView?.Node;
    const walk = (node, style = {}) => {
      if (NodeCtor && node.nodeType === NodeCtor.TEXT_NODE) {
        runs.push({ ...style, text: node.nodeValue || "" });
        return;
      }
      if (!node.tagName) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "br") {
        runs.push({ ...style, text: "\n" });
        return;
      }
      const next = { ...style };
      if (tag === "strong" || tag === "b") next.bold = true;
      if (tag === "em" || tag === "i") next.italics = true;
      if (tag === "code") next.code = true;
      if (tag === "a") next.href = node.getAttribute("href") || "";
      Array.from(node.childNodes || []).forEach((child) => walk(child, next));
    };
    Array.from(element.childNodes || []).forEach((child) => walk(child, {}));
    return trimAndMergeRuns(runs);
  }
  function listItems(element) {
    return Array.from(element.children).filter((child) => child.tagName?.toLowerCase() === "li").map((child) => {
      const runs = inlineRuns(child);
      return { text: normalizeText(runs.map((run) => run.text).join("")), runs };
    }).filter((item) => item.text);
  }
  function tableRows(element) {
    return Array.from(element.querySelectorAll("tr")).map(
      (row) => Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) => normalizeText(cell.innerText || cell.textContent || ""))
    ).filter((row) => row.length > 0);
  }
  var FILE_EXTENSION_PATTERN = /\.(?:pdf|docx?|xlsx?|pptx?|txt|md|rtf|csv|json|xml|ya?ml|zip|rar|7z|tar|gz|epub|mobi|py|js|ts|tsx|jsx|java|c|cpp|h|hpp|cs|go|rs|html?|css|sql|ipynb|mp3|wav|m4a|flac|mp4|mov|avi|mkv|webm)(?:$|[?#])/i;
  var FILE_SIZE_PATTERN = /\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB|字节|千字节|兆字节|吉字节)\b/i;
  function absoluteUrl(value, doc) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(?:data:|blob:)/i.test(raw)) return raw;
    try {
      return new URL(raw, doc?.location?.href || globalThis.location?.href || void 0).href;
    } catch {
      return raw;
    }
  }
  function messageEnvelope(element, platform) {
    if (!element?.closest) return element;
    if (platform.id === "chatgpt") return findChatGptTurn(element) || element;
    if (platform.id === "deepseek") return element.closest(".ds-message, [data-message-author-role], [data-role]") || element;
    if (platform.id === "gemini") return element.closest('user-query, model-response, [data-test-id="user-query"], [data-test-id="model-response"], [data-testid="user-query"], [data-testid="model-response"]') || element;
    if (platform.id === "claude") return element.closest('[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-response, .font-user-message') || element;
    if (platform.id === "glm") return element.closest('[data-message-author-role], [data-role], [data-author], [data-testid*="message" i], [class*="message" i]') || element;
    return element;
  }
  function largestSrcsetUrl(value, doc) {
    const candidates = String(value || "").split(",").map((entry) => {
      const parts = entry.trim().split(/\s+/);
      const score = Number((parts[1] || "").replace(/[^0-9.]/g, "")) || 0;
      return { url: absoluteUrl(parts[0] || "", doc), score };
    }).filter((entry) => entry.url);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || "";
  }
  function unwrapImageProxyUrl(value, doc) {
    const raw = absoluteUrl(value, doc);
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      const nested = parsed.searchParams.get("url") || parsed.searchParams.get("src") || "";
      if (nested && /(?:_next\/image|image\?|proxy|thumbnail)/i.test(parsed.pathname + parsed.hostname)) return absoluteUrl(decodeURIComponent(nested), doc);
    } catch {
    }
    return raw;
  }
  function imageCandidateInfo(image) {
    const doc = image.ownerDocument;
    const renderedSrc = unwrapImageProxyUrl(
      image.currentSrc || image.getAttribute("src") || image.getAttribute("data-src") || image.getAttribute("data-lazy-src") || largestSrcsetUrl(image.getAttribute("srcset"), doc),
      doc
    );
    const parent = image.closest?.('a[href], button, [role="button"], [data-testid*="image" i], [data-test-id*="image" i]');
    const urlValues = [
      image.getAttribute("data-original"), image.getAttribute("data-full-src"), image.getAttribute("data-image-url"), image.getAttribute("data-download-url"),
      parent?.getAttribute?.("href"), parent?.getAttribute?.("data-url"), parent?.getAttribute?.("data-href"), parent?.getAttribute?.("data-image-url"), parent?.getAttribute?.("data-download-url"),
      largestSrcsetUrl(image.getAttribute("srcset"), doc), renderedSrc
    ].map((value) => unwrapImageProxyUrl(value, doc)).filter(Boolean);
    const imageLike = (url) => /\.(?:png|jpe?g|webp|gif|bmp|avif)(?:$|[?#])/i.test(url) || /(?:oaiusercontent\.com|openai\.com\/(?:backend-api|files)|googleusercontent\.com|ggpht\.com|claudeusercontent\.com|bigmodel\.cn)/i.test(url) || /anthropic\.com\/(?:api\/)?(?:file|image)/i.test(url);
    const originalSrc = urlValues.find((url) => imageLike(url) && url !== renderedSrc) || "";
    const src = originalSrc || urlValues.find(imageLike) || renderedSrc;
    const surroundingLabel = parent?.getAttribute?.("aria-label") || parent?.getAttribute?.("title") || "";
    const alt = normalizeText(image.getAttribute("alt") || image.getAttribute("title") || image.getAttribute("aria-label") || surroundingLabel || "\u56FE\u7247");
    const className = `${String(image.className || "")} ${String(parent?.className || "")}`;
    const role = image.getAttribute("role") || "";
    const width = Number(image.naturalWidth || image.width || image.getAttribute("width") || 0);
    const height = Number(image.naturalHeight || image.height || image.getAttribute("height") || 0);
    return { src, originalSrc, renderedSrc: renderedSrc || src, alt, className, role, width, height };
  }
  function imageLooksLikeContent(info) {
    if (!info.src || /^data:image\/svg/i.test(info.src)) return false;
    if (/avatar|profile|logo|icon|emoji|favicon|spinner|loading/i.test(`${info.className} ${info.alt}`)) return false;
    if (/^(?:user|assistant|chatgpt|claude|gemini|deepseek|智谱清言|头像)$/i.test(info.alt)) return false;
    if (info.role === "presentation" && info.width && info.width < 80 && info.height && info.height < 80) return false;
    if (info.width && info.height && info.width < 64 && info.height < 64) return false;
    return true;
  }
  function imageDataUrlFromLoadedElement(image, info, options = {}) {
    const cached = IMAGE_DATA_CACHE.get(image);
    if (cached?.src === info.src) return cached.dataUrl;
    if (/^data:image\//i.test(info.src)) {
      IMAGE_DATA_CACHE.set(image, { src: info.src, dataUrl: info.src });
      return info.src;
    }
    if (!image.complete || !info.width || !info.height || !image.ownerDocument?.createElement) return "";
    const mediaMode = options.mediaMode || "full";
    if (mediaMode === "link" || mediaMode === "none") return "";
    const maxDimension = mediaMode === "standard" ? 1600 : 3200;
    const maxDataLength = mediaMode === "standard" ? 8e6 : 24e6;
    const scale = Math.min(1, maxDimension / Math.max(info.width, info.height));
    try {
      const canvas = image.ownerDocument.createElement("canvas");
      canvas.width = Math.max(1, Math.round(info.width * scale));
      canvas.height = Math.max(1, Math.round(info.height * scale));
      const context = canvas.getContext?.("2d");
      if (!context) return "";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png", 0.92);
      const result = dataUrl.length <= maxDataLength ? dataUrl : "";
      IMAGE_DATA_CACHE.set(image, { src: info.src, dataUrl: result });
      return result;
    } catch {
      IMAGE_DATA_CACHE.set(image, { src: info.src, dataUrl: "" });
      return "";
    }
  }
  function extractImageBlocks(root, existingSources = /* @__PURE__ */ new Set(), options = {}, messageRole = "assistant") {
    const includeImages = messageRole === "user" ? options.includeUserImages !== false : options.includeAiImages !== false;
    if (!includeImages || options.mediaMode === "none") return [];
    const blocks = [];
    for (const image of safeQueryAll(root, "img")) {
      const info = imageCandidateInfo(image);
      if (!imageLooksLikeContent(info) || existingSources.has(info.src)) continue;
      existingSources.add(info.src);
      blocks.push({
        type: "image",
        sourceKind: messageRole === "user" ? "user-upload" : "ai-generated",
        alt: `${messageRole === "user" ? "\u7528\u6237\u53D1\u9001\u56FE\u7247" : "AI \u751F\u6210/\u56DE\u590D\u56FE\u7247"} \u00B7 ${info.alt || "\u56FE\u7247"}`,
        src: info.src,
        originalSrc: info.originalSrc || "",
        renderedSrc: info.renderedSrc || info.src,
        dataUrl: imageDataUrlFromLoadedElement(image, info, options),
        fetchStatus: "pending",
        width: info.width || null,
        height: info.height || null
      });
    }
    return blocks;
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
      reader.readAsDataURL(blob);
    });
  }
  async function fetchImageInPage(url, maxBytes) {
    const target = String(url || "").trim();
    if (!target) throw new Error("图片地址为空");
    if (/^data:image\//i.test(target)) return { dataUrl: target, finalUrl: target };
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 18000) : null;
    try {
      const response = await fetch(target, { credentials: "include", cache: "no-store", redirect: "follow", signal: controller?.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size > maxBytes) throw new Error("图片超过大小限制");
      return { dataUrl: await blobToDataUrl(blob), finalUrl: response.url || target, mime: blob.type, size: blob.size };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async function fetchImageThroughExtension(url, maxBytes, headers = {}) {
    const response = await chrome.runtime.sendMessage({ type: "ROCKWELL_FETCH_IMAGE", url, maxBytes, headers });
    if (!response?.ok || !response.dataUrl) throw new Error(response?.error || "扩展后台无法下载图片");
    return response;
  }
  async function resolveChatGptAssetThroughExtension(block, maxBytes) {
    const response = await chrome.runtime.sendMessage({
      type: "ROCKWELL_RESOLVE_CHATGPT_ASSET",
      assetPointer: block?.assetPointer || "",
      fileId: block?.fileId || "",
      url: block?.src || block?.originalSrc || block?.renderedSrc || "",
      sourceUrl: location.href,
      maxBytes
    });
    if (!response?.ok || !response.dataUrl) throw new Error(response?.error || "无法解析 ChatGPT 图片资源");
    return response;
  }
  async function resizeDataUrlForMode(dataUrl, mediaMode) {
    if (!/^data:image\//i.test(dataUrl) || mediaMode !== "standard") return dataUrl;
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = dataUrl;
      await (image.decode ? image.decode() : new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; }));
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      if (scale >= 1 && dataUrl.length <= 8e6) return dataUrl;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/png", 0.92);
      return result.length <= 10e6 ? result : dataUrl;
    } catch {
      return dataUrl;
    }
  }
  async function hydrateImageBlock(block, options = {}) {
    if (!block || block.type !== "image" || block.dataUrl || options.mediaMode === "link" || options.mediaMode === "none") return block;
    const maxBytes = options.mediaMode === "full" ? 36 * 1024 * 1024 : 18 * 1024 * 1024;
    const candidates = (options.mediaMode === "full" ? [block.originalSrc, block.src, block.renderedSrc] : [block.renderedSrc, block.src, block.originalSrc])
      .map((value) => String(value || "").trim()).filter((value, index, array) => value && array.indexOf(value) === index);
    let lastError = null;
    let result = null;

    // ChatGPT conversation archives usually store generated/user images as file-service://
    // or sediment:// asset pointers rather than durable HTTP URLs. Resolve those first.
    if (block.assetPointer || block.fileId || candidates.some((value) => /^(?:file-service|sediment|asset):\/\//i.test(value))) {
      try {
        result = await resolveChatGptAssetThroughExtension(block, maxBytes);
      } catch (error) {
        lastError = error;
      }
    }

    if (!result) {
      for (const url of candidates) {
        if (/^(?:file-service|sediment|asset):\/\//i.test(url)) continue;
        try {
          try {
            result = await fetchImageInPage(url, maxBytes);
          } catch (error) {
            lastError = error;
            if (/^https?:\/\//i.test(url)) result = await fetchImageThroughExtension(url, maxBytes);
            else throw error;
          }
          if (result?.dataUrl) break;
        } catch (error) {
          lastError = error;
          result = null;
        }
      }
    }

    if (result?.dataUrl) {
      block.dataUrl = await resizeDataUrlForMode(result.dataUrl, options.mediaMode || "standard");
      block.fetchStatus = "embedded";
      block.resolvedUrl = result.finalUrl || candidates.find((value) => /^https?:/i.test(value)) || block.assetPointer || "";
      block.fetchError = "";
      block.mime = result.mime || block.mime || "";
      block.size = result.size || block.size || null;
      return block;
    }

    block.fetchStatus = "failed";
    block.fetchError = lastError?.message || "无法获取图片数据";
    return block;
  }
  async function hydrateCapturedImages(session) {
    const mediaMode = session.captureOptions.mediaMode || "standard";
    if (mediaMode === "link" || mediaMode === "none") return;
    const blocks = [];
    for (const record of session.collector.map.values()) {
      for (const block of record.blocks || []) if (block.type === "image" && !block.dataUrl) blocks.push(block);
    }
    if (!blocks.length) return;
    let cursor = 0;
    let completed = 0;
    const concurrency = session.speedMode === "fast" ? 5 : session.speedMode === "balanced" ? 4 : 3;
    const worker = async () => {
      while (cursor < blocks.length && !session.cancelled) {
        const block = blocks[cursor++];
        await hydrateImageBlock(block, session.captureOptions);
        completed += 1;
        emitProgress(session, "media", completed, blocks.length, `正在嵌入图片：${completed} / ${blocks.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, blocks.length) }, worker));
  }

  function filenameFromUrl(href) {
    if (!href || /^(?:data:|blob:)/i.test(href)) return "";
    try {
      const part = decodeURIComponent(new URL(href).pathname.split("/").filter(Boolean).at(-1) || "");
      return FILE_EXTENSION_PATTERN.test(part) ? part : "";
    } catch {
      return "";
    }
  }
  function cleanAttachmentName(value) {
    const text = normalizeText(value || "").replace(/^(?:下载|打开|预览|附件|文件)\s*[:：-]?\s*/i, "").trim();
    if (!text || text.length > 260 || /^(?:download|open|preview|附件|文件)$/i.test(text)) return "";
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.find((line) => FILE_EXTENSION_PATTERN.test(line)) || lines[0] || "";
  }
  function inferMimeFromName(name) {
    const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
    const map = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", zip: "application/zip", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp3: "audio/mpeg", mp4: "video/mp4" };
    return map[ext] || "";
  }
  function attachmentCandidateNodes(root) {
    const selector = [
      "a[download]",
      'a[href$=".pdf" i],a[href$=".doc" i],a[href$=".docx" i],a[href$=".xls" i],a[href$=".xlsx" i],a[href$=".ppt" i],a[href$=".pptx" i],a[href$=".txt" i],a[href$=".md" i],a[href$=".csv" i],a[href$=".json" i],a[href$=".zip" i]',
      '[data-testid*="attachment" i],[data-test-id*="attachment" i],[data-testid*="file" i],[data-test-id*="file" i]',
      '[aria-label*="attachment" i],[aria-label*="file" i],[aria-label*="\u9644\u4EF6" i],[aria-label*="\u6587\u4EF6" i]',
      '[class*="attachment" i],[class*="file-card" i],[class*="file-pill" i],[class*="uploaded-file" i]'
    ].join(",");
    return safeQueryAll(root, selector);
  }
  function extractAttachmentBlocks(root, options = {}) {
    if (options.includeAttachments === false) return [];
    const blocks = [];
    const seen = /* @__PURE__ */ new Set();
    for (const node of attachmentCandidateNodes(root)) {
      const link = node.matches?.("a[href]") ? node : node.querySelector?.("a[href],a[download]");
      const href = absoluteUrl(link?.getAttribute("href") || node.getAttribute?.("data-url") || node.getAttribute?.("data-href") || "", root.ownerDocument || root);
      const downloadName = link?.getAttribute("download") || node.getAttribute?.("data-filename") || node.getAttribute?.("data-file-name") || "";
      const aria = node.getAttribute?.("aria-label") || node.getAttribute?.("title") || link?.getAttribute("aria-label") || link?.getAttribute("title") || "";
      const text = normalizeText(node.innerText || node.textContent || "");
      const name = cleanAttachmentName(downloadName) || cleanAttachmentName(aria) || cleanAttachmentName(text) || filenameFromUrl(href);
      const likely = Boolean(downloadName || FILE_EXTENSION_PATTERN.test(href) || FILE_EXTENSION_PATTERN.test(name) || /attachment|file|附件|文件/i.test(`${node.className || ""} ${node.getAttribute?.("data-testid") || ""} ${aria}`));
      if (!likely || !name) continue;
      const size = (text.match(FILE_SIZE_PATTERN) || [])[0] || "";
      const mime = node.getAttribute?.("data-mime-type") || node.getAttribute?.("data-mime") || link?.getAttribute("type") || inferMimeFromName(name);
      const key = `${name}|${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ type: "attachment", name, href, mime: mime || "", size });
    }
    return blocks;
  }
  function supplementalBlocks(element, platform, existingBlocks, options = {}, messageRole = "assistant") {
    const envelope = messageEnvelope(element, platform);
    const existingSources = new Set(existingBlocks.filter((block) => block.type === "image").map((block) => block.src).filter(Boolean));
    return [
      ...extractAttachmentBlocks(envelope, options),
      ...extractImageBlocks(envelope, existingSources, options, messageRole)
    ];
  }
  function normalizeCodeText(value = "") {
    const lines = String(value).replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (!lines.length) return "";
    const labels = ["powershell", "javascript", "typescript", "markdown", "shell", "bash", "json", "python", "java", "csharp", "rust", "html", "yaml", "text", "zsh", "ps1", "jsx", "tsx", "cpp", "css", "sql", "xml", "yml", "md", "sh", "py", "cs", "go", "c"];
    const firstTrimmed = lines[0].trim();
    const exactLabel = labels.find((label) => firstTrimmed.toLowerCase() === label);
    if (exactLabel) lines.shift();
    else {
      const firstLower = lines[0].toLowerCase();
      const duplicated = labels.find((label) => firstLower.startsWith(label + label));
      if (duplicated) lines[0] = lines[0].slice(duplicated.length);
      else {
        const glued = labels.find((label) => firstLower.startsWith(label) && /^[\[{"'/$]/.test(lines[0].slice(label.length, label.length + 1)));
        if (glued) lines[0] = lines[0].slice(glued.length);
      }
    }
    return lines.join("\n").replace(/[ \t]+$/gm, "").trimEnd();
  }
  function extractBlocksFromElement(element, platform = detectPlatform(element.ownerDocument), options = {}, messageRole = "assistant") {
    const clone = sanitizeClone(element);
    const candidates = safeQueryAll(clone, "h1,h2,h3,h4,h5,h6,p,pre,blockquote,ul,ol,table,hr").filter((candidate) => candidateIsTopLevel(candidate, clone));
    const blocks = [];
    for (const candidate of candidates) {
      const tag = candidate.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const runs = inlineRuns(candidate);
        const text = normalizeText(runs.map((run) => run.text).join(""));
        if (text) blocks.push({ type: "heading", level: Number(tag[1]), text, runs });
      } else if (tag === "p") {
        const runs = inlineRuns(candidate);
        const text = normalizeText(runs.map((run) => run.text).join(""));
        if (text) blocks.push({ type: "paragraph", text, runs });
      } else if (tag === "pre") {
        const code = normalizeCodeText(candidate.innerText || candidate.textContent || "");
        if (code) blocks.push({ type: "code", text: code });
      } else if (tag === "blockquote") {
        const runs = inlineRuns(candidate);
        const text = normalizeText(runs.map((run) => run.text).join(""));
        if (text) blocks.push({ type: "quote", text, runs });
      } else if (tag === "ul" || tag === "ol") {
        const items = listItems(candidate);
        if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      } else if (tag === "table") {
        const rows = tableRows(candidate);
        if (rows.length) blocks.push({ type: "table", rows });
      } else if (tag === "hr") blocks.push({ type: "separator" });
    }
    if (blocks.length === 0) {
      const fallback = normalizeText(clone.innerText || clone.textContent || "");
      if (fallback) fallback.split(/\n{2,}/).map(normalizeText).filter(Boolean).forEach((text) => blocks.push({ type: "paragraph", text, runs: [{ text }] }));
    }
    blocks.push(...supplementalBlocks(element, platform, blocks, options, messageRole));
    return blocks;
  }
  function findChatGptTurn(element) {
    return element.closest?.('[data-testid^="conversation-turn-"]') || element.parentElement?.closest?.('[data-testid^="conversation-turn-"]') || null;
  }
  function inferTurnOrder(element, platform) {
    const hinted = ORDER_HINTS.get(element);
    if (Number.isFinite(hinted)) return hinted;
    if (platform.id !== "chatgpt") return null;
    const testId = findChatGptTurn(element)?.getAttribute("data-testid") || "";
    const match = testId.match(/conversation-turn-(\d+)/);
    return match ? Number(match[1]) : null;
  }
  function inferStableId(element, role, plainText, platform) {
    const turn = platform.id === "chatgpt" ? findChatGptTurn(element) : null;
    const explicit = element.getAttribute?.("data-message-id") || element.getAttribute?.("data-testid") || element.getAttribute?.("data-test-id") || element.getAttribute?.("data-id") || turn?.getAttribute("data-message-id") || turn?.getAttribute("data-testid") || element.id;
    const order = inferTurnOrder(element, platform);
    return explicit || `${platform.id}-${role}-${fnv1a(plainText)}${Number.isFinite(order) ? `-${order}` : ""}`;
  }
  function snapshotMessage(element, platform = detectPlatform(element.ownerDocument), options = {}) {
    const role = inferRoleFromElement(element, platform);
    const rawText = element.innerText || element.textContent || "";
    const imageSignature = safeQueryAll(messageEnvelope(element, platform), "img").map((image) => `${image.currentSrc || image.getAttribute("src") || ""}:${image.complete ? 1 : 0}:${image.naturalWidth || 0}x${image.naturalHeight || 0}`).join("|");
    const optionSignature = `${options.includeUserImages !== false}:${options.includeAiImages !== false}:${options.includeAttachments !== false}:${options.mediaMode || "full"}`;
    const signature = fnv1a(`${role}|${rawText}|${imageSignature}|${attachmentCandidateNodes(messageEnvelope(element, platform)).length}|${optionSignature}`);
    const cached = MESSAGE_SNAPSHOT_CACHE.get(element);
    if (cached?.signature === signature) return cached.message;
    const blocks = extractBlocksFromElement(element, platform, options, role);
    const plainText = normalizeText(blocks.flatMap((block) => {
      if (block.text) return block.text;
      if (block.items) return block.items.map((item) => typeof item === "string" ? item : item.text).join("\n");
      if (block.rows) return block.rows.flat().join("	");
      if (block.alt) return `[\u56FE\u7247] ${block.alt}`;
      if (block.name) return `[\u9644\u4EF6] ${block.name}`;
      return "";
    }).join("\n\n"));
    const localModelLabel = role === "assistant" ? detectModelLabel(messageEnvelope(element, platform), platform, { fallback: false }) : "";
    const message = { id: inferStableId(element, role, plainText, platform), role, order: inferTurnOrder(element, platform), modelLabel: localModelLabel, blocks, plainText };
    MESSAGE_SNAPSHOT_CACHE.set(element, { signature, message });
    return message;
  }
  function extractVisibleMessages(root = document, platform = detectPlatform(root.ownerDocument || root), options = {}) {
    return getMessageElements(root, platform, options).map((element) => snapshotMessage(element, platform, options)).filter((message) => message.plainText.length > 0);
  }
  function diagnoseExtraction(root = document, platform = detectPlatform(root.ownerDocument || root), options = {}) {
    const configuredCandidates = collectConfiguredCandidates(root, platform);
    const accepted = acceptTopLevelCandidates([...configuredCandidates]);
    const platformMessages = getMessageElements(root, platform, { mode: "platform" });
    const generic = genericElements(root, platform);
    const selected = getMessageElements(root, platform, options);
    const snapshots = selected.map((element) => snapshotMessage(element, platform, options)).filter((message) => message.plainText);
    const ids = /* @__PURE__ */ new Set();
    let duplicateMessages = 0;
    snapshots.forEach((message) => {
      if (ids.has(message.id)) duplicateMessages += 1;
      else ids.add(message.id);
    });
    const selectorCounts = platform.messageSelectors.map((entry) => ({ selector: entry.selector, role: entry.role || "\u81EA\u52A8", count: safeQueryAll(root, entry.selector).length }));
    let extractor = `${platform.platform} Primary`;
    if (!accepted.length && platformMessages.length) extractor = `${platform.platform} Fallback`;
    if (!platformMessages.length && generic.length) extractor = "Generic Semantic Fallback";
    if (!selected.length) extractor = "No Match";
    return {
      version: "0.4.3",
      platform: platform.platform,
      platformId: platform.id,
      hostname: hostnameFrom(root.ownerDocument || root),
      pageUrl: root.location?.href || "",
      mode: options.mode || "auto",
      extractor,
      candidateNodes: configuredCandidates.length,
      acceptedNodes: accepted.length,
      platformFallbackNodes: platformMessages.length,
      genericNodes: generic.length,
      recognizedMessages: snapshots.length,
      userMessages: snapshots.filter((m) => m.role === "user").length,
      assistantMessages: snapshots.filter((m) => m.role === "assistant").length,
      imageBlocks: snapshots.reduce((sum, message) => sum + message.blocks.filter((block) => block.type === "image").length, 0),
      attachmentBlocks: snapshots.reduce((sum, message) => sum + message.blocks.filter((block) => block.type === "attachment").length, 0),
      detectedModelLabel: detectModelLabel(root.ownerDocument || root, platform),
      duplicateCandidates: Math.max(0, configuredCandidates.length - accepted.length),
      duplicateMessages,
      selectorCounts,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  function cleanDocumentTitle(doc, platform) {
    let title = normalizeText(doc.title || "");
    if (platform.titleSuffix) title = title.replace(platform.titleSuffix, "");
    title = title.replace(new RegExp(`^${platform.platform}\\s*[|\\-\u2013\u2014]\\s*`, "i"), "").replace(/\s*[|\-–—]\s*(Google|Anthropic|深度求索|智谱清言|智谱AI|ChatGLM)\s*$/i, "").trim();
    if (title && title.toLowerCase() !== platform.platform.toLowerCase()) return title;
    return "";
  }
  function detectConversationTitle(doc = document, platform = detectPlatform(doc)) {
    const documentTitle = cleanDocumentTitle(doc, platform);
    if (documentTitle) return documentTitle;
    const selectorsByPlatform = {
      chatgpt: ["main h1", "main h2"],
      claude: ['[data-testid="conversation-title"]', '[aria-current="page"]', "main h1"],
      gemini: ['[data-test-id="conversation-title"]', '[data-testid="conversation-title"]', "main h1"],
      deepseek: [".afa34042.e37a04e4.e0a1edb7", '[aria-current="page"]', "main h1"],
      glm: ['[data-testid="conversation-title"]', '[aria-current="page"]', "main h1", "main h2"]
    };
    for (const selector of selectorsByPlatform[platform.id] || ["main h1"]) {
      const text = safeQueryAll(doc, selector).map((node) => normalizeText(node.textContent || "")).find((value) => value && value.length < 160 && value.toLowerCase() !== platform.platform.toLowerCase());
      if (text) return text;
    }
    return `${platform.platform} \u5BF9\u8BDD`;
  }
  function modelTextValues(node) {
    const values = [
      node.getAttribute?.("data-model"),
      node.getAttribute?.("data-model-id"),
      node.getAttribute?.("data-model-name"),
      node.getAttribute?.("data-model-slug"),
      node.getAttribute?.("data-message-model-slug"),
      node.getAttribute?.("data-selected-model"),
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.getAttribute?.("value"),
      node.textContent
    ];
    return [...new Set(values.map((value) => normalizeText(value || "")).filter((value) => value && value.length < 180))];
  }
  var MODEL_PATTERNS = {
    chatgpt: [
      /\b(?:ChatGPT|GPT)[-_\s]*\d+(?:\.\d+){0,2}(?:[-_\s]*(?:Sol|Thinking|Instant|Pro|Mini|Max|Auto|Fast|Luna))?\b/i,
      /\bgpt[-_]?\d+(?:\.\d+){0,2}(?:[-_]?(?:sol|thinking|instant|pro|mini|max|auto|fast|luna))?\b/i,
      /\bo\d+(?:[-_\s](?:mini|pro|preview|high|medium|low))?\b/i,
      /\b\d+(?:\.\d+){1,2}[-_\s]*(?:Sol|Thinking|Instant|Pro|Mini|Max|Auto|Fast|Luna)\b/i
    ],
    claude: [
      /\bClaude\s+(?:Opus|Sonnet|Haiku)\s+\d+(?:\.\d+){0,2}\b/i,
      /\bClaude\s+\d+(?:\.\d+){0,2}\s+(?:Opus|Sonnet|Haiku)\b/i,
      /\b(?:Opus|Sonnet|Haiku)\s+\d+(?:\.\d+){0,2}\b/i
    ],
    gemini: [
      /\bGemini\s+\d+(?:\.\d+){0,2}\s+(?:Pro|Flash(?:-Lite)?|Ultra|Nano)(?:\s+Thinking)?\b/i,
      /\b\d+(?:\.\d+){1,2}\s+(?:Pro|Flash(?:-Lite)?|Ultra|Nano)(?:\s+Thinking)?\b/i,
      /\bGemini\s+(?:Advanced|Thinking|Deep Think)\b/i
    ],
    deepseek: [
      /\bDeepSeek[-\s]?(?:R\d+(?:[-\s]?[A-Za-z0-9.]*)?|V\d+(?:\.\d+)*(?:[-\s]?[A-Za-z0-9.]*)?)\b/i,
      /\b(?:R1|V\d+(?:\.\d+)+)(?:[-\s](?:Lite|Turbo|Preview|Chat|Coder))?\b/i,
      /深度思考(?:\s*\([^)]*R1[^)]*\))?/i
    ],
    glm: [
      /\bGLM[-\s]?\d+(?:\.\d+){0,2}(?:[-\s](?:Air|Flash|Turbo|Plus|Long|V|Thinking|Code))?\b/i,
      /\bChatGLM[-\s]?\d+(?:\.\d+){0,2}(?:[-\s][A-Za-z0-9.]+)?\b/i
    ]
  };
  function cleanModelMatch(value) {
    return normalizeText(value).replace(/^(?:当前模型|模型|model|current model|selected model)\s*[:：-]?\s*/i, "").replace(/\s*(?:切换模型|选择模型|model selector|model picker)\s*$/i, "").trim();
  }
  function prettifyModelLabel(value, platform) {
    let label = cleanModelMatch(value).replace(/_/g, "-");
    if (platform.id === "chatgpt") {
      label = label
        .replace(/^chatgpt[-\s]*/i, "GPT-")
        .replace(/^gpt(?=\d)/i, "GPT-")
        .replace(/(\d)-(?=\d)/g, "$1.")
        .replace(/-{2,}/g, "-");
      const match = label.match(/^(?:ChatGPT|GPT)?[-\s]*([0-9]+(?:\.[0-9]+){0,2})(?:[-\s]*(Sol|Thinking|Instant|Pro|Mini|Max|Auto|Fast|Luna))?$/i)
        || label.match(/^gpt[-]?([0-9]+(?:\.[0-9]+){0,2})(?:[-]?(sol|thinking|instant|pro|mini|max|auto|fast|luna))?$/i);
      if (match) return `GPT-${match[1]}${match[2] ? ` ${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()}` : ""}`;
      if (/^o\d/i.test(label)) return label.replace(/_/g, "-").replace(/^o/i, "o");
    }
    return label;
  }
  function modelMatchFromText(text, platform) {
    const cleaned = cleanModelMatch(text).replace(/(\d)-(?=\d)/g, "$1.");
    for (const pattern of MODEL_PATTERNS[platform.id] || []) {
      const match = cleaned.match(pattern);
      if (match?.[0]) {
        let label = prettifyModelLabel(match[0], platform);
        if (platform.id === "gemini" && /^\d+(?:\.\d+){1,2}\s+/i.test(label)) label = `Gemini ${label}`;
        if (platform.id === "deepseek" && /^深度思考/i.test(label)) label = `DeepSeek · ${label}`;
        return label;
      }
    }
    return "";
  }
  function structuredModelFallback(root, platform) {
    const scripts = safeQueryAll(root, 'script[type="application/json"], script#__NEXT_DATA__, script[data-state]');
    const keyPattern = /["'](?:selectedModel|currentModel|activeModel|modelLabel|model_name|modelName|model_id|modelId|model_slug|modelSlug|default_model_slug)["']\s*:\s*["']([^"']{1,90})["']/ig;
    for (const script of scripts.slice(0, 20)) {
      const text = script.textContent || "";
      let match;
      while (match = keyPattern.exec(text)) {
        const label = modelMatchFromText(match[1], platform);
        if (label) return label;
      }
    }
    return "";
  }
  function detectModelLabel(root = document, platform = detectPlatform(root.ownerDocument || root), options = {}) {
    const configs = {
      chatgpt: ['[data-testid="model-switcher-dropdown-button"]', '[data-testid*="model-switcher" i]', '[data-testid*="model" i]', '[class*="model-switcher" i]', "[data-model]", "[data-model-slug]", "[data-message-model-slug]", '[aria-label*="model" i]', '[aria-label*="GPT" i]', '[aria-label*="ChatGPT" i]', 'header button[aria-haspopup="menu"]', "header button", 'header [role="button"]', "nav button", 'main button[aria-haspopup="menu"]'],
      claude: ['[data-testid*="model" i]', "[data-model]", '[aria-label*="model" i]', 'header button[aria-haspopup="menu"]', "header button"],
      gemini: ['[data-test-id*="model" i]', '[data-testid*="model" i]', "[data-model]", '[aria-label*="model" i]', 'header button[aria-haspopup="menu"]', "header button"],
      deepseek: ['[data-testid*="model" i]', "[data-model]", '[aria-label*="model" i]', 'header button[aria-haspopup="menu"]', 'main button[aria-pressed="true"]', "main button"],
      glm: ['[data-testid*="model" i]', '[data-test-id*="model" i]', "[data-model]", '[aria-label*="model" i]', '[aria-label*="GLM" i]', 'header button[aria-haspopup="menu"]', "header button", 'main button[aria-pressed="true"]']
    };
    for (const selector of configs[platform.id] || []) {
      for (const node of safeQueryAll(root, selector)) {
        for (const value of modelTextValues(node)) {
          const label = modelMatchFromText(value, platform);
          if (label) return label;
        }
      }
    }
    for (const selector of ["header", "nav", '[data-testid*="model" i]', '[data-test-id*="model" i]']) {
      for (const node of safeQueryAll(root, selector).slice(0, 20)) {
        const label = modelMatchFromText(normalizeText(node.innerText || node.textContent || ""), platform);
        if (label) return label;
      }
    }
    const structured = structuredModelFallback(root.ownerDocument || root, platform);
    if (structured) return structured;
    return options.fallback === false ? "" : platform.assistantLabel;
  }


  // ChatGPT long-conversation archive fallback. ChatGPT virtualizes old turns in the DOM,
  // so scrolling alone may miss messages. Read the authenticated active branch first, then
  // enrich those records with media and formatting observed in the page.
  function chatGptConversationId(value = location.href) {
    try {
      const path = new URL(value, location.href).pathname;
      const match = path.match(/\/(?:c|conversation)\/([0-9a-z-]{16,})/i);
      return match?.[1] || "";
    } catch {
      return "";
    }
  }
  async function fetchJsonInPage(url, options = {}, timeoutMs = 25000) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
        headers: { Accept: "application/json", ...(options.headers || {}) },
        signal: controller?.signal
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) throw new Error(`HTTP ${response.status}${data?.detail ? ` · ${data.detail}` : ""}`);
      if (!data || typeof data !== "object") throw new Error("返回内容不是 JSON");
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async function fetchJsonThroughExtension(url, headers = {}, timeoutMs = 25000) {
    const response = await chrome.runtime.sendMessage({ type: "ROCKWELL_FETCH_JSON", url, headers, timeoutMs });
    if (!response?.ok || !response.data) throw new Error(response?.error || "扩展后台无法读取 JSON");
    return response.data;
  }
  async function fetchJsonRobust(url, headers = {}, timeoutMs = 25000) {
    try {
      return await fetchJsonInPage(url, { headers }, timeoutMs);
    } catch (pageError) {
      try {
        return await fetchJsonThroughExtension(url, headers, timeoutMs);
      } catch (extensionError) {
        throw new Error(`${pageError?.message || pageError}; 后台重试：${extensionError?.message || extensionError}`);
      }
    }
  }
  function chatGptPartText(part) {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    if (typeof part.text === "string") return part.text;
    if (typeof part.content === "string") return part.content;
    if (typeof part.result === "string") return part.result;
    if (typeof part.caption === "string" && !/(?:image|file|asset)/i.test(String(part.content_type || part.type || ""))) return part.caption;
    return "";
  }
  function blocksFromArchiveText(text, content = {}) {
    const normalized = normalizeText(text || "");
    if (!normalized) return [];
    if (content.content_type === "code") {
      return [{ type: "code", language: normalizeText(content.language || ""), text: normalized }];
    }
    const blocks = [];
    const fence = /```([^\n`]*)\n?([\s\S]*?)```/g;
    let cursor = 0;
    let match;
    while (match = fence.exec(normalized)) {
      const before = normalizeText(normalized.slice(cursor, match.index));
      if (before) blocks.push({ type: "paragraph", text: before, runs: [{ text: before }] });
      const code = String(match[2] || "").replace(/\s+$/, "");
      if (code) blocks.push({ type: "code", language: normalizeText(match[1] || ""), text: code });
      cursor = match.index + match[0].length;
    }
    const after = normalizeText(normalized.slice(cursor));
    if (after) blocks.push({ type: "paragraph", text: after, runs: [{ text: after }] });
    if (!blocks.length) blocks.push({ type: "paragraph", text: normalized, runs: [{ text: normalized }] });
    return blocks;
  }
  function archiveMessageText(message) {
    const content = message?.content || {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const joined = parts.map(chatGptPartText).filter(Boolean).join("\n\n");
    return normalizeText(joined || content.text || content.result || "");
  }
  function firstUsefulString(...values) {
    for (const value of values.flat(Infinity)) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object" && typeof value.url === "string" && value.url.trim()) return value.url.trim();
    }
    return "";
  }
  function chatGptAssetId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:/i.test(raw)) {
      try {
        const match = new URL(raw).pathname.match(/\/(?:files?|assets?)\/([^/?#]+)(?:\/download)?/i);
        return match?.[1] ? decodeURIComponent(match[1]) : "";
      } catch { return ""; }
    }
    return raw.replace(/^(?:file-service|sediment|asset):\/\//i, "").replace(/^\/+/, "").split(/[?#]/)[0].trim();
  }
  function archiveMediaBlocks(message, role, options = {}) {
    const includeImages = role === "user" ? options.includeUserImages !== false : options.includeAiImages !== false;
    const includeAttachments = options.includeAttachments !== false;
    const blocks = [];
    const seen = new Set();
    const messageContent = message?.content || {};
    const messageContext = normalizeText(`${message?.author?.name || ""} ${message?.recipient || ""} ${messageContent?.content_type || ""}`).toLowerCase();
    const roots = [
      ...(Array.isArray(messageContent.parts) ? messageContent.parts : []),
      messageContent,
      message?.metadata?.attachments,
      message?.metadata?.files,
      message?.metadata?.content_references,
      message?.metadata?.image_results,
      message?.metadata?.generated_images
    ];
    const addImage = (object, path, typeText, mimeText) => {
      if (!includeImages || options.mediaMode === "none") return;
      const nestedImageUrl = object?.image_url && typeof object.image_url === "object" ? object.image_url.url : object?.image_url;
      const url = firstUsefulString(
        object?.download_url, object?.downloadUrl, object?.signed_url, object?.signedUrl,
        nestedImageUrl, object?.imageUrl, object?.content_url, object?.contentUrl,
        object?.asset_url, object?.assetUrl, object?.original_url, object?.originalUrl,
        object?.src, object?.url, object?.thumbnail_url, object?.thumbnailUrl,
        object?.metadata?.download_url, object?.metadata?.signed_url, object?.metadata?.image_url,
        object?.metadata?.content_url, object?.metadata?.url
      );
      const pointer = firstUsefulString(object?.asset_pointer, object?.assetPointer, object?.file_pointer, object?.filePointer,
        object?.sediment_pointer, object?.sedimentPointer, object?.metadata?.asset_pointer, object?.metadata?.file_pointer,
        /^(?:file-service|sediment|asset):\/\//i.test(url) ? url : "");
      const explicitId = firstUsefulString(object?.file_id, object?.fileId, object?.asset_id, object?.assetId, object?.id,
        object?.metadata?.file_id, object?.metadata?.fileId, object?.metadata?.asset_id, object?.metadata?.assetId);
      const fileId = explicitId || chatGptAssetId(pointer || url);
      if (!url && !pointer && !fileId) return;
      const key = `image:${fileId || pointer || url}`;
      if (seen.has(key)) return;
      seen.add(key);
      const dataUrl = /^data:image\//i.test(url) ? url : "";
      blocks.push({
        type: "image",
        sourceKind: role === "user" ? "user-upload" : "ai-generated",
        alt: `${role === "user" ? "用户发送图片" : "AI 生成/回复图片"}${normalizeText(object?.alt || object?.caption || object?.name || object?.filename || "") ? ` · ${normalizeText(object?.alt || object?.caption || object?.name || object?.filename || "")}` : ""}`,
        src: url || pointer || "",
        originalSrc: firstUsefulString(object?.original_url, object?.originalUrl, object?.download_url, object?.downloadUrl, url),
        renderedSrc: firstUsefulString(object?.thumbnail_url, object?.thumbnailUrl, url),
        assetPointer: pointer || (/^(?:file-service|sediment|asset):\/\//i.test(url) ? url : ""),
        fileId,
        mime: mimeText || normalizeText(object?.metadata?.mime_type || object?.metadata?.mimeType || ""),
        dataUrl,
        fetchStatus: dataUrl ? "embedded" : "pending",
        width: Number(object?.width || object?.metadata?.width || object?.image_width || 0) || null,
        height: Number(object?.height || object?.metadata?.height || object?.image_height || 0) || null,
        archivePath: path || ""
      });
    };
    const addAttachment = (object, path, typeText, mimeText) => {
      if (!includeAttachments) return;
      const href = firstUsefulString(object?.download_url, object?.downloadUrl, object?.signed_url, object?.url, object?.href);
      const pointer = firstUsefulString(object?.asset_pointer, object?.assetPointer, object?.file_pointer, object?.filePointer);
      const explicitId = firstUsefulString(object?.file_id, object?.fileId, object?.asset_id, object?.assetId, object?.id);
      const name = normalizeText(firstUsefulString(object?.name, object?.filename, object?.file_name, object?.title));
      if (!href && !pointer && !explicitId && !name) return;
      const key = `attachment:${pointer || href || explicitId || name}`;
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push({
        type: "attachment",
        name: name || "未命名附件",
        href: href || pointer || "",
        assetPointer: pointer || "",
        fileId: explicitId || chatGptAssetId(pointer || href),
        mime: mimeText || "",
        size: object?.size_bytes || object?.size || "",
        archivePath: path || ""
      });
    };
    const visit = (value, path = "root", depth = 0) => {
      if (!value || depth > 7) return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      const typeText = normalizeText(value.content_type || value.type || value.kind || value.media_type || "").toLowerCase();
      const mimeText = normalizeText(value.mime_type || value.mimeType || value.mimetype || value.content_type_mime || "").toLowerCase();
      const pathText = path.toLowerCase();
      const pointerText = firstUsefulString(value.asset_pointer, value.assetPointer, value.file_pointer, value.filePointer, value.sediment_pointer, value.sedimentPointer);
      const urlText = firstUsefulString(value.image_url, value.imageUrl, value.download_url, value.downloadUrl, value.url, value.src, value.thumbnail_url, value.thumbnailUrl);
      const filename = normalizeText(firstUsefulString(value.name, value.filename, value.file_name));
      const imageSignal = /image|dall|generated[_ -]?image|image_asset_pointer|input_image|output_image/.test(`${typeText} ${pathText}`)
        || /^image\//i.test(mimeText)
        || /\.(?:png|jpe?g|webp|gif|bmp|avif)(?:$|[?#])/i.test(`${urlText} ${filename}`)
        || /^sediment:\/\//i.test(pointerText)
        || (/^(?:file-service|asset):\/\//i.test(pointerText) && /image|dall|generation|multimodal/.test(`${typeText} ${pathText} ${messageContext}`));
      const fileSignal = /attachment|file|audio|video|document/.test(`${typeText} ${pathText}`)
        || Boolean(filename && FILE_EXTENSION_PATTERN.test(filename))
        || Boolean(mimeText && !/^image\//i.test(mimeText));
      if (imageSignal) addImage(value, path, typeText, mimeText);
      else if (fileSignal) addAttachment(value, path, typeText, mimeText);
      for (const [key, child] of Object.entries(value)) {
        if (["text", "content", "result", "caption", "prompt", "name", "filename", "file_name"].includes(key) && typeof child === "string") continue;
        if (child && typeof child === "object") visit(child, `${path}.${key}`, depth + 1);
      }
    };
    roots.forEach((root, index) => visit(root, `source[${index}]`, 0));
    return blocks;
  }
  function chatGptArchiveModelLabel(message, platform) {
    const metadata = message?.metadata || {};
    const candidates = [
      metadata.model_slug,
      metadata.default_model_slug,
      metadata.model_name,
      metadata.model,
      message?.author?.name
    ].map((value) => normalizeText(value || "")).filter(Boolean);
    for (const candidate of candidates) {
      const direct = modelMatchFromText(candidate, platform);
      if (direct) return direct;
      if (/^(?:chatgpt|gpt)[-_\s]*\d/i.test(candidate)) return prettifyModelLabel(candidate, platform);
    }
    return "";
  }
  function visibleChatGptArchiveMessage(node, order, platform, options = {}) {
    const message = node?.message;
    if (!message || !message.author) return null;
    const role = message.author.role;
    if (role !== "user" && role !== "assistant") return null;
    const metadata = message.metadata || {};
    if (metadata.is_visually_hidden_from_conversation === true || metadata.is_hidden === true) return null;
    const channel = normalizeText(message.channel || metadata.channel || "").toLowerCase();
    if (channel && !["final", "commentary"].includes(channel)) return null;
    const plainTextRaw = archiveMessageText(message);
    const textBlocks = blocksFromArchiveText(plainTextRaw, message.content || {});
    const mediaBlocks = archiveMediaBlocks(message, role, options);
    if (role === "assistant" && message.recipient && message.recipient !== "all" && !metadata.is_user_system_message) return null;
    if (!plainTextRaw && !mediaBlocks.length) return null;
    const imageCount = mediaBlocks.filter((block) => block.type === "image").length;
    const attachmentCount = mediaBlocks.filter((block) => block.type === "attachment").length;
    const plainText = plainTextRaw || (imageCount ? `[${role === "user" ? "用户发送图片" : "AI 生成/回复图片"} × ${imageCount}]` : `[附件 × ${attachmentCount}]`);
    return {
      id: message.id || node.id || `chatgpt-archive-${order}-${fnv1a(`${role}|${plainText}`)}`,
      role,
      order,
      createdAt: Number.isFinite(message.create_time) ? new Date(message.create_time * 1000).toISOString() : "",
      modelLabel: role === "assistant" ? chatGptArchiveModelLabel(message, platform) : "",
      blocks: [...textBlocks, ...mediaBlocks],
      plainText,
      captureSource: "chatgpt-archive"
    };
  }
  function activeChatGptBranch(payload, platform, options = {}) {
    const mapping = payload?.mapping;
    if (!mapping || typeof mapping !== "object") return [];
    let current = payload.current_node || payload.currentNode || "";
    const chain = [];
    const seen = new Set();
    while (current && mapping[current] && !seen.has(current)) {
      seen.add(current);
      const node = mapping[current];
      chain.push({ ...node, id: current });
      current = node.parent || "";
    }
    chain.reverse();
    const messages = [];
    let pendingAssistantMedia = [];
    let pendingSourceIds = [];
    const flushPending = () => {
      if (!pendingAssistantMedia.length) return;
      const last = messages.at(-1);
      if (last?.role === "assistant") {
        last.blocks = mergeMediaBlocks(last.blocks || [], pendingAssistantMedia);
        if (!last.plainText) last.plainText = `[AI 生成/回复图片 × ${pendingAssistantMedia.filter((block) => block.type === "image").length}]`;
        last.captureSource = [last.captureSource, "chatgpt-tool-media"].filter(Boolean).join("+");
      } else {
        const imageCount = pendingAssistantMedia.filter((block) => block.type === "image").length;
        const attachmentCount = pendingAssistantMedia.filter((block) => block.type === "attachment").length;
        messages.push({
          id: `chatgpt-tool-media-${pendingSourceIds.join("-") || messages.length}`,
          role: "assistant",
          order: messages.length,
          createdAt: "",
          modelLabel: "",
          blocks: pendingAssistantMedia,
          plainText: imageCount ? `[AI 生成/回复图片 × ${imageCount}]` : `[附件 × ${attachmentCount}]`,
          captureSource: "chatgpt-tool-media"
        });
      }
      pendingAssistantMedia = [];
      pendingSourceIds = [];
    };
    chain.forEach((node) => {
      const rawMessage = node?.message;
      const role = rawMessage?.author?.role || "";
      const snapshot = visibleChatGptArchiveMessage(node, messages.length, platform, options);
      if (snapshot) {
        if (snapshot.role === "assistant" && pendingAssistantMedia.length) {
          snapshot.blocks = mergeMediaBlocks(snapshot.blocks || [], pendingAssistantMedia);
          snapshot.captureSource = `${snapshot.captureSource}+chatgpt-tool-media`;
          pendingAssistantMedia = [];
          pendingSourceIds = [];
        } else if (snapshot.role === "user" && pendingAssistantMedia.length) {
          // A tool result without a final assistant message is still a visible AI image turn.
          flushPending();
        }
        snapshot.order = messages.length;
        messages.push(snapshot);
        return;
      }
      if (!rawMessage || !["assistant", "tool"].includes(role)) return;
      const media = archiveMediaBlocks(rawMessage, "assistant", options).filter((block) => block.type === "image" || block.type === "attachment");
      if (!media.length) return;
      pendingAssistantMedia = mergeMediaBlocks(pendingAssistantMedia, media);
      pendingSourceIds.push(rawMessage.id || node.id || String(messages.length));
    });
    flushPending();
    messages.forEach((message, index) => { message.order = index; });
    return messages;
  }
  async function loadChatGptArchive(platform, options = {}) {
    if (platform.id !== "chatgpt") return { ok: false, reason: "not-chatgpt", messages: [] };
    const conversationId = chatGptConversationId();
    if (!conversationId) return { ok: false, reason: "no-conversation-id", messages: [] };
    let accessToken = "";
    try {
      const session = await fetchJsonRobust(`${location.origin}/api/auth/session`, {}, 18000);
      accessToken = normalizeText(session?.accessToken || session?.access_token || "");
    } catch {
      accessToken = "";
    }
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const endpoints = [
      `${location.origin}/backend-api/conversation/${encodeURIComponent(conversationId)}`,
      `${location.origin}/backend-api/conversation/${encodeURIComponent(conversationId)}?refresh=true`
    ];
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const payload = await fetchJsonRobust(endpoint, headers, 45000);
        const messages = activeChatGptBranch(payload, platform, options);
        if (!messages.length) throw new Error("服务器档案中没有可见用户/AI消息");
        return {
          ok: true,
          conversationId,
          title: normalizeText(payload.title || ""),
          messages,
          messageIds: messages.map((message) => message.id),
          rawNodeCount: Object.keys(payload.mapping || {}).length,
          currentNode: payload.current_node || "",
          imageCount: messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "image").length, 0),
          attachmentCount: messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "attachment").length, 0)
        };
      } catch (error) {
        lastError = error;
      }
    }
    return { ok: false, reason: "request-failed", error: lastError?.message || "无法读取 ChatGPT 对话档案", messages: [] };
  }

  // src/content.js
  var VERSION = "0.4.3";
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var activeCapture = null;
  function currentPlatform() {
    return detectPlatform(document);
  }
  function isSupportedPage() {
    return supportedHost(location.hostname);
  }
  function messageRichness(message) {
    const media = (message.blocks || []).filter((block) => block.type === "image" || block.type === "attachment").length;
    return message.plainText.length + (message.blocks?.length || 0) * 20 + media * 500 + (message.modelLabel ? 100 : 0);
  }
  function summarizeModelLabel(messages, platform) {
    const pageLabel = detectModelLabel(document, platform, { fallback: false });
    const labels = [pageLabel, ...(messages || []).map((message) => message.modelLabel)].map((label) => String(label || "").trim()).filter(Boolean).filter((label, index, array) => array.findIndex((candidate) => candidate.toLowerCase() === label.toLowerCase()) === index);
    return labels.slice(0, 4).join(" / ") || platform.assistantLabel;
  }
  function normalizedConversationUrl(value = location.href) {
    try {
      const url = new URL(value);
      url.hash = "";
      return url.href;
    } catch {
      return String(value || "");
    }
  }
  async function readModelOverride(platform) {
    try {
      const stored = await chrome.storage.local.get(["rockwellModelOverrideByUrl041", "rockwellModelOverrideByHost041"]);
      const byUrl = stored.rockwellModelOverrideByUrl041 || {};
      const byHost = stored.rockwellModelOverrideByHost041 || {};
      const value = normalizeText(byUrl[normalizedConversationUrl()] || byHost[hostnameFrom(document)] || "");
      return value && value.length < 180 ? prettifyModelLabel(value, platform) : "";
    } catch {
      return "";
    }
  }
  function getScrollableAncestors(element) {
    const result = [];
    let current = element?.parentElement;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 120) result.push(current);
      current = current.parentElement;
    }
    return result;
  }
  function scoreScrollable(element, platform, extractionMode) {
    if (!element) return -1;
    const messageCount = getMessageElements(element, platform, { mode: extractionMode }).length;
    const area = Math.max(1, element.clientHeight * element.clientWidth);
    return messageCount * 1e6 + area;
  }
  function findBestScrollable(platform, extractionMode) {
    const messages = getMessageElements(document, platform, { mode: extractionMode });
    const anchor = messages.at(-1) || document.querySelector("main") || document.body;
    const ancestors = getScrollableAncestors(anchor);
    if (ancestors.length) return ancestors.sort((a, b) => scoreScrollable(b, platform, extractionMode) - scoreScrollable(a, platform, extractionMode))[0];
    const candidates = Array.from(document.querySelectorAll("main, section, div")).filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 120;
    });
    candidates.sort((a, b) => scoreScrollable(b, platform, extractionMode) - scoreScrollable(a, platform, extractionMode));
    return candidates[0] || null;
  }
  function createScrollAdapter(platform, extractionMode) {
    const element = findBestScrollable(platform, extractionMode);
    if (element) {
      return {
        kind: "element",
        element,
        get top() {
          return element.scrollTop;
        },
        get max() {
          return Math.max(0, element.scrollHeight - element.clientHeight);
        },
        get viewport() {
          return element.clientHeight || window.innerHeight;
        },
        setTop(value) {
          element.scrollTop = Math.max(0, Math.min(value, this.max));
        },
        signature() {
          return `${Math.round(element.scrollTop)}:${element.scrollHeight}:${element.clientHeight}`;
        }
      };
    }
    const scrollingElement = document.scrollingElement || document.documentElement;
    return {
      kind: "document",
      element: scrollingElement,
      get top() {
        return window.scrollY || scrollingElement.scrollTop || 0;
      },
      get max() {
        return Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
      },
      get viewport() {
        return window.innerHeight;
      },
      setTop(value) {
        window.scrollTo({ top: Math.max(0, Math.min(value, this.max)), behavior: "auto" });
      },
      signature() {
        return `${Math.round(this.top)}:${scrollingElement.scrollHeight}:${window.innerHeight}`;
      }
    };
  }
  function stopReason(session) {
    if (session.cancelled) return "cancelled";
    if (Date.now() - session.startedAt >= session.maxDurationMs) return "timeout";
    return "";
  }
  async function waitForPageSettle(session, delay = 420) {
    const speedFactor = session.speedMode === "fast" ? 0.42 : session.speedMode === "balanced" ? 0.7 : 1;
    const adjustedDelay = Math.max(80, Math.round(delay * speedFactor));
    const end = Date.now() + adjustedDelay;
    while (Date.now() < end) {
      if (stopReason(session)) return;
      await sleep(Math.min(70, end - Date.now()));
    }
    if (!stopReason(session) && !document.hidden) await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  function mergeMediaBlocks(primary = [], secondary = []) {
    const result = [...primary];
    const seen = new Set(result.map((block) => {
      if (block.type === "image") return `image:${block.dataUrl || block.originalSrc || block.src || block.assetPointer || block.alt || ""}`;
      if (block.type === "attachment") return `attachment:${block.href || block.name || ""}`;
      return "";
    }).filter(Boolean));
    for (const block of secondary) {
      if (block.type !== "image" && block.type !== "attachment") continue;
      const key = block.type === "image"
        ? `image:${block.dataUrl || block.originalSrc || block.src || block.assetPointer || block.alt || ""}`
        : `attachment:${block.href || block.name || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(block);
      }
    }
    return result;
  }
  function mergeCapturedMessage(existing, incoming) {
    const existingTextBlocks = (existing.blocks || []).filter((block) => block.type !== "image" && block.type !== "attachment");
    const incomingTextBlocks = (incoming.blocks || []).filter((block) => block.type !== "image" && block.type !== "attachment");
    const richerIncoming = messageRichness(incoming) > messageRichness(existing);
    const textBlocks = richerIncoming && incomingTextBlocks.length ? incomingTextBlocks : existingTextBlocks.length ? existingTextBlocks : incomingTextBlocks;
    return {
      ...existing,
      ...incoming,
      id: existing.id || incoming.id,
      order: Number.isFinite(existing.order) ? existing.order : incoming.order,
      sequence: existing.sequence,
      createdAt: existing.createdAt || incoming.createdAt || "",
      modelLabel: incoming.modelLabel || existing.modelLabel || "",
      plainText: richerIncoming ? incoming.plainText : existing.plainText || incoming.plainText,
      blocks: mergeMediaBlocks(textBlocks, [...(existing.blocks || []), ...(incoming.blocks || [])]),
      captureSource: [existing.captureSource, incoming.captureSource].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join("+") || "dom"
    };
  }
  var MessageCollector = class {
    constructor(platform, extractionMode, captureOptions = {}) {
      this.platform = platform;
      this.extractionMode = extractionMode;
      this.captureOptions = captureOptions;
      this.map = /* @__PURE__ */ new Map();
      this.orderIndex = /* @__PURE__ */ new Map();
      this.fingerprintIndex = /* @__PURE__ */ new Map();
      this.sequence = 0;
      this.duplicates = 0;
      this.updates = 0;
    }
    fingerprint(message) {
      return `${message.role}:${fnv1a(normalizeText(message.plainText || ""))}`;
    }
    indexMessage(message) {
      if (Number.isFinite(message.order)) this.orderIndex.set(`${message.role}:${message.order}`, message.id);
      const fingerprint = this.fingerprint(message);
      const ids = this.fingerprintIndex.get(fingerprint) || [];
      if (!ids.includes(message.id)) ids.push(message.id);
      this.fingerprintIndex.set(fingerprint, ids);
    }
    resolveExistingId(message) {
      if (this.map.has(message.id)) return message.id;
      if (Number.isFinite(message.order)) {
        const byOrder = this.orderIndex.get(`${message.role}:${message.order}`);
        if (byOrder && this.map.has(byOrder)) return byOrder;
      }
      const ids = this.fingerprintIndex.get(this.fingerprint(message)) || [];
      if (ids.length === 1 && this.map.has(ids[0])) return ids[0];
      return "";
    }
    addMessage(message) {
      if (!message?.plainText) return false;
      const existingId = this.resolveExistingId(message);
      if (!existingId) {
        const record = { ...message, sequence: this.sequence++ };
        this.map.set(record.id, record);
        this.indexMessage(record);
        return true;
      }
      this.duplicates += 1;
      const existing = this.map.get(existingId);
      const merged = mergeCapturedMessage(existing, { ...message, id: existingId });
      if (messageRichness(merged) >= messageRichness(existing) || JSON.stringify(merged.blocks) !== JSON.stringify(existing.blocks)) {
        this.map.set(existingId, merged);
        this.updates += 1;
      }
      return false;
    }
    addMessages(messages = []) {
      let added = 0;
      for (const message of messages) if (this.addMessage(message)) added += 1;
      return added;
    }
    addVisible() {
      return this.addMessages(extractVisibleMessages(document, this.platform, { ...this.captureOptions, mode: this.extractionMode }).map((message) => ({ ...message, captureSource: "dom" })));
    }
    values() {
      return Array.from(this.map.values()).sort((a, b) => {
        if (Number.isFinite(a.order) && Number.isFinite(b.order) && a.order !== b.order) return a.order - b.order;
        return a.sequence - b.sequence;
      }).map(({ sequence, ...message }) => message);
    }
    stats() {
      const values = this.values();
      return {
        total: values.length,
        user: values.filter((m) => m.role === "user").length,
        assistant: values.filter((m) => m.role === "assistant").length,
        duplicates: this.duplicates,
        updates: this.updates
      };
    }
  };
  function emitProgress(session, phase, current, total, detail) {
    const stats = session.collector.stats();
    try {
      const result = chrome.runtime.sendMessage({
        type: "ROCKWELL_CAPTURE_PROGRESS",
        payload: { captureId: session.id, phase, current, total, detail, stats, elapsedMs: Date.now() - session.startedAt }
      });
      if (result?.catch) result.catch(() => {
      });
    } catch {
    }
  }
  function makePayload(session, status = "complete") {
    const messages = session.collector.values();
    const characterCount = messages.reduce((sum, message) => sum + message.plainText.length, 0);
    const stats = session.collector.stats();
    const imageCount = messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "image").length, 0);
    const attachmentCount = messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "attachment").length, 0);
    const embeddedImageCount = messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "image" && Boolean(block.dataUrl)).length, 0);
    const failedImageCount = messages.reduce((sum, message) => sum + (message.blocks || []).filter((block) => block.type === "image" && block.fetchStatus === "failed").length, 0);
    const resolvedModelLabel = session.modelOverride || summarizeModelLabel(messages, session.platform);
    for (const message of messages) if (message.role === "assistant" && !message.modelLabel) message.modelLabel = resolvedModelLabel;
    return {
      schemaVersion: 5,
      appVersion: VERSION,
      captureId: session.id,
      captureStatus: status,
      partial: status !== "complete",
      platform: session.platform.platform,
      platformId: session.platform.id,
      modelLabel: resolvedModelLabel,
      modelLabelSource: session.modelOverride ? "manual" : "automatic",
      title: session.archive?.title || detectConversationTitle(document, session.platform),
      sourceUrl: location.href,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      startedAt: new Date(session.startedAt).toISOString(),
      elapsedMs: Date.now() - session.startedAt,
      characterCount,
      userMessageCount: stats.user,
      assistantMessageCount: stats.assistant,
      duplicateCount: stats.duplicates,
      imageCount,
      embeddedImageCount,
      failedImageCount,
      attachmentCount,
      extractionMode: session.extractionMode,
      captureOptions: {
        speedMode: session.speedMode,
        mediaMode: session.captureOptions.mediaMode || "full",
        includeUserImages: session.captureOptions.includeUserImages !== false,
        includeAiImages: session.captureOptions.includeAiImages !== false,
        includeAttachments: session.captureOptions.includeAttachments !== false
      },
      diagnostics: {
        ...diagnoseExtraction(document, session.platform, { ...session.captureOptions, mode: session.extractionMode }),
        completeness: {
          strategy: session.archive?.ok ? "chatgpt-archive+dom" : "dom-scroll",
          verified: Boolean(session.archive?.ok && (session.missingArchiveIds?.length || 0) === 0 && messages.length === session.archive.messages.length),
          expectedMessageCount: session.archive?.messages?.length || null,
          capturedMessageCount: messages.length,
          missingMessageCount: session.missingArchiveIds?.length || 0,
          missingMessageIds: (session.missingArchiveIds || []).slice(0, 50),
          extraMessageCount: session.extraDomMessages?.length || Math.max(0, messages.length - (session.archive?.messages?.length || messages.length)),
          extraMessageIds: (session.extraDomMessages || []).map((message) => message.id).slice(0, 50),
          archiveImageCount: session.archive?.imageCount || 0,
          archiveAttachmentCount: session.archive?.attachmentCount || 0,
          archiveNodeCount: session.archive?.rawNodeCount || null,
          archiveError: session.archive?.ok ? "" : session.archive?.error || session.archive?.reason || ""
        }
      },
      messages
    };
  }
  var HISTORY_INDEX_KEY = "rockwellCaptureHistoryIndex";
  var HISTORY_RECORD_PREFIX = "rockwellCaptureHistory:";
  async function archiveCapture(payload) {
    if (!payload?.captureId || !Array.isArray(payload.messages)) return;
    try {
      const stored = await chrome.storage.local.get([HISTORY_INDEX_KEY, "rockwellHistoryLimit"]);
      const limit = Math.max(3, Math.min(12, Number(stored.rockwellHistoryLimit) || 6));
      const recordKey = `${HISTORY_RECORD_PREFIX}${payload.captureId}`;
      const summary = {
        id: payload.captureId,
        recordKey,
        title: payload.title || `${payload.platform || "AI"} \u5BF9\u8BDD`,
        platform: payload.platform || "AI",
        modelLabel: payload.modelLabel || "",
        sourceUrl: payload.sourceUrl || "",
        capturedAt: payload.capturedAt,
        captureStatus: payload.captureStatus,
        partial: Boolean(payload.partial),
        messageCount: payload.messages.length,
        characterCount: payload.characterCount || 0,
        imageCount: payload.imageCount || 0,
        embeddedImageCount: payload.embeddedImageCount || 0,
        failedImageCount: payload.failedImageCount || 0,
        attachmentCount: payload.attachmentCount || 0
      };
      const previous = Array.isArray(stored[HISTORY_INDEX_KEY]) ? stored[HISTORY_INDEX_KEY] : [];
      const index = [summary, ...previous.filter((item) => item?.id !== payload.captureId)].slice(0, limit);
      const removed = previous.filter((item) => !index.some((kept) => kept.id === item?.id)).map((item) => item?.recordKey).filter(Boolean);
      await chrome.storage.local.set({ [recordKey]: payload, [HISTORY_INDEX_KEY]: index });
      if (removed.length) await chrome.storage.local.remove(removed);
    } catch {
    }
  }
  async function saveCheckpoint(session, force = false) {
    const now = Date.now();
    if (!force && now - session.lastCheckpointAt < 2400) return;
    session.lastCheckpointAt = now;
    try {
      await chrome.storage.local.set({
        rockwellActiveCapture: {
          sourceUrl: location.href,
          captureId: session.id,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          payload: makePayload(session, "in-progress")
        }
      });
    } catch {
    }
  }
  async function scanTowardTop(session, adapter) {
    const maxRounds = session.speedMode === "fast" ? 260 : session.speedMode === "balanced" ? 420 : 700;
    let stableAtTop = 0;
    let previousSignature = "";
    for (let round = 0; round < maxRounds && !stopReason(session); round += 1) {
      const beforeCount = session.collector.map.size;
      session.collector.addVisible();
      const stepFactor = session.speedMode === "fast" ? 0.92 : session.speedMode === "balanced" ? 0.62 : 0.42;
      const step = Math.max(260, adapter.viewport * stepFactor);
      adapter.setTop(adapter.top - step);
      await waitForPageSettle(session, adapter.top <= 3 ? 1400 : 520);
      const added = session.collector.addVisible();
      const signature = adapter.signature();
      const atTop = adapter.top <= 3;
      const unchanged = signature === previousSignature && session.collector.map.size === beforeCount && added === 0;
      stableAtTop = atTop && unchanged ? stableAtTop + 1 : 0;
      previousSignature = signature;
      emitProgress(session, "up", round + 1, maxRounds, `\u5411\u4E0A\u52A0\u8F7D\u65E7\u6D88\u606F\uFF1A\u5DF2\u53D1\u73B0 ${session.collector.map.size} \u6761`);
      await saveCheckpoint(session);
      if (stableAtTop >= (session.platform.id === "chatgpt" ? 7 : 3)) break;
    }
    if (!stopReason(session)) {
      adapter.setTop(0);
      await waitForPageSettle(session, 650);
      session.collector.addVisible();
    }
  }
  async function scanTowardBottom(session, adapter) {
    const maxRounds = session.speedMode === "fast" ? 320 : session.speedMode === "balanced" ? 520 : 820;
    let stableAtBottom = 0;
    let previousSignature = "";
    for (let round = 0; round < maxRounds && !stopReason(session); round += 1) {
      session.collector.addVisible();
      const stepFactor = session.speedMode === "fast" ? 0.95 : session.speedMode === "balanced" ? 0.66 : 0.45;
      const step = Math.max(260, adapter.viewport * stepFactor);
      adapter.setTop(adapter.top + step);
      await waitForPageSettle(session, adapter.top >= adapter.max - 3 ? 1100 : 480);
      const beforeCount = session.collector.map.size;
      const added = session.collector.addVisible();
      const signature = adapter.signature();
      const atBottom = adapter.top >= adapter.max - 3;
      const unchanged = signature === previousSignature && session.collector.map.size === beforeCount && added === 0;
      stableAtBottom = atBottom && unchanged ? stableAtBottom + 1 : 0;
      previousSignature = signature;
      emitProgress(session, "down", round + 1, maxRounds, `\u5411\u4E0B\u5DE1\u68C0\u5E76\u53BB\u91CD\uFF1A\u5DF2\u6574\u7406 ${session.collector.map.size} \u6761`);
      await saveCheckpoint(session);
      if (stableAtBottom >= (session.platform.id === "chatgpt" ? 6 : 3)) break;
    }
  }
  async function restoreScroll(session) {
    if (!session.adapter) return;
    const target = session.originalMax > 0 ? session.adapter.max * session.originalRatio : session.originalTop;
    session.adapter.setTop(target);
    await sleep(80);
  }
  async function captureConversation(options = {}) {
    if (!isSupportedPage()) throw new Error("\u5F53\u524D\u9875\u9762\u4E0D\u662F RockwellTowards \u652F\u6301\u7684 AI \u5BF9\u8BDD\u9875\u9762\u3002");
    if (activeCapture) throw new Error("\u5DF2\u6709\u6355\u83B7\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u5148\u505C\u6B62\u6216\u7B49\u5F85\u5B8C\u6210\u3002");
    const platform = currentPlatform();
    const extractionMode = ["auto", "platform", "generic"].includes(options.extractionMode) ? options.extractionMode : "auto";
    const initialMessages = extractVisibleMessages(document, platform, { mode: extractionMode });
    const archive = platform.id === "chatgpt" ? await loadChatGptArchive(platform, options) : { ok: false, reason: "not-chatgpt", messages: [] };
    if (initialMessages.length === 0 && !archive.messages?.length) throw new Error(`没有识别到 ${platform.platform} 对话消息。请确认已打开具体对话；仍有问题时可运行兼容性检查。`);
    const modelOverride = normalizeText(options.modelLabelOverride || "") || await readModelOverride(platform);
    const session = {
      id: `rw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform,
      modelOverride,
      extractionMode,
      captureOptions: { ...options },
      speedMode: ["fast", "balanced", "complete"].includes(options.speedMode) ? options.speedMode : "balanced",
      collector: new MessageCollector(platform, extractionMode, options),
      startedAt: Date.now(),
      maxDurationMs: Math.max(15e3, Math.min(Number(options.maxDurationMs) || 9e5, 18e5)),
      cancelled: false,
      lastCheckpointAt: 0,
      adapter: null,
      originalTop: 0,
      originalMax: 0,
      originalRatio: 1,
      archive,
      missingArchiveIds: [],
      extraDomMessages: [],
      observer: null
    };
    activeCapture = session;
    if (archive.messages?.length) {
      session.collector.addMessages(archive.messages);
      emitProgress(session, "archive", archive.messages.length, archive.messages.length, `已从 ChatGPT 对话档案读取 ${archive.messages.length} 条，正在补充页面图片与格式`);
    }
    session.collector.addVisible();
    try {
      const observeRoot = document.querySelector("main") || document.body;
      session.observer = new MutationObserver(() => session.collector.addVisible());
      session.observer.observe(observeRoot, { childList: true, subtree: true });
    } catch {
      session.observer = null;
    }
    emitProgress(session, "prepare", 0, 1, `\u6B63\u5728\u5B9A\u4F4D ${platform.platform} \u5BF9\u8BDD\u533A\u57DF`);
    let status = "complete";
    try {
      if (options.autoScroll !== false) {
        session.adapter = createScrollAdapter(platform, extractionMode);
        session.originalTop = session.adapter.top;
        session.originalMax = session.adapter.max;
        session.originalRatio = session.originalMax > 0 ? session.originalTop / session.originalMax : 1;
        await scanTowardTop(session, session.adapter);
        if (!stopReason(session)) await scanTowardBottom(session, session.adapter);
      } else {
        emitProgress(session, "quick", 1, 1, `\u5FEB\u901F\u63D0\u53D6\u5F53\u524D\u5DF2\u52A0\u8F7D\u7684 ${session.collector.map.size} \u6761\u6D88\u606F`);
      }
      const reason = stopReason(session);
      if (reason) status = reason;
      session.collector.addVisible();
      if (platform.id === "chatgpt" && archive.ok && !reason) {
        // Refresh after scrolling because the newest turn or generated image may not have
        // been persisted when the first archive request was made.
        try {
          const refreshedArchive = await loadChatGptArchive(platform, options);
          if (refreshedArchive.ok) {
            session.archive = refreshedArchive;
            session.collector.addMessages(refreshedArchive.messages);
            emitProgress(session, "archive-refresh", refreshedArchive.messages.length, refreshedArchive.messages.length, `已刷新 ChatGPT 档案：${refreshedArchive.messages.length} 条，档案图片 ${refreshedArchive.imageCount || 0} 张`);
          }
        } catch {}
      }
      if (session.archive?.ok) {
        session.missingArchiveIds = session.archive.messageIds.filter((id) => !session.collector.map.has(id));
        const currentMessages = session.collector.values();
        session.extraDomMessages = currentMessages.filter((message) => !session.archive.messageIds.includes(message.id) && !String(message.captureSource || "").includes("chatgpt-archive"));
        if (!reason && (session.missingArchiveIds.length || currentMessages.length !== session.archive.messages.length)) status = "incomplete";
      } else if (platform.id === "chatgpt" && !reason) {
        status = "unverified";
      }
      if (!session.cancelled) await hydrateCapturedImages(session);
      emitProgress(
        session,
        status === "complete" ? "done" : status,
        1,
        1,
        status === "complete" ? `完整性已校验，共 ${session.collector.map.size} 条消息；图片 ${session.archive?.imageCount || 0} 张` : status === "unverified" ? `已读取 ${session.collector.map.size} 条，但 ChatGPT 档案接口不可用，完整性未校验` : status === "incomplete" ? `检测到缺失，已保存 ${session.collector.map.size} 条部分结果` : status === "cancelled" ? `已停止，保留 ${session.collector.map.size} 条部分结果` : `已触发安全保护，保留 ${session.collector.map.size} 条部分结果`
      );
      await saveCheckpoint(session, true);
      const payload = makePayload(session, status);
      await chrome.storage.local.set({ rockwellLastCapture: payload });
      await archiveCapture(payload);
      return payload;
    } finally {
      try { session.observer?.disconnect(); } catch {}
      await restoreScroll(session);
      try {
        await chrome.storage.local.remove("rockwellActiveCapture");
      } catch {
      }
      activeCapture = null;
    }
  }
  function messageListener(message, _sender, sendResponse) {
    if (message?.type === "ROCKWELL_PING") {
      sendResponse({ ok: true, version: VERSION, captureActive: Boolean(activeCapture) });
      return false;
    }
    if (message?.type === "ROCKWELL_GET_STATUS") {
      const platform = currentPlatform();
      const mode = message.options?.extractionMode || "auto";
      const visible = extractVisibleMessages(document, platform, { mode });
      sendResponse({
        ok: true,
        supported: isSupportedPage(),
        version: VERSION,
        platform: platform.platform,
        platformId: platform.id,
        title: detectConversationTitle(document, platform),
        modelLabel: summarizeModelLabel(visible, platform),
        imageCount: visible.reduce((sum, message2) => sum + (message2.blocks || []).filter((block) => block.type === "image").length, 0),
        attachmentCount: visible.reduce((sum, message2) => sum + (message2.blocks || []).filter((block) => block.type === "attachment").length, 0),
        visibleMessageCount: visible.length,
        captureActive: Boolean(activeCapture),
        diagnostics: diagnoseExtraction(document, platform, { mode })
      });
      return false;
    }
    if (message?.type === "ROCKWELL_CAPTURE") {
      captureConversation(message.options || {}).then((payload) => sendResponse({ ok: true, payload })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "ROCKWELL_CANCEL_CAPTURE") {
      if (activeCapture) {
        activeCapture.cancelled = true;
        sendResponse({ ok: true, captureId: activeCapture.id, messageCount: activeCapture.collector.map.size });
      } else sendResponse({ ok: false, error: "\u5F53\u524D\u6CA1\u6709\u6B63\u5728\u8FD0\u884C\u7684\u6355\u83B7\u4EFB\u52A1\u3002" });
      return false;
    }
    if (message?.type === "ROCKWELL_DIAGNOSE") {
      const platform = currentPlatform();
      sendResponse({ ok: true, report: diagnoseExtraction(document, platform, { mode: message.options?.extractionMode || "auto" }) });
      return false;
    }
    if (message?.type === "ROCKWELL_GET_PARTIAL") {
      sendResponse({ ok: true, payload: activeCapture ? makePayload(activeCapture, "in-progress") : null });
      return false;
    }
    return false;
  }
  if (!globalThis.__ROCKWELL_TOWARDS_CONTENT_041__) {
    globalThis.__ROCKWELL_TOWARDS_CONTENT_041__ = true;
    chrome.runtime.onMessage.addListener(messageListener);
  }
})();
