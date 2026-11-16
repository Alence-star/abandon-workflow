import fs from "node:fs/promises";
import path from "node:path";

const FEED_URL = "https://feeds.feedburner.com/TEDTalks_audio";
const FEED_FETCH_URL =
  "https://feeds.acast.com/public/shows/67587e77c705e441797aff96";
const OUTPUT_PATH = path.join(process.cwd(), "public", "data", "weekly-speeches.json");
const MAX_ITEMS = 6;

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }
    if (normalized.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }
    return named[normalized] ?? match;
  });
}

function cleanXmlText(value = "") {
  return decodeEntities(
    value
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "")
      .replace(/<hr\b[^>]*>[\s\S]*$/i, "")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function field(item, name) {
  const escaped = name.replace(":", "\\:");
  const match = item.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return cleanXmlText(match?.[1] ?? "");
}

function attribute(item, name, attributeName) {
  const escaped = name.replace(":", "\\:");
  const match = item.match(new RegExp(`<${escaped}\\b[^>]*\\b${attributeName}="([^"]+)"[^>]*\\/?\\s*>`, "i"));
  return cleanXmlText(match?.[1] ?? "");
}

function splitTitle(rawTitle) {
  const parts = rawTitle.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { title: rawTitle, speaker: "TED" };
  }
  return {
    title: parts.slice(0, -1).join(" | "),
    speaker: parts.at(-1),
  };
}

function makeId(value, index) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return normalized || `ted-weekly-${index + 1}`;
}

async function main() {
  let xml = "";
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(FEED_FETCH_URL, {
        headers: {
          Range: "bytes=0-1048575",
          "User-Agent": "Abandon weekly speech updater/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`TED RSS returned HTTP ${response.status}`);
      }
      xml = await response.text();
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  if (!xml) throw lastError ?? new Error("TED RSS returned no data");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => match[1])
    .map((item, index) => {
      const rawTitle = field(item, "title");
      const { title, speaker } = splitTitle(rawTitle);
      const text = field(item, "description") || field(item, "itunes:summary");
      const sourceUrl = field(item, "link").replace(/^http:\/\//i, "https://");
      const audioUrl = attribute(item, "enclosure", "url");
      const publishedAt = field(item, "pubDate");
      const guid = field(item, "guid");

      return {
        id: makeId(guid || rawTitle, index),
        title,
        speaker,
        text,
        sourceUrl,
        audioUrl,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        source: "TED Talks Daily",
      };
    })
    .filter(
      (item) =>
        item.title &&
        item.text &&
        item.sourceUrl &&
        /^https?:\/\/(?:go|www)\.ted\.com\//i.test(item.sourceUrl)
    )
    .slice(0, MAX_ITEMS);

  if (items.length < 3) {
    throw new Error(`Only ${items.length} valid TED RSS items were found`);
  }

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: FEED_URL,
    speeches: items,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Updated ${OUTPUT_PATH} with ${items.length} TED talks.`);
}

await main();
