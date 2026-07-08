import type {
  DateGroup,
  RuntimePaths,
  SentenceAnalysis,
  TranslationResult,
  UserSession,
  WordInfo,
  WordbookEntry,
} from "../types";

interface AddWordParams {
  word: string;
  translation: string;
  phonetic?: string | null;
  collocations?: string | null;
  memory_trick?: string | null;
  notes?: string | null;
}

const STORAGE_KEY = "abandon.browser.state.v2";
const DEFAULT_API_BASE_URL = "https://api.deepseek.com";
const DEFAULT_API_MODEL = "deepseek-chat";
const GLOBAL_ONLY_KEYS = new Set([
  "sync_dir",
  "github_sync_token",
  "github_sync_gist_cache",
]);
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "Abandon/1.0.1";
const GITHUB_REQUEST_TIMEOUT_MS = 12000;

interface BrowserUser {
  id: number;
  username: string;
  password_sha256: string;
  password_hash?: string | null;
  wordbook: WordbookEntry[];
  config: Record<string, string>;
}

interface BrowserState {
  nextUserId: number;
  nextWordId: number;
  currentUsername: string | null;
  globalConfig: Record<string, string>;
  guestConfig: Record<string, string>;
  guestWordbook: WordbookEntry[];
  users: Record<string, BrowserUser>;
}

interface SyncWordbookEntry {
  word: string;
  translation: string;
  notes?: string | null;
  phonetic?: string | null;
  collocations?: string | null;
  memory_trick?: string | null;
  familiarity: number;
  created_at: string;
}

interface SyncPayload {
  schema_version: number;
  username: string;
  exported_at: string;
  password_hash?: string | null;
  password_sha256?: string | null;
  wordbook: SyncWordbookEntry[];
  user_config: Array<{ key: string; value: string }>;
}

function createDefaultState(): BrowserState {
  return {
    nextUserId: 1,
    nextWordId: 1,
    currentUsername: null,
    globalConfig: {},
    guestConfig: {},
    guestWordbook: [],
    users: {},
  };
}

function cloneEntry(entry: WordbookEntry): WordbookEntry {
  return { ...entry };
}

function cloneEntries(entries: WordbookEntry[]): WordbookEntry[] {
  return entries.map(cloneEntry);
}

function readState(): BrowserState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw) as Partial<BrowserState>;
    return {
      nextUserId: parsed.nextUserId && parsed.nextUserId > 0 ? parsed.nextUserId : 1,
      nextWordId: parsed.nextWordId && parsed.nextWordId > 0 ? parsed.nextWordId : 1,
      currentUsername:
        typeof parsed.currentUsername === "string" && parsed.currentUsername.trim()
          ? normalizeUsername(parsed.currentUsername)
          : null,
      globalConfig: parsed.globalConfig ?? {},
      guestConfig: parsed.guestConfig ?? {},
      guestWordbook: cloneEntries(parsed.guestWordbook ?? []),
      users: Object.fromEntries(
        Object.entries(parsed.users ?? {}).map(([username, user]) => [
          normalizeUsername(username),
          {
            id: Number(user?.id) || 0,
            username: normalizeUsername(user?.username || username),
            password_sha256: typeof user?.password_sha256 === "string" ? user.password_sha256 : "",
            password_hash:
              typeof user?.password_hash === "string" ? user.password_hash : null,
            wordbook: cloneEntries(user?.wordbook ?? []),
            config: user?.config ?? {},
          } satisfies BrowserUser,
        ])
      ),
    };
  } catch {
    return createDefaultState();
  }
}

function writeState(state: BrowserState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

function sanitizeUsername(username: string): string {
  const sanitized = normalizeUsername(username)
    .split("")
    .map((char) =>
      /[a-z0-9._-]/.test(char) ? char : "_"
    )
    .join("");

  return sanitized || "user";
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseStoredDate(raw: string): Date {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return new Date(0);
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed.replace(" ", "T") + "Z");
  }

  return new Date(trimmed);
}

