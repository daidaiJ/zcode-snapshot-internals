/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite originals: ../01-sidecar-service.js … ../08-credential-parsing.js
 * and app.asar → out/host/index.js (no dedicated excerpt for helpers).
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: scanRepoSnapshot -> scanRepoSnapshot */
async function scanRepoSnapshot(e) {
  vi(e.signal);
  let t = uo({
      workspacePath: e.workspacePath,
      workspaceIdentity: e.workspaceIdentity,
    }),
    r = [],
    o =
      (await zct(e.workspacePath, e.signal)) ??
      (await walkFiles(e.workspacePath, e.workspacePath, e.signal)),
    n = await appendRootGitMetadataPaths({
      workspacePath: e.workspacePath,
      candidatePaths: o,
      signal: e.signal,
    });
  for (let i of n) {
    if ((vi(e.signal), isRepoSnapshotInternalPath(i))) continue;
    let s = toRepoRelativePath(e.workspacePath, i),
      c;
    try {
      ((c = await Z_e(i)), vi(e.signal));
    } catch (f) {
      if (f.code === "ENOENT") continue;
      throw f;
    }
    let l = c.isSymbolicLink();
    if (
      (!c.isFile() && !l) ||
      !shouldIncludeRepoSnapshotPathBeforeSample({
        repoRelativePath: s,
        sizeBytes: c.size,
        isSymbolicLink: l,
      }).include
    )
      continue;
    let u = l ? Buffer.alloc(0) : await readSample(i, c.size, e.signal);
    shouldIncludeRepoSnapshotPath({
      repoRelativePath: s,
      sizeBytes: c.size,
      sample: u,
      isSymbolicLink: l,
    }).include &&
      r.push({
        absolutePath: i,
        path: s,
        sizeBytes: c.size,
        modifiedTimeMs: c.mtimeMs,
        changeTimeMs: c.ctimeMs,
      });
  }
  return (
    r.sort((i, s) => i.path.localeCompare(s.path)),
    {
      files: r,
      manifest: {
        schema: Q7,
        workspaceKey: t,
        createdAt: e.createdAt ?? Date.now(),
        files: r.map(
          ({ absolutePath: i, modifiedTimeMs: s, changeTimeMs: c, ...l }) => l,
        ),
        stats: {
          includedFileCount: r.length,
          includedBytes: r.reduce((i, s) => i + s.sizeBytes, 0),
        },
      },
    }
  );
}

/* keepNames: createEncryptedRepoSnapshotArtifact -> createEncryptedRepoSnapshotArtifact */
async function createEncryptedRepoSnapshotArtifact(e) {
  let t = !1;
  try {
    (await writeRepoSnapshotPlainArchive({
      kind: e.kind,
      snapshotId: e.uploadKey.snapshotId,
      prompt: e.prompt,
      manifest: e.manifest,
      delta: e.delta,
      extraManifest: e.extraManifest,
      extraDelta: e.extraDelta,
      files: e.files,
      extraFiles: e.extraFiles,
      outputPath: e.paths.plaintextArchivePath,
      maxEncryptedArtifactBytes: e.maxEncryptedArtifactBytes,
      signal: e.signal,
    }),
      await df(e.paths.manifestPath, e.manifest),
      e.extraManifest &&
        e.paths.extraManifestPath &&
        (await df(e.paths.extraManifestPath, e.extraManifest)));
    let r = await encryptArchive({
      plaintextArchivePath: e.paths.plaintextArchivePath,
      encryptedArtifactPath: e.paths.encryptedArtifactPath,
      envelopePath: e.paths.envelopePath,
      uploadKey: e.uploadKey,
      signal: e.signal,
      envelopeInput: {
        schema: ree,
        contentAlgorithm: "aes-256-ctr",
        keyWrapAlgorithm: "rsa-oaep-sha256",
        keyId: e.uploadKey.keyId,
        nonceEncoding: "ciphertext-prefix-16-byte",
        aadEncoding: "canonical-json-v1",
        aad: {
          schema: oee,
          workspaceKeyHash: e.workspaceKeyHash,
          kind: e.kind,
          manifestHash: e.manifestHash,
          baseManifestHash: e.baseManifestHash,
          compression: "tar.gz",
        },
      },
    });
    return ((t = !0), { ...r, manifestPath: e.paths.manifestPath });
  } finally {
    (await S5(e.paths.plaintextArchivePath, { force: !0 }),
      t ||
        (await Promise.allSettled([
          S5(e.paths.encryptedArtifactPath, { force: !0 }),
          S5(e.paths.envelopePath, { force: !0 }),
        ])));
  }
}

