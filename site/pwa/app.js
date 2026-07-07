const STORAGE_KEY = "abandon-pocket-settings";

const elements = {
  installButton: document.querySelector("#install-button"),
  installStatus: document.querySelector("#install-status"),
  appStatus: document.querySelector("#app-status"),
  sourceInput: document.querySelector("#source-input"),
  translateButton: document.querySelector("#translate-button"),
  lookupButton: document.querySelector("#lookup-button"),
  speakButton: document.querySelector("#speak-button"),
  stopButton: document.querySelector("#stop-button"),
  clearButton: document.querySelector("#clear-button"),
  translationResult: document.querySelector("#translation-result"),
  wordResult: document.querySelector("#word-result"),
  apiKey: document.querySelector("#api-key"),
  apiBaseUrl: document.querySelector("#api-base-url"),
  apiModel: document.querySelector("#api-model"),
  saveSettingsButton: document.querySelector("#save-settings-button"),
};

let deferredInstallPrompt = null;
let busy = false;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const defaultSettings = {
  apiKey: "",
  apiBaseUrl: "https://api.deepseek.com",
  apiModel: "deepseek-chat",
};

const readSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return { ...defaultSettings };
    }

    return {
      ...defaultSettings,
      ...JSON.parse(saved),
    };
  } catch {
    return { ...defaultSettings };
  }
};

const writeSettings = (settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const getSettingsFromForm = () => ({
  apiKey: elements.apiKey.value.trim(),
  apiBaseUrl: elements.apiBaseUrl.value.trim() || defaultSettings.apiBaseUrl,
  apiModel: elements.apiModel.value.trim() || defaultSettings.apiModel,
});

const hydrateSettingsForm = () => {
  const settings = readSettings();
  elements.apiKey.value = settings.apiKey;
  elements.apiBaseUrl.value = settings.apiBaseUrl;
  elements.apiModel.value = settings.apiModel;
};

const setBusy = (nextBusy, statusText) => {
  busy = nextBusy;
  elements.translateButton.disabled = nextBusy;
  elements.lookupButton.disabled = nextBusy;
  elements.saveSettingsButton.disabled = nextBusy;

  if (statusText) {
    elements.appStatus.textContent = statusText;
  }
};

const setInstallStatus = (message) => {
  elements.installStatus.textContent = message;
};

const setEmptyCard = (node, message) => {
  node.classList.add("empty");
  node.innerHTML = escapeHtml(message);
};

const detectStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

const chooseVoice = (langPrefix) => {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith(langPrefix)) ||
    voices.find((voice) => voice.lang.toLowerCase().includes(langPrefix)) ||
    voices[0] ||
    null
  );
};