function sortEntries(entries: WordbookEntry[]): WordbookEntry[] {
  return [...entries].sort((left, right) => {
    const dateDelta =
      parseStoredDate(right.created_at).getTime() -
      parseStoredDate(left.created_at).getTime();
    if (dateDelta !== 0) {
      return dateDelta;
    }
    return left.word.localeCompare(right.word, "en");
  });
}

function getCurrentUserRecord(state: BrowserState): BrowserUser | null {
  if (!state.currentUsername) {
    return null;
  }
  return state.users[normalizeUsername(state.currentUsername)] ?? null;
}

function getWordbookScope(state: BrowserState): WordbookEntry[] {
  return getCurrentUserRecord(state)?.wordbook ?? state.guestWordbook;
}

function setWordbookScope(state: BrowserState, entries: WordbookEntry[]) {
  const user = getCurrentUserRecord(state);
  if (user) {
    user.wordbook = sortEntries(entries);
  } else {
    state.guestWordbook = sortEntries(entries);
  }
}

function getConfigScope(state: BrowserState): Record<string, string> {
  return getCurrentUserRecord(state)?.config ?? state.guestConfig;
}

function getConfigValue(state: BrowserState, key: string): string | null {
  if (GLOBAL_ONLY_KEYS.has(key)) {
    return state.globalConfig[key] ?? null;
  }

  const scoped = getConfigScope(state)[key];
  if (typeof scoped === "string") {
    return scoped;
  }

  return state.globalConfig[key] ?? null;
}

function setConfigValue(state: BrowserState, key: string, value: string) {
  if (GLOBAL_ONLY_KEYS.has(key)) {
    state.globalConfig[key] = value;
    return;
  }

  const scope = getConfigScope(state);
  scope[key] = value;
}

function nextWordId(state: BrowserState): number {
  const id = state.nextWordId;
  state.nextWordId += 1;
  return id;
}

function createWordbookEntry(
  state: BrowserState,
  word: string,
  translation: string,
  params: Partial<Pick<WordbookEntry, "notes" | "phonetic" | "collocations" | "memory_trick">>,
  overrides?: Partial<WordbookEntry>
): WordbookEntry {
  return {
    id: overrides?.id ?? nextWordId(state),
    word: word.trim(),
    translation: translation.trim(),
    notes: params.notes ?? null,
    phonetic: params.phonetic ?? "",
    collocations: params.collocations ?? "",
    memory_trick: params.memory_trick ?? "",
    familiarity: overrides?.familiarity ?? 0,
    created_at: overrides?.created_at ?? nowIso(),
  };
}

