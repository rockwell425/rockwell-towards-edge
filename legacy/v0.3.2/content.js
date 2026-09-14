(() => {
  // src/extractor.js
  var ROLE_HINTS = /* @__PURE__ */ new WeakMap();
  var ORDER_HINTS = /* @__PURE__ */ new WeakMap();
  var IMAGE_DATA_CACHE = /* @__PURE__ */ new WeakMap();
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
  function imageCandidateInfo(image) {
    const doc = image.ownerDocument;
    const src = absoluteUrl(image.currentSrc || image.getAttribute("src") || image.getAttribute("data-src") || "", doc);
    const alt = normalizeText(image.getAttribute("alt") || image.getAttribute("title") || image.getAttribute("aria-label") || "\u56FE\u7247");
    const className = String(image.className || "");
    const role = image.getAttribute("role") || "";
    const width = Number(image.naturalWidth || image.width || image.getAttribute("width") || 0);
    const height = Number(image.naturalHeight || image.height || image.getAttribute("height") || 0);
    return { src, alt, className, role, width, height };
  }
  function imageLooksLikeContent(info) {
    if (!info.src || /^data:image\/svg/i.test(info.src)) return false;
    if (/avatar|profile|logo|icon|emoji|favicon|spinner|loading/i.test(`${info.className} ${info.alt}`)) return false;
    if (/^(?:user|assistant|chatgpt|claude|gemini|deepseek|智谱清言|头像)$/i.test(info.alt)) return false;
    if (info.role === "presentation" && info.width && info.width < 80 && info.height && info.height < 80) return false;
    if (info.width && info.height && info.width < 64 && info.height < 64) return false;
    return true;
  }
  function imageDataUrlFromLoadedElement(image, info) {
    const cached = IMAGE_DATA_CACHE.get(image);
    if (cached?.src === info.src) return cached.dataUrl;
    if (/^data:image\//i.test(info.src)) {
      IMAGE_DATA_CACHE.set(image, { src: info.src, dataUrl: info.src });
      return info.src;
    }
    if (!image.complete || !info.width || !info.height || !image.ownerDocument?.createElement) return "";
    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(info.width, info.height));
    try {
      const canvas = image.ownerDocument.createElement("canvas");
      canvas.width = Math.max(1, Math.round(info.width * scale));
      canvas.height = Math.max(1, Math.round(info.height * scale));
      const context = canvas.getContext?.("2d");
      if (!context) return "";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png", 0.92);
      const result = dataUrl.length <= 12e6 ? dataUrl : "";
      IMAGE_DATA_CACHE.set(image, { src: info.src, dataUrl: result });
      return result;
    } catch {
      IMAGE_DATA_CACHE.set(image, { src: info.src, dataUrl: "" });
      return "";
    }
  }
  function extractImageBlocks(root, existingSources = /* @__PURE__ */ new Set()) {
    const blocks = [];
    for (const image of safeQueryAll(root, "img")) {
      const info = imageCandidateInfo(image);
      if (!imageLooksLikeContent(info) || existingSources.has(info.src)) continue;
      existingSources.add(info.src);
      blocks.push({
        type: "image",
        alt: info.alt || "\u56FE\u7247",
        src: info.src,
        dataUrl: imageDataUrlFromLoadedElement(image, info),
        width: info.width || null,
        height: info.height || null
      });
    }
    return blocks;
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
  function extractAttachmentBlocks(root) {
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
  function supplementalBlocks(element, platform, existingBlocks) {
    const envelope = messageEnvelope(element, platform);
    const existingSources = new Set(existingBlocks.filter((block) => block.type === "image").map((block) => block.src).filter(Boolean));
    return [
      ...extractAttachmentBlocks(envelope),
      ...extractImageBlocks(envelope, existingSources)
    ];
  }
  function extractBlocksFromElement(element, platform = detectPlatform(element.ownerDocument)) {
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
        const code = normalizeText(candidate.innerText || candidate.textContent || "");
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
    blocks.push(...supplementalBlocks(element, platform, blocks));
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
  function snapshotMessage(element, platform = detectPlatform(element.ownerDocument)) {
    const role = inferRoleFromElement(element, platform);
    const blocks = extractBlocksFromElement(element, platform);
    const plainText = normalizeText(blocks.flatMap((block) => {
      if (block.text) return block.text;
      if (block.items) return block.items.map((item) => typeof item === "string" ? item : item.text).join("\n");
      if (block.rows) return block.rows.flat().join("	");
      if (block.alt) return `[\u56FE\u7247] ${block.alt}`;
      if (block.name) return `[\u9644\u4EF6] ${block.name}`;
      return "";
    }).join("\n\n"));
    const localModelLabel = role === "assistant" ? detectModelLabel(messageEnvelope(element, platform), platform, { fallback: false }) : "";
    return { id: inferStableId(element, role, plainText, platform), role, order: inferTurnOrder(element, platform), modelLabel: localModelLabel, blocks, plainText };
  }
  function extractVisibleMessages(root = document, platform = detectPlatform(root.ownerDocument || root), options = {}) {
    return getMessageElements(root, platform, options).map((element) => snapshotMessage(element, platform)).filter((message) => message.plainText.length > 0);
  }
  function diagnoseExtraction(root = document, platform = detectPlatform(root.ownerDocument || root), options = {}) {
    const configuredCandidates = collectConfiguredCandidates(root, platform);
    const accepted = acceptTopLevelCandidates([...configuredCandidates]);
    const platformMessages = getMessageElements(root, platform, { mode: "platform" });
    const generic = genericElements(root, platform);
    const selected = getMessageElements(root, platform, options);
    const snapshots = selected.map((element) => snapshotMessage(element, platform)).filter((message) => message.plainText);
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
      version: "0.3.2",
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
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.getAttribute?.("value"),
      node.textContent
    ];
    return [...new Set(values.map((value) => normalizeText(value || "")).filter((value) => value && value.length < 180))];
  }
  var MODEL_PATTERNS = {
    chatgpt: [
      /\bChatGPT\s*\d+(?:\.\d+){0,2}(?:\s+(?:Sol|Thinking|Instant|Pro|Mini|Max|Auto|Fast))?\b/i,
      /\bGPT[-\s]?\d+(?:\.\d+){0,2}(?:[-\s](?:Sol|Thinking|Instant|Pro|Mini|Max|Auto|Fast))?\b/i,
      /\bo\d+(?:[-\s](?:mini|pro|preview|high|medium|low))?\b/i,
      /\b\d+(?:\.\d+){1,2}\s+(?:Sol|Thinking|Instant|Pro|Mini|Max)\b/i
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
  function modelMatchFromText(text, platform) {
    const cleaned = cleanModelMatch(text);
    for (const pattern of MODEL_PATTERNS[platform.id] || []) {
      const match = cleaned.match(pattern);
      if (match?.[0]) {
        let label = cleanModelMatch(match[0]);
        if (platform.id === "chatgpt" && /^\d+(?:\.\d+){1,2}\s+/i.test(label)) label = `ChatGPT ${label}`;
        if (platform.id === "gemini" && /^\d+(?:\.\d+){1,2}\s+/i.test(label)) label = `Gemini ${label}`;
        if (platform.id === "deepseek" && /^深度思考/i.test(label)) label = `DeepSeek \xB7 ${label}`;
        return label;
      }
    }
    return "";
  }
  function structuredModelFallback(root, platform) {
    const scripts = safeQueryAll(root, 'script[type="application/json"], script#__NEXT_DATA__, script[data-state]');
    const keyPattern = /["'](?:selectedModel|currentModel|activeModel|modelLabel|model_slug|modelSlug)["']\s*:\s*["']([^"']{1,90})["']/ig;
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
      chatgpt: ['[data-testid="model-switcher-dropdown-button"]', '[data-testid*="model-switcher" i]', '[class*="model-switcher" i]', "[data-model]", '[aria-label*="model" i]', 'header button[aria-haspopup="menu"]', "header button", 'header [role="button"]', "nav button", 'main button[aria-haspopup="menu"]'],
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
    const structured = structuredModelFallback(root.ownerDocument || root, platform);
    if (structured) return structured;
    return options.fallback === false ? "" : platform.assistantLabel;
  }

  // src/content.js
  var VERSION = "0.3.2";
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
    const end = Date.now() + delay;
    while (Date.now() < end) {
      if (stopReason(session)) return;
      await sleep(Math.min(70, end - Date.now()));
    }
    if (!stopReason(session)) await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  var MessageCollector = class {
    constructor(platform, extractionMode) {
      this.platform = platform;
      this.extractionMode = extractionMode;
      this.map = /* @__PURE__ */ new Map();
      this.sequence = 0;
      this.duplicates = 0;
      this.updates = 0;
    }
    addVisible() {
      let added = 0;
      for (const message of extractVisibleMessages(document, this.platform, { mode: this.extractionMode })) {
        const existing = this.map.get(message.id);
        if (!existing) {
          this.map.set(message.id, { ...message, sequence: this.sequence++ });
          added += 1;
        } else {
          this.duplicates += 1;
          if (messageRichness(message) > messageRichness(existing)) {
            this.map.set(message.id, { ...message, sequence: existing.sequence });
            this.updates += 1;
          }
        }
      }
      return added;
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
    return {
      schemaVersion: 4,
      appVersion: VERSION,
      captureId: session.id,
      captureStatus: status,
      partial: status !== "complete",
      platform: session.platform.platform,
      platformId: session.platform.id,
      modelLabel: summarizeModelLabel(messages, session.platform),
      title: detectConversationTitle(document, session.platform),
      sourceUrl: location.href,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      startedAt: new Date(session.startedAt).toISOString(),
      elapsedMs: Date.now() - session.startedAt,
      characterCount,
      userMessageCount: stats.user,
      assistantMessageCount: stats.assistant,
      duplicateCount: stats.duplicates,
      imageCount,
      attachmentCount,
      extractionMode: session.extractionMode,
      diagnostics: diagnoseExtraction(document, session.platform, { mode: session.extractionMode }),
      messages
    };
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
    const maxRounds = 220;
    let stableAtTop = 0;
    let previousSignature = "";
    for (let round = 0; round < maxRounds && !stopReason(session); round += 1) {
      const beforeCount = session.collector.map.size;
      session.collector.addVisible();
      const step = Math.max(520, adapter.viewport * 0.78);
      adapter.setTop(adapter.top - step);
      await waitForPageSettle(session, adapter.top <= 3 ? 720 : 390);
      const added = session.collector.addVisible();
      const signature = adapter.signature();
      const atTop = adapter.top <= 3;
      const unchanged = signature === previousSignature && session.collector.map.size === beforeCount && added === 0;
      stableAtTop = atTop && unchanged ? stableAtTop + 1 : 0;
      previousSignature = signature;
      emitProgress(session, "up", round + 1, maxRounds, `\u5411\u4E0A\u52A0\u8F7D\u65E7\u6D88\u606F\uFF1A\u5DF2\u53D1\u73B0 ${session.collector.map.size} \u6761`);
      await saveCheckpoint(session);
      if (stableAtTop >= 3) break;
    }
    if (!stopReason(session)) {
      adapter.setTop(0);
      await waitForPageSettle(session, 650);
      session.collector.addVisible();
    }
  }
  async function scanTowardBottom(session, adapter) {
    const maxRounds = 320;
    let stableAtBottom = 0;
    let previousSignature = "";
    for (let round = 0; round < maxRounds && !stopReason(session); round += 1) {
      session.collector.addVisible();
      const step = Math.max(520, adapter.viewport * 0.72);
      adapter.setTop(adapter.top + step);
      await waitForPageSettle(session, adapter.top >= adapter.max - 3 ? 620 : 340);
      const beforeCount = session.collector.map.size;
      const added = session.collector.addVisible();
      const signature = adapter.signature();
      const atBottom = adapter.top >= adapter.max - 3;
      const unchanged = signature === previousSignature && session.collector.map.size === beforeCount && added === 0;
      stableAtBottom = atBottom && unchanged ? stableAtBottom + 1 : 0;
      previousSignature = signature;
      emitProgress(session, "down", round + 1, maxRounds, `\u5411\u4E0B\u5DE1\u68C0\u5E76\u53BB\u91CD\uFF1A\u5DF2\u6574\u7406 ${session.collector.map.size} \u6761`);
      await saveCheckpoint(session);
      if (stableAtBottom >= 3) break;
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
    if (initialMessages.length === 0) throw new Error(`\u6CA1\u6709\u8BC6\u522B\u5230 ${platform.platform} \u5BF9\u8BDD\u6D88\u606F\u3002\u8BF7\u786E\u8BA4\u5DF2\u6253\u5F00\u5177\u4F53\u5BF9\u8BDD\uFF1B\u4ECD\u6709\u95EE\u9898\u65F6\u53EF\u8FD0\u884C\u517C\u5BB9\u6027\u68C0\u67E5\u3002`);
    const session = {
      id: `rw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform,
      extractionMode,
      collector: new MessageCollector(platform, extractionMode),
      startedAt: Date.now(),
      maxDurationMs: Math.max(15e3, Math.min(Number(options.maxDurationMs) || 9e5, 18e5)),
      cancelled: false,
      lastCheckpointAt: 0,
      adapter: null,
      originalTop: 0,
      originalMax: 0,
      originalRatio: 1
    };
    activeCapture = session;
    session.collector.addVisible();
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
      emitProgress(
        session,
        status === "complete" ? "done" : status,
        1,
        1,
        status === "complete" ? `\u5B8C\u6210\uFF0C\u5171 ${session.collector.map.size} \u6761\u6D88\u606F` : status === "cancelled" ? `\u5DF2\u505C\u6B62\uFF0C\u4FDD\u7559 ${session.collector.map.size} \u6761\u90E8\u5206\u7ED3\u679C` : `\u5DF2\u89E6\u53D1\u5B89\u5168\u4FDD\u62A4\uFF0C\u4FDD\u7559 ${session.collector.map.size} \u6761\u90E8\u5206\u7ED3\u679C`
      );
      await saveCheckpoint(session, true);
      const payload = makePayload(session, status);
      await chrome.storage.local.set({ rockwellLastCapture: payload });
      return payload;
    } finally {
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
  if (!globalThis.__ROCKWELL_TOWARDS_CONTENT_032__) {
    globalThis.__ROCKWELL_TOWARDS_CONTENT_032__ = true;
    chrome.runtime.onMessage.addListener(messageListener);
  }
})();