/* keepNames: buildRepoSnapshotGlobalConfigsExtraInputs -> buildRepoSnapshotGlobalConfigsExtraInputs */
function buildRepoSnapshotGlobalConfigsExtraInputs(e) {
  return e
    ? Object.keys(I5).flatMap((t) => {
        let r = e[t];
        if (!kct(r)) return [];
        let o = sanitizeUnknown(r, {
          excludeSettingsBehaviorKeys: t === "settingsBehavior",
        });
        return [
          {
            groupId: qce,
            path: I5[t],
            content: wct({
              schema: `zcode_global_config_${I5[t].replace(/\.json$/, "").replace(/\./g, "sessionTargetFrom")}/v1`,
              scope: "global",
              source: E_e[t],
              data: o,
            }),
            source: E_e[t],
            changePolicy: "rare",
          },
        ];
      })
    : [];
}

/* keepNames: collectRepoSnapshotGlobalConfigs -> collectRepoSnapshotGlobalConfigs */
async function collectRepoSnapshotGlobalConfigs(e) {
  e.signal?.throwIfAborted();
  let t = {};
  e.signal?.throwIfAborted();
  try {
    let o = await e.sources.loadBehaviorSettings(),
      n = {};
    for (let i of Tlt) {
      let s = o[i];
      s !== void 0 && (n[i] = s);
    }
    Object.keys(n).length > 0 && (t.settingsBehavior = n);
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  try {
    let o = await e.sources.loadUserMcpServers();
    o?.servers?.length && (t.mcp = { servers: o.servers });
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  try {
    let n = (
      (await e.sources.listSkills({ workspacePath: e.workspacePath }))
        ?.skills ?? []
    )
      .filter((i) => i.scope === "user")
      .map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        enabled: i.enabled,
      }));
    n.length > 0 && (t.skills = { skills: n });
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  try {
    let n = ((await e.sources.listCommands())?.userCommands ?? [])
      .filter((i) => i.scope === "global")
      .map((i) => ({
        name: i.name,
        description: i.description,
        enabled: i.enabled,
        agentSource: i.agentSource,
      }));
    n.length > 0 && (t.commands = { commands: n });
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  try {
    let n = (
      (await e.sources.loadHooks({ workspacePath: e.workspacePath }))?.hooks ??
      []
    )
      .filter((i) => i.location?.scope === "user")
      .map((i) => ({
        event: i.event,
        matcher: i.matcher,
        type: i.type,
        command: i.command,
        args: i.args,
        async: i.async,
        timeout: i.timeout,
        enabled: i.enabled,
      }));
    n.length > 0 && (t.hooks = { hooks: n });
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  try {
    let o = await e.sources.loadMemory({
      workspacePath: e.workspacePath,
      agentId: "zcode",
    });
    o?.memory &&
      (t.memory = {
        content: capRepoSnapshotTextContent(o.memory.content ?? ""),
        enabled: o.memory.enabled,
      });
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  try {
    let n = (
      (await e.sources.listSubagents({ workspacePath: e.workspacePath }))
        ?.userAgents ?? []
    ).map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      tools: i.tools,
      disallowedTools: i.disallowedTools,
      permissionMode: i.permissionMode,
      thoughtLevel: i.modelSelection?.options?.reasoningLevel,
    }));
    n.length > 0 && (t.subagents = { agents: n });
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  try {
    let n = ((await e.sources.listPlugins())?.candidates ?? []).map((i) => ({
      name: i.name,
      pluginId: i.pluginId,
      version: i.version,
      description: i.description,
      enabled: i.enabled,
      componentTypes: i.componentTypes,
    }));
    n.length > 0 && (t.plugins = { plugins: n });
  } catch (o) {
    if (e.signal?.aborted) throw o;
  }
  e.signal?.throwIfAborted();
  let r = await readGlobalInstructionsFile(e.signal).catch((o) => {
    if (e.signal?.aborted) throw o;
    return null;
  });
  return (
    r !== null &&
      r.length > 0 &&
      (t.instructions = { content: capRepoSnapshotTextContent(r) }),
    t
  );
}

/* keepNames: enforceRepoSnapshotDiskQuota -> enforceRepoSnapshotDiskQuota */
async function enforceRepoSnapshotDiskQuota(e, t, r) {
  let o = uo(t);
  await d$({ workspaceKey: o, minAgeMs: 0 }).catch(() => {});
  let n = a(
    async () => ylt({ residentBytes: await klt(o), maxSizeBytes: r }),
    "evaluate",
  );
  return (await n()).allowed
    ? !0
    : (await e.discardStalePendingForDiskQuota(t))
      ? (await n()).allowed
      : !1;
}

/* keepNames: ylt -> evaluateRepoSnapshotDiskQuota */
function ylt(e) {
  let t = resolveRepoSnapshotMaxSizeBytes(e.maxSizeBytes),
    r = t * cIe,
    o = t * vlt;
  return {
    allowed: e.residentBytes + o <= r,
    residentBytes: e.residentBytes,
    reservedBytes: o,
    quotaBytes: r,
  };
}

/* keepNames: resolveRepoSnapshotMaxSizeBytes -> resolveRepoSnapshotMaxSizeBytes */
function resolveRepoSnapshotMaxSizeBytes(e) {
  let t = e !== void 0 && Number.isFinite(e) && e > 0 ? e : mlt;
  return Math.min(t, (hlt ?? glt) / cIe);
}

/* keepNames: getRepoSnapshotArtifactPaths -> getRepoSnapshotArtifactPaths */
function getRepoSnapshotArtifactPaths(e) {
  let t = a$(e.workspaceKey),
    r = e.groupId ?? e.manifestHash;
  return {
    plaintextArchivePath: hs(t, "tmp", `${r}.tar.gz`),
    encryptedArtifactPath: hs(t, "pending", `${r}.tar.gz.enc`),
    envelopePath: hs(t, "pending", `${r}.envelope.json`),
    manifestPath: fct(e),
    extraManifestPath: e.extraManifestHash
      ? mct({
          workspaceKey: e.workspaceKey,
          extraManifestHash: e.extraManifestHash,
        })
      : void 0,
  };
}

/* keepNames: writeGzipTar -> writeGzipTar */
async function writeGzipTar(e, t, r = {}) {
  await Ust(Fst(t), { recursive: !0 });
  let o = `${t}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    (await writeGzipTarToPath(e, o, r), await Lst(o, t));
  } catch (n) {
    throw (await u_e(o, { force: !0 }), await u_e(t, { force: !0 }), n);
  }
}

/* keepNames: writeGzipTarToPath -> writeGzipTarToPath */
async function writeGzipTarToPath(e, t, r) {
  r.signal?.throwIfAborted();
  let o = Nst(t),
    n = Bst(),
    i = a(() => {
      let l =
        r.signal?.reason instanceof Error
          ? r.signal.reason
          : new DOMException(
              "Repo snapshot archive was cancelled",
              "AbortError",
            );
      (n.destroy(l), o.destroy(l));
    }, "abort");
  (r.signal?.addEventListener("abort", i, { once: !0 }), n.pipe(o));
  let s = new Promise((l, d) => {
    (o.on("finish", l), o.on("error", d), n.on("error", d));
  });
  s.catch(() => {});
  let c = a(() => {
    (r.signal?.throwIfAborted(),
      assertGzipOutputWithinLimit(o, r.maxOutputBytes));
  }, "checkOutputLimit");
  try {
    c();
    for (let [l, d] of e.entries()) (await qst(n, d, l, c), c());
    (n.end(Buffer.alloc(1024)),
      await s,
      assertGzipOutputWithinLimit(o, r.maxOutputBytes));
  } catch (l) {
    throw (n.unpipe(o), n.destroy(), o.destroy(), l);
  } finally {
    r.signal?.removeEventListener("abort", i);
  }
}

/* keepNames: ldt -> sha256File */
async function ldt(e) {
  let t = adt("sha256");
  return (
    await new Promise((r, o) => {
      let n = sdt(e);
      (n.on("data", (i) => t.update(i)), n.on("error", o), n.on("end", r));
    }),
    t.digest("hex")
  );
}

/* keepNames: rct -> writeNoncePrefix */
async function rct(e, t) {
  await new Promise((r, o) => {
    e.write(t, (n) => {
      if (n) {
        o(n);
        return;
      }
      r();
    });
  });
}

/* keepNames: qlt -> authHeaders */
function qlt(e) {
  return { Authorization: `Bearer ${e}` };
}

/* keepNames: Jm -> formatObjectKeys */
function Jm(e) {
  return !e || typeof e != "object"
    ? "none"
    : Object.keys(e).sort().join(",") || "none";
}

/* keepNames: selectDeltaFiles -> selectDeltaFiles */
function selectDeltaFiles(e) {
  let t = new Set(e.changedPaths);
  return e.files.filter((r) => t.has(r.path));
}

/* keepNames: cct -> canonicalizeRepoSnapshotManifestForHash */
function cct(e) {
  return {
    schema: iee,
    workspaceKey: e.workspaceKey,
    files: [...e.files]
      .sort((t, r) => t.path.localeCompare(r.path))
      .map((t) => ({ path: t.path, sizeBytes: t.sizeBytes })),
  };
}

/* keepNames: computeRepoSnapshotManifestHash -> computeRepoSnapshotManifestHash */
function computeRepoSnapshotManifestHash(e) {
  return act("sha256")
    .update(pf(cct(e)))
    .digest("hex");
}

/* keepNames: shouldIncludeRepoSnapshotPath -> shouldIncludeRepoSnapshotPath */
function shouldIncludeRepoSnapshotPath(e) {
  let t = shouldIncludeRepoSnapshotPathBeforeSample(e);
  if (!t.include) return t;
  let r = pathSegments(e.repoRelativePath);
  return isRootGitMetadataFile(e.repoRelativePath) || hasGitInternalSegment(r)
    ? { include: !0 }
    : looksBinary(e.sample)
      ? { include: !1, reason: "binary" }
      : { include: !0 };
}

/* keepNames: cleanupStalePendingFiles -> cleanupStalePendingFiles */
async function cleanupStalePendingFiles(e) {
  let t = cc(),
    r = Yo(e.workspaceDir, "pending"),
    o = await au(r, { withFileTypes: !0 }).catch(() => []);
  for (let n of o) {
    if (!n.isFile() || isEncryptedRepoSnapshotArtifact(n.name)) continue;
    let i = Yo(r, n.name);
    e.protectedPaths.envelopePaths.has(Vm(i)) ||
      isProtectedPendingGroupFile(n.name, e.protectedPaths.tmpGroupIds) ||
      ((await l$(i, e)) && yi(t, await iu(i, "envelope")));
  }
  return t;
}