function getGistCache(state: BrowserState): Record<string, string> {
  const raw = state.globalConfig.github_sync_gist_cache;
  if (!raw?.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function setGistCache(state: BrowserState, cache: Record<string, string>) {
  if (Object.keys(cache).length === 0) {
    delete state.globalConfig.github_sync_gist_cache;
    return;
  }

  state.globalConfig.github_sync_gist_cache = JSON.stringify(cache);
}

function getGithubToken(state: BrowserState): string | null {
  const token = state.globalConfig.github_sync_token?.trim();
  return token ? token : null;
}

function getGistFileName(username: string): string {
  return `abandon-sync-${sanitizeUsername(username)}.json`;
}

function buildSyncPayload(user: BrowserUser): SyncPayload {
  return {
    schema_version: 2,
    username: user.username,
    exported_at: nowIso(),
    password_hash: user.password_hash ?? null,
    password_sha256: user.password_sha256,
    wordbook: user.wordbook.map((entry) => ({
      word: entry.word,
      translation: entry.translation,
      notes: entry.notes ?? null,
      phonetic: entry.phonetic ?? null,
      collocations: entry.collocations ?? null,
      memory_trick: entry.memory_trick ?? null,
      familiarity: entry.familiarity,
      created_at: entry.created_at,
    })),
    user_config: Object.entries(user.config).map(([key, value]) => ({ key, value })),
  };
}

function ensureLocalUserFromPayload(
  state: BrowserState,
  payload: SyncPayload,
  fallbackPasswordSha256?: string
): BrowserUser {
  const username = normalizeUsername(payload.username);
  const existing = state.users[username];
  const config = Object.fromEntries(payload.user_config.map((entry) => [entry.key, entry.value]));
  const incomingWordbook = payload.wordbook.map((entry) =>
    createWordbookEntry(
      state,
      entry.word,
      entry.translation,
      {
        notes: entry.notes ?? null,
        phonetic: entry.phonetic ?? "",
        collocations: entry.collocations ?? "",
        memory_trick: entry.memory_trick ?? "",
      },
      {
        id:
          existing?.wordbook.find(
            (saved) => normalizeWord(saved.word) === normalizeWord(entry.word)
          )?.id ?? nextWordId(state),
        familiarity: Number(entry.familiarity) || 0,
        created_at: entry.created_at || nowIso(),
      }
    )
  );

  const user: BrowserUser = {
    id: existing?.id ?? state.nextUserId++,
    username,
    password_sha256:
      payload.password_sha256?.trim() ||
      fallbackPasswordSha256 ||
      existing?.password_sha256 ||
      "",
    password_hash: payload.password_hash ?? existing?.password_hash ?? null,
    wordbook: sortEntries(incomingWordbook),
    config,
  };

  state.users[username] = user;
  return user;
}

function toUserSession(user: BrowserUser): UserSession {
  return {
    id: user.id,
    username: user.username,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function passwordDigest(username: string, password: string): Promise<string> {
  return sha256Hex(`abandon::${normalizeUsername(username)}::${password}`);
}

async function githubRequest(
  token: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

  try {
  return fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": GITHUB_USER_AGENT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(init?.headers ?? {}),
    },
  });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("GitHub 云同步请求超时，请检查网络或令牌。");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function githubFetchGist(
  token: string,
  gistId: string
): Promise<any | null> {
  const response = await githubRequest(token, `${GITHUB_API_BASE}/gists/${gistId}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitHub 云同步失败 (${response.status})`);
  }
  return response.json();
}

function getGistFileContent(gist: any, filename: string): string | null {
  const content = gist?.files?.[filename]?.content;
  return typeof content === "string" ? content : null;
}

async function findGithubGistId(
  state: BrowserState,
  token: string,
  username: string
): Promise<string | null> {
  const filename = getGistFileName(username);
  const cache = getGistCache(state);
  const cachedId = cache[sanitizeUsername(username)];

  if (cachedId) {
    const gist = await githubFetchGist(token, cachedId);
    if (gist && getGistFileContent(gist, filename)) {
      return cachedId;
    }
  }

  const response = await githubRequest(token, `${GITHUB_API_BASE}/gists?per_page=100`);
  if (!response.ok) {
    throw new Error(`读取 GitHub Gist 列表失败 (${response.status})`);
  }

  const gists = (await response.json()) as any[];
  const gistId =
    gists.find((gist) => Boolean(gist?.files?.[filename]))?.id ?? null;

  if (gistId) {
    cache[sanitizeUsername(username)] = gistId;
  } else {
    delete cache[sanitizeUsername(username)];
  }

  setGistCache(state, cache);
  return gistId;
}

async function loadRemotePayload(
  state: BrowserState,
  username: string
): Promise<SyncPayload | null> {
  const token = getGithubToken(state);
  if (!token) {
    return null;
  }

  const gistId = await findGithubGistId(state, token, username);
  if (!gistId) {
    return null;
  }

  const gist = await githubFetchGist(token, gistId);
  const content = getGistFileContent(gist, getGistFileName(username));
  if (!content) {
    return null;
  }

  return JSON.parse(content) as SyncPayload;
}

async function writeRemotePayload(
  state: BrowserState,
  user: BrowserUser
): Promise<boolean> {
  const token = getGithubToken(state);
  if (!token) {
    return false;
  }

  const filename = getGistFileName(user.username);
  const payload = buildSyncPayload(user);
  const content = JSON.stringify(payload, null, 2);
  const cache = getGistCache(state);
  let gistId = await findGithubGistId(state, token, user.username);

  if (!gistId) {
    const response = await githubRequest(token, `${GITHUB_API_BASE}/gists`, {
      method: "POST",
      body: JSON.stringify({
        description: `Abandon sync for ${user.username}`,
        public: false,
        files: {
          [filename]: {
            content,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`创建 GitHub Gist 失败 (${response.status})`);
    }

    const gist = await response.json();
    gistId = gist.id;
  } else {
    const response = await githubRequest(token, `${GITHUB_API_BASE}/gists/${gistId}`, {
      method: "PATCH",
      body: JSON.stringify({
        description: `Abandon sync for ${user.username}`,
        files: {
          [filename]: {
            content,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`更新 GitHub Gist 失败 (${response.status})`);
    }
  }

  if (!gistId) {
    throw new Error("GitHub Gist 同步失败：未返回有效的 Gist ID。");
  }

  cache[sanitizeUsername(user.username)] = gistId;
  setGistCache(state, cache);
  return true;
}

async function callModelApi(
  state: BrowserState,
  systemPrompt: string,
  userMessage: string,
  responseFormat?: "json_object"
): Promise<string> {
  const apiKey = getConfigValue(state, "api_key")?.trim();
  if (!apiKey) {
    throw new Error("API Key 未设置，请先到设置页保存。");
  }

  const baseUrl =
    getConfigValue(state, "api_base_url")?.trim() || DEFAULT_API_BASE_URL;
  const model = getConfigValue(state, "api_model")?.trim() || DEFAULT_API_MODEL;
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 1200,
  };

  if (responseFormat) {
    body.response_format = { type: responseFormat };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `浏览器无法访问当前 API：${String(
        error
      )}。如果你在 PWA 中使用，请确认这个接口允许浏览器跨域请求。`
    );
  }

  const json = await response.json().catch(() => null);
  const message =
    json?.error?.message ||
    json?.choices?.[0]?.message?.content ||
    response.statusText ||
    "未知错误";

  if (!response.ok || json?.error) {
    throw new Error(`API 错误: ${message}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("接口返回格式异常。");
  }

  return content.trim();
}

function normalizeWordInfo(info: WordInfo, fallbackWord: string): WordInfo {
  return {
    word: info.word?.trim() || fallbackWord.trim(),
    phonetic: info.phonetic?.trim() || "",
    translation: info.translation?.trim() || "",
    collocations: (info.collocations || [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8),
    memory_trick: info.memory_trick?.trim() || "",
    example_sentences: (info.example_sentences || [])
      .map((item) => ({
        english: item.english.trim(),
        chinese: item.chinese.trim(),
      }))
      .filter((item) => item.english && item.chinese)
      .slice(0, 3),
  };
}

let activeUtterance: SpeechSynthesisUtterance | null = null;

async function getSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!("speechSynthesis" in window)) {
    return [];
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    return voices;
  }

  return new Promise((resolve) => {
    const finish = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
    window.setTimeout(finish, 500);
  });
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  preferBritish: boolean
): SpeechSynthesisVoice | undefined {
  const preferences = preferBritish
    ? [/^en-GB/i, /^en-AU/i, /^en/i]
    : [/^en-US/i, /^en-GB/i, /^en/i];

  for (const pattern of preferences) {
    const match = voices.find((voice) => pattern.test(voice.lang));
    if (match) {
      return match;
    }
  }

  return voices.find((voice) => /^en/i.test(voice.lang));
}

async function speakWithBrowser(
  text: string,
  options: { expressive: boolean; preferBritish: boolean }
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  if (!("speechSynthesis" in window)) {
    throw new Error("当前浏览器不支持朗读。");
  }

  await stopSpeech();
  const voices = await getSpeechVoices();
  const voice = pickVoice(voices, options.preferBritish);

  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = options.preferBritish ? "en-GB" : "en-US";
    utterance.rate = options.expressive ? 0.88 : 0.98;
    utterance.pitch = options.expressive ? 1.06 : 1;
    utterance.volume = 1;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      resolve();
    };

    utterance.onerror = (event) => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      reject(new Error(event.error || "朗读失败"));
    };

    activeUtterance = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export async function translateText(text: string): Promise<TranslationResult> {
  const state = readState();
  const translation = await callModelApi(
    state,
    "You are a precise English-to-Chinese translator. Translate the user's text into natural Chinese. Return only the final Chinese translation without explanations.",
    text
  );

  return {
    original: text,
    translation,
    source_lang: "en",
  };
}

export async function getWordInfo(word: string): Promise<WordInfo> {
  const lookup = word.trim();
  if (!lookup) {
    throw new Error("请输入要查询的英文单词或短语。");
  }

  const state = readState();
  const result = await callModelApi(
    state,
    "You are an English-Chinese dictionary editor. Given one English word or a very short phrase, return strict JSON with exactly these fields: {\"word\":\"original word or phrase\",\"phonetic\":\"UK IPA such as /.../, or empty string if unavailable\",\"translation\":\"Chinese dictionary-style summary. Group common meanings by part of speech using multiple lines, for example: n. 1. meaning one 2. meaning two\\nv. 1. meaning one 2. meaning two. Keep it concise but complete, covering the most common meanings.\",\"collocations\":[\"common phrase - 中文意思\",\"common phrase - 中文意思\"],\"memory_trick\":\"Chinese mnemonic, word root, prefix/suffix, or usage tip. Leave empty if not useful.\",\"example_sentences\":[{\"english\":\"Short natural example sentence.\",\"chinese\":\"对应的自然中文。\"}]}. Return 2 to 3 common example sentences when useful. Use Chinese in translation and memory_trick. Do not use markdown.",
    lookup,
    "json_object"
  );

  let parsed: WordInfo;
  try {
    parsed = JSON.parse(result) as WordInfo;
  } catch {
    parsed = {
      word: lookup,
      phonetic: "",
      translation: result,
      collocations: [],
      memory_trick: "",
      example_sentences: [],
    };
  }

  parsed = normalizeWordInfo(parsed, lookup);
  if (!parsed.translation) {
    parsed.translation = await callModelApi(
      state,
      "You are a concise bilingual dictionary. Return only the complete Chinese meanings for the given English word or short phrase. Group by part of speech when needed.",
      lookup
    );
  }

  return parsed;
}

export async function analyzeSentence(text: string): Promise<SentenceAnalysis> {
  const state = readState();
  const result = await callModelApi(
    state,
    'Analyze the English sentence and return strict JSON with this shape: {"translation":"natural Chinese translation","grammar":{"sentence_structure":"brief Chinese description","tense":"Chinese tense description","clauses":[{"clause_type":"Chinese clause label","content":"original clause text"}]}}.',
    text,
    "json_object"
  );

  try {
    return JSON.parse(result) as SentenceAnalysis;
  } catch {
    return {
      translation: result,
      grammar: {
        sentence_structure: "未能解析句型",
        tense: "未识别",
        clauses: [],
      },
    };
  }
}

export async function addWord(params: AddWordParams): Promise<void> {
  const state = readState();
  const word = params.word.trim();
  if (!word) {
    return;
  }

  const entries = [...getWordbookScope(state)];
  const existingIndex = entries.findIndex(
    (entry) => normalizeWord(entry.word) === normalizeWord(word)
  );

  const nextEntry = createWordbookEntry(state, word, params.translation, {
    notes: params.notes ?? null,
    phonetic: params.phonetic ?? "",
    collocations: params.collocations ?? "",
    memory_trick: params.memory_trick ?? "",
  }, existingIndex >= 0 ? entries[existingIndex] : undefined);

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.unshift(nextEntry);
  }

  setWordbookScope(state, entries);
  const currentUser = getCurrentUserRecord(state);
  writeState(state);

  if (currentUser) {
    await writeRemotePayload(state, currentUser);
  }
}

export async function removeWord(word: string): Promise<void> {
  const state = readState();
  const nextEntries = getWordbookScope(state).filter(
    (entry) => normalizeWord(entry.word) !== normalizeWord(word)
  );
  setWordbookScope(state, nextEntries);
  const currentUser = getCurrentUserRecord(state);
  writeState(state);

  if (currentUser) {
    await writeRemotePayload(state, currentUser);
  }
}

export async function updateWordFamiliarity(
  word: string,
  familiarity: number
): Promise<void> {
  const state = readState();
  const nextEntries = getWordbookScope(state).map((entry) =>
    normalizeWord(entry.word) === normalizeWord(word)
      ? { ...entry, familiarity }
      : entry
  );
  setWordbookScope(state, nextEntries);
  const currentUser = getCurrentUserRecord(state);
  writeState(state);

  if (currentUser) {
    await writeRemotePayload(state, currentUser);
  }
}

export async function listWords(): Promise<WordbookEntry[]> {
  return cloneEntries(sortEntries(getWordbookScope(readState())));
}

export async function searchWords(query: string): Promise<WordbookEntry[]> {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return listWords();
  }

  return sortEntries(getWordbookScope(readState()))
    .filter((entry) => {
      return (
        entry.word.toLowerCase().includes(keyword) ||
        entry.translation.toLowerCase().includes(keyword)
      );
    })
    .map(cloneEntry);
}

export async function isWordSaved(word: string): Promise<boolean> {
  return getWordbookScope(readState()).some(
    (entry) => normalizeWord(entry.word) === normalizeWord(word)
  );
}

export async function getWordsByDate(): Promise<DateGroup[]> {
  const entries = sortEntries(getWordbookScope(readState()));
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const weekStart = new Date(startOfToday);
  weekStart.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const groups: Record<string, WordbookEntry[]> = {
    今天: [],
    昨天: [],
    本周: [],
    本月: [],
    更早: [],
  };

  for (const entry of entries) {
    const date = parseStoredDate(entry.created_at);
    if (date >= startOfToday) {
      groups["今天"].push(entry);
    } else if (date >= startOfYesterday) {
      groups["昨天"].push(entry);
    } else if (date >= weekStart) {
      groups["本周"].push(entry);
    } else if (date >= monthStart) {
      groups["本月"].push(entry);
    } else {
      groups["更早"].push(entry);
    }
  }

  return Object.entries(groups)
    .filter(([, words]) => words.length > 0)
    .map(([label, words]) => ({
      label,
      count: words.length,
      words: words.map(cloneEntry),
    }));
}

export async function getTodayWordCount(): Promise<number> {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return getWordbookScope(readState()).filter(
    (entry) => parseStoredDate(entry.created_at) >= startOfToday
  ).length;
}

export async function speakText(
  text: string,
  expressive = false
): Promise<void> {
  await speakWithBrowser(text, {
    expressive,
    preferBritish: false,
  });
}

export async function stopSpeech(): Promise<void> {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  activeUtterance = null;
}

export async function playBritishPronunciation(word: string): Promise<void> {
  await speakWithBrowser(word, {
    expressive: false,
    preferBritish: true,
  });
}

export async function getSelectedText(): Promise<string> {
  const selected = window.getSelection?.()?.toString().trim();
  if (selected) {
    return selected;
  }

  if (navigator.clipboard?.readText) {
    const clipboard = await navigator.clipboard.readText();
    return clipboard.trim();
  }

  return "";
}

export async function getConfig(key: string): Promise<string | null> {
  return getConfigValue(readState(), key);
}

export async function setConfig(key: string, value: string): Promise<void> {
  const state = readState();
  setConfigValue(state, key, value);
  writeState(state);
}

export async function getRuntimePaths(): Promise<RuntimePaths> {
  const state = readState();
  return {
    data_dir: "browser://localStorage",
    database_path: "browser://localStorage",
    sync_dir: state.globalConfig.sync_dir?.trim() || null,
    sync_file_path: state.currentUsername
      ? `browser://sync/${sanitizeUsername(state.currentUsername)}`
      : null,
  };
}

export async function registerUser(
  username: string,
  password: string
): Promise<UserSession> {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) {
    throw new Error("用户名至少需要 3 个字符。");
  }
  if (password.length < 6) {
    throw new Error("密码至少需要 6 个字符。");
  }

  const state = readState();
  if (state.users[normalized]) {
    throw new Error("该用户名已存在，请直接登录。");
  }

  const remotePayload = await loadRemotePayload(state, normalized);
  if (remotePayload) {
    throw new Error("该用户名已存在，请直接登录。");
  }

  const user: BrowserUser = {
    id: state.nextUserId++,
    username: normalized,
    password_sha256: await passwordDigest(normalized, password),
    password_hash: null,
    wordbook: [],
    config: {},
  };

  state.users[normalized] = user;
  state.currentUsername = normalized;
  writeState(state);
  return toUserSession(user);
}

export async function loginUser(
  username: string,
  password: string
): Promise<UserSession> {
  const normalized = normalizeUsername(username);
  if (!normalized || !password.trim()) {
    throw new Error("请输入用户名和密码。");
  }

  const state = readState();
  const existing = state.users[normalized];
  const digest = await passwordDigest(normalized, password);

  if (existing) {
    if (existing.password_sha256 !== digest) {
      throw new Error("密码不正确。");
    }

    state.currentUsername = normalized;
    writeState(state);
    return toUserSession(state.users[normalized]);
  }

  const remotePayload = await loadRemotePayload(state, normalized);
  if (!remotePayload) {
    throw new Error("账号不存在。");
  }
  if (!remotePayload.password_sha256) {
    throw new Error("该账号的同步数据尚未升级，请先在桌面端重新登录一次再试。");
  }
  if (remotePayload.password_sha256 !== digest) {
    throw new Error("密码不正确。");
  }

  const user = ensureLocalUserFromPayload(state, remotePayload, digest);
  state.currentUsername = normalized;
  writeState(state);
  return toUserSession(user);
}

export async function logoutUser(): Promise<void> {
  const state = readState();
  state.currentUsername = null;
  writeState(state);
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const user = getCurrentUserRecord(readState());
  return user ? toUserSession(user) : null;
}

export async function syncNow(): Promise<string> {
  const state = readState();
  const user = getCurrentUserRecord(state);
  if (!user) {
    throw new Error("请先登录账号，再执行同步。");
  }

  const remotePayload = await loadRemotePayload(state, user.username);
  const pulled = Boolean(remotePayload);
  const activeUser = remotePayload
    ? ensureLocalUserFromPayload(state, remotePayload, user.password_sha256)
    : user;
  const pushed = await writeRemotePayload(state, activeUser);
  writeState(state);

  if (pulled && pushed) {
    return "已从 GitHub 云同步拉取并刷新当前账号数据。";
  }
  if (pulled) {
    return "已从 GitHub 云同步拉取当前账号数据。";
  }
  if (pushed) {
    return "已将当前账号数据写入 GitHub 云同步。";
  }
  return "未配置 GitHub 云同步令牌。";
}
