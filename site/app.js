const repo = {
  owner: "Alence-star",
  name: "abandon-workflow",
};

const nodes = {
  internalMacos: document.querySelector("#internal-macos"),
  stableRelease: document.querySelector("#stable-release"),
  iosRelease: document.querySelector("#ios-release"),
};

const formatDate = (value) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) {
    return "大小未知";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const assetLabelForMac = (name) => {
  const lower = name.toLowerCase();

  if (lower.includes("aarch64") || lower.includes("arm64")) {
    return "Apple Silicon";
  }

  if (lower.includes("x86_64") || lower.includes("x64")) {
    return "Intel Mac";
  }

  return "macOS";
};

const pickAssets = (assets, matcher) => assets.filter((asset) => matcher(asset.name.toLowerCase()));

const buildDownloadButton = (asset) =>
  `<a class="button button-primary" href="${asset.browser_download_url}" target="_blank" rel="noreferrer">下载 ${escapeHtml(
    asset.name
  )}</a>`;

const buildInlineLinks = (assets) =>
  assets
    .map(
      (asset) =>
        `<a class="mini-link" href="${asset.browser_download_url}" target="_blank" rel="noreferrer">${escapeHtml(
          asset.name
        )}</a>`
    )
    .join("");

const findLatestInternalMacRelease = (releases) =>
  releases.find(
    (release) =>
      release.prerelease &&
      !release.draft &&
      release.tag_name.startsWith("internal-macos-") &&
      release.assets.some((asset) => asset.name.toLowerCase().endsWith(".dmg"))
  );

const findLatestStableRelease = (releases) =>
  releases.find(
    (release) =>
      !release.prerelease &&
      !release.draft &&
      release.assets.some((asset) => asset.name.toLowerCase().endsWith(".dmg"))
  );

const findLatestIosRelease = (releases) =>
  releases.find(
    (release) =>
      !release.draft &&
      release.assets.some((asset) => asset.name.toLowerCase().endsWith(".ipa"))
  );

const renderEmpty = (node, message) => {
  node.classList.remove("loading");
  node.innerHTML = `<div class="empty-state">${message}</div>`;
};

const renderMacRelease = (node, release, { internal }) => {
  if (!release) {
    renderEmpty(
      node,
      internal
        ? "还没有可下载的 macOS 内测 Release。先在 GitHub Actions 里运行一次 <strong>build-macos-internal</strong>。"
        : "目前还没有正式发布版。后续打正式 tag 后，这里会自动显示。"
    );
    return;
  }

  const dmgAssets = pickAssets(release.assets, (name) => name.endsWith(".dmg"));
  const archiveAssets = pickAssets(release.assets, (name) => name.endsWith(".app.tar.gz"));
  const signatureAssets = pickAssets(release.assets, (name) => name.endsWith(".sig"));

  const groupedCards = dmgAssets
    .map((dmgAsset) => {
      const label = assetLabelForMac(dmgAsset.name);
      const lowerName = dmgAsset.name.toLowerCase();
      const matchingArchive = archiveAssets.find((asset) =>
        label === "Apple Silicon"
          ? /(aarch64|arm64)/i.test(asset.name)
          : label === "Intel Mac"
            ? /(x86_64|x64)/i.test(asset.name)
            : true
      );
      const matchingSignatures = signatureAssets.filter((asset) =>
        label === "Apple Silicon"
          ? /(aarch64|arm64)/i.test(asset.name)
          : label === "Intel Mac"
            ? /(x86_64|x64)/i.test(asset.name)
            : asset.name.toLowerCase().includes(lowerName.replace(".dmg", ""))
      );

      return `
        <article class="asset-card">
          <div>
            <strong>${label}</strong>
            <p class="asset-meta">${escapeHtml(dmgAsset.name)} · ${formatSize(dmgAsset.size)}</p>
          </div>
          ${buildDownloadButton(dmgAsset)}
          <div class="asset-links">
            ${matchingArchive ? buildInlineLinks([matchingArchive]) : ""}
            ${matchingSignatures.length > 0 ? buildInlineLinks(matchingSignatures) : ""}
          </div>
        </article>
      `;
    })
    .join("");

  node.classList.remove("loading");
  node.innerHTML = `
    <article class="release-card">
      <div class="release-topline">
        <span class="pill ${internal ? "pill-internal" : "pill-stable"}">
          ${internal ? "Internal" : "Stable"}
        </span>
        <span class="pill">${escapeHtml(release.tag_name)}</span>
      </div>
      <h3>${escapeHtml(release.name || release.tag_name)}</h3>
      <p class="release-meta">
        发布时间：${formatDate(release.published_at || release.created_at)}<br />
        <a class="mini-link" href="${release.html_url}" target="_blank" rel="noreferrer">打开这个 Release</a>
      </p>
      <div class="asset-grid">
        ${groupedCards || '<div class="empty-state">这个 Release 里暂时没有可识别的 DMG。</div>'}
      </div>
    </article>
  `;
};

const renderIosRelease = (node, release) => {
  if (!release) {
    renderEmpty(node, "还没有上传到 Releases 的 iOS 安装包。后续有 `.ipa` 进入 Release 后，这里会自动显示。");
    return;
  }

  const ipaAssets = pickAssets(release.assets, (name) => name.endsWith(".ipa"));

  if (ipaAssets.length === 0) {
    renderEmpty(node, "找到 iOS 相关 Release，但没有 `.ipa` 资产。");
    return;
  }

  node.classList.remove("loading");
  node.innerHTML = `
    <article class="release-card">
      <div class="release-topline">
        <span class="pill pill-internal">${release.prerelease ? "Ad-Hoc" : "Release"}</span>
        <span class="pill">${escapeHtml(release.tag_name)}</span>
      </div>
      <h3>${escapeHtml(release.name || release.tag_name)}</h3>
      <p class="release-meta">
        发布时间：${formatDate(release.published_at || release.created_at)}<br />
        <a class="mini-link" href="${release.html_url}" target="_blank" rel="noreferrer">打开这个 Release</a>
      </p>
      <div class="asset-grid">
        ${ipaAssets
          .map(
            (asset) => `
              <article class="asset-card">
                <div>
                  <strong>iOS Ad-Hoc IPA</strong>
                  <p class="asset-meta">${escapeHtml(asset.name)} · ${formatSize(asset.size)}</p>
                </div>
                ${buildDownloadButton(asset)}
              </article>
            `
          )
          .join("")}
      </div>
    </article>
  `;
};

const renderFailure = (message) => {
  renderEmpty(nodes.internalMacos, message);
  renderEmpty(nodes.stableRelease, message);
  renderEmpty(nodes.iosRelease, message);
};

const loadReleases = async () => {
  try {
    const payload = window.ABANDON_RELEASE_SNAPSHOT;
    if (!payload || typeof payload !== "object") {
      throw new Error("Missing release snapshot");
    }

    const releases = Array.isArray(payload.releases) ? payload.releases : [];

    renderMacRelease(nodes.internalMacos, findLatestInternalMacRelease(releases), { internal: true });
    renderMacRelease(nodes.stableRelease, findLatestStableRelease(releases), { internal: false });
    renderIosRelease(nodes.iosRelease, findLatestIosRelease(releases));
  } catch (error) {
    console.error(error);
    renderFailure("下载页暂时没拿到 Release 快照，请稍后刷新，或直接打开 Releases 页面。");
  }
};

loadReleases();