const speakText = (text) => {
  const trimmed = text.trim();
  if (!trimmed || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  const useEnglish = /[a-z]/i.test(trimmed);
  utterance.lang = useEnglish ? "en-US" : "zh-CN";
  utterance.rate = useEnglish ? 0.9 : 0.95;
  utterance.pitch = useEnglish ? 1.02 : 1;
  utterance.voice = chooseVoice(useEnglish ? "en" : "zh");
  window.speechSynthesis.speak(utterance);
};

const stopSpeech = () => {
  window.speechSynthesis?.cancel?.();
};

const renderTranslation = (source, translation) => {
  elements.translationResult.classList.remove("empty");
  elements.translationResult.innerHTML = `
    <p class="result-title">原文</p>
    <div class="result-copy">${escapeHtml(source)}</div>
    <p class="result-title" style="margin-top: 16px;">中文翻译</p>
    <div class="result-copy">${escapeHtml(translation)}</div>
  `;
};

const renderWordInfo = (info) => {
  const collocations = Array.isArray(info.collocations) ? info.collocations : [];
  const examples = Array.isArray(info.example_sentences) ? info.example_sentences : [];

  elements.wordResult.classList.remove("empty");
  elements.wordResult.innerHTML = `
    <div class="word-head">
      <div class="word-term">${escapeHtml(info.word || "")}</div>
      ${info.phonetic ? `<div class="phonetic">${escapeHtml(info.phonetic)}</div>` : ""}
    </div>
    <p class="result-title" style="margin-top: 16px;">中文释义</p>
    <div class="result-copy">${escapeHtml(info.translation || "暂无释义")}</div>
    ${
      collocations.length
        ? `
      <p class="result-title" style="margin-top: 16px;">常见搭配</p>
      <div class="tag-list">
        ${collocations.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
      </div>
    `
        : ""
    }
    ${
      info.memory_trick
        ? `
      <p class="result-title" style="margin-top: 16px;">记忆提示</p>
      <div class="result-copy">${escapeHtml(info.memory_trick)}</div>
    `
        : ""
    }
    ${
      examples.length
        ? `
      <p class="result-title" style="margin-top: 16px;">例句</p>
      <div class="example-list">
        ${examples
          .map(
            (item) => `
              <div class="example-item">
                <strong>${escapeHtml(item.english || "")}</strong>
                <div>${escapeHtml(item.chinese || "")}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `
        : ""
    }
  `;
};

const buildApiUrl = (baseUrl) => `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

const requireApiSettings = () => {
  const settings = getSettingsFromForm();
  if (!settings.apiKey) {
    throw new Error("请先在下方保存可用的 API Key。");
  }

  return settings;
};

const callChat = async ({ systemPrompt, userPrompt, responseFormat }) => {
  const settings = requireApiSettings();
  const body = {
    model: settings.apiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 1200,
  };

  if (responseFormat) {
    body.response_format = { type: responseFormat };
  }

  const response = await fetch(buildApiUrl(settings.apiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `请求失败，HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content?.trim?.();
  if (!content) {
    throw new Error("接口没有返回可用内容。");
  }

  return content;
};

const translateSentence = async () => {
  const text = elements.sourceInput.value.trim();
  if (!text) {
    elements.appStatus.textContent = "先输入要翻译的英文。";
    return;
  }

  setBusy(true, "句子翻译中...");
  try {
    const result = await callChat({
      systemPrompt:
        "You are a precise English-to-Chinese translator. Translate the user's text into natural Chinese. Return only the final Chinese translation without explanations.",
      userPrompt: text,
    });

    renderTranslation(text, result);
    elements.appStatus.textContent = "翻译完成。";
  } catch (error) {
    elements.appStatus.textContent = String(error);
  } finally {
    setBusy(false);
  }
};

const lookupWord = async () => {
  const text = elements.sourceInput.value.trim();
  if (!text) {
    elements.appStatus.textContent = "先输入要查询的单词或短语。";
    return;
  }

  setBusy(true, "单词查询中...");
  try {
    const result = await callChat({
      systemPrompt:
        'You are an English-Chinese dictionary editor. Given one English word or a very short phrase, return strict JSON with exactly these fields: {"word":"original word or phrase","phonetic":"UK IPA such as /.../, or empty string if unavailable","translation":"Chinese dictionary-style summary grouped by part of speech","collocations":["common phrase - Chinese meaning"],"memory_trick":"Chinese mnemonic, root, prefix/suffix, or usage tip. Leave empty if not useful.","example_sentences":[{"english":"Short natural example sentence.","chinese":"对应的自然中文。"}]}. Return 2 to 3 common example sentences when useful. Use Chinese in translation and memory_trick. Do not use markdown.',
      userPrompt: text,
      responseFormat: "json_object",
    });

    const info = JSON.parse(result);
    renderWordInfo(info);
    if (info.translation) {
      renderTranslation(text, info.translation);
    }
    elements.appStatus.textContent = "词典结果已更新。";
  } catch (error) {
    elements.appStatus.textContent = String(error);
  } finally {
    setBusy(false);
  }
};

const saveSettings = () => {
  const settings = getSettingsFromForm();
  writeSettings(settings);
  elements.appStatus.textContent = "API 设置已保存到当前浏览器。";
};

const refreshInstallUi = () => {
  if (detectStandalone()) {
    elements.installButton.hidden = true;
    setInstallStatus("当前已作为桌面 App 运行。");
    return;
  }

  if (deferredInstallPrompt) {
    elements.installButton.hidden = false;
    setInstallStatus("检测到可安装环境，点上方按钮即可加到桌面。");
    return;
  }

  if (isIos()) {
    elements.installButton.hidden = true;
    setInstallStatus("iPhone 请用 Safari 打开，然后点“分享” > “添加到主屏幕”。");
    return;
  }

  elements.installButton.hidden = true;
  setInstallStatus("如果浏览器支持安装，请从浏览器菜单里选择“安装应用”或“添加到主屏幕”。");
};

const registerInstallHandlers = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refreshInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    refreshInstallUi();
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      refreshInstallUi();
      return;
    }

    await deferredInstallPrompt.prompt();
    const outcome = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;

    if (outcome?.outcome === "accepted") {
      setInstallStatus("安装请求已接受。安装完成后可从桌面直接打开。");
    } else {
      setInstallStatus("已取消安装。稍后仍可从浏览器菜单再次安装。");
    }

    refreshInstallUi();
  });
};

const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("[Abandon Pocket] service worker registration failed", error);
  }
};

const bindEvents = () => {
  elements.translateButton.addEventListener("click", () => {
    void translateSentence();
  });
  elements.lookupButton.addEventListener("click", () => {
    void lookupWord();
  });
  elements.saveSettingsButton.addEventListener("click", saveSettings);
  elements.clearButton.addEventListener("click", () => {
    elements.sourceInput.value = "";
    setEmptyCard(elements.translationResult, "还没有翻译结果。");
    setEmptyCard(elements.wordResult, "还没有词典结果。");
    elements.appStatus.textContent = "已清空输入与结果。";
  });
  elements.speakButton.addEventListener("click", () => {
    const text = elements.sourceInput.value.trim();
    if (!text) {
      elements.appStatus.textContent = "先输入要朗读的内容。";
      return;
    }
    speakText(text);
  });
  elements.stopButton.addEventListener("click", stopSpeech);
};

const init = async () => {
  hydrateSettingsForm();
  setEmptyCard(elements.translationResult, "还没有翻译结果。");
  setEmptyCard(elements.wordResult, "还没有词典结果。");
  bindEvents();
  registerInstallHandlers();
  refreshInstallUi();
  await registerServiceWorker();
  elements.sourceInput.focus();
};

void init();
