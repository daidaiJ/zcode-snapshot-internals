/**
 * 上传凭证响应解析 — data.oss / encryption / snapshot / callback
 *
 * 阶段 4 的配套：服务端凭证响应的校验与规整。从必填字段清单能直接读出
 * 服务端下发的凭证面：OSS 表单签名族（policy / x-oss-signature / 安全
 * token …）、信封加密公钥（RSA PEM + key_version + 算法）、快照标识
 * （snapshot_id / base_snapshot_id）与 OSS 回调配置。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../08-credential-parsing.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   describeUploadCredentialShape      响应结构指纹（调试/报错用）
 *   resolveUploadCredentialData        code==0 + 必填字段校验 → 凭证数据
 *   formatObjectKeys                   对象键名排序列表（指纹底材）
 *   normalizeUploadCredentialMaxSize   max_size 容错规整（非法则忽略并告警）
 *   normalizePublicKeySpkiPem          服务端公钥 PEM 规整
 *
 * ── 调用链位置 ──────────────────────────────────────────────
 *   RepoSnapshotUploadClient.getUploadCredential() [04]
 *     → readApiJson() → resolveUploadCredentialData() → assertSupportedEncryption()
 *
 * Node 内建别名已还原：crypto.createPublicKey。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: describeUploadCredentialShape -> describeUploadCredentialShape */
/** 响应结构指纹：code/msg + 各层键名列表，报错时附上便于对账。 */
function describeUploadCredentialShape(credential) {
  return [
    `code=${credential.code}`,
    credential.msg ? `msg=${credential.msg}` : "",
    `responseKeys=${formatObjectKeys(credential)}`,
    `dataKeys=${formatObjectKeys(credential.data)}`,
    `callbackKeys=${formatObjectKeys(credential.data?.callback)}`,
    `ossKeys=${formatObjectKeys(credential.data?.oss)}`,
    `encryptionKeys=${formatObjectKeys(credential.data?.encryption)}`,
    `snapshotKeys=${formatObjectKeys(credential.data?.snapshot)}`,
  ]
    .filter(Boolean)
    .join("; ");
}

/* keepNames: resolveUploadCredentialData -> resolveUploadCredentialData */
/**
 * 凭证响应校验：code!=0 抛错；无 data 返回 null；必填字段缺失抛错并附
 * 指纹。必填清单即服务端凭证面：oss.host/path/policy/x-oss-signature(+
 * version/credential/date)/x-oss-security-token、encryption.public_key/
 * key_version/algorithm、snapshot.snapshot_id、callback.url/body/content_type。
 */
function resolveUploadCredentialData(credential) {
  if (credential.code !== 0)
    throw new Error(
      credential.msg ||
        `repo snapshot upload credential failed: code=${credential.code}`,
    );
  if (!credential.data) return null;
  let missing = [],
    data = credential.data;
  (data.callback?.url || missing.push("callback.url"),
    data.callback?.body || missing.push("callback.body"),
    data.callback?.content_type || missing.push("callback.content_type"),
    data.oss?.host || missing.push("oss.host"),
    data.oss?.path || missing.push("oss.path"),
    data.oss?.policy || missing.push("oss.policy"),
    data.oss?.x_oss_signature || missing.push("oss.x_oss_signature"),
    data.oss?.x_oss_signature_version ||
      missing.push("oss.x_oss_signature_version"),
    data.oss?.x_oss_credential || missing.push("oss.x_oss_credential"),
    data.oss?.x_oss_security_token || missing.push("oss.x_oss_security_token"),
    data.oss?.x_oss_date || missing.push("oss.x_oss_date"),
    data.encryption?.public_key || missing.push("encryption.public_key"),
    data.encryption?.key_version === undefined &&
      missing.push("encryption.key_version"),
    data.encryption?.algorithm || missing.push("encryption.algorithm"),
    data.snapshot?.snapshot_id || missing.push("snapshot.snapshot_id"));
  let maxSizeBytes = normalizeUploadCredentialMaxSize(data.max_size);
  if (
    (data.max_size !== undefined &&
      maxSizeBytes === undefined &&
      uploadLogger.warn(
        undefined,
        "upload-credential 返回了非法 max_size，已忽略该字段",
        {
          max_size: data.max_size,
          shape: describeUploadCredentialShape(credential),
        },
      ),
    missing.length > 0)
  )
    throw new Error(
      `repo snapshot upload credential missing fields: ${missing.join(", ")}; ${describeUploadCredentialShape(credential)}`,
    );
  let { max_size: maxSize, ...rest } = data;
  return {
    ...rest,
    ...(maxSizeBytes !== undefined ? { max_size: maxSizeBytes } : {}),
  };
}

/* keepNames: Jm -> formatObjectKeys */
/** 对象键名排序逗号串；非对象返回 "none"。指纹底材。 */
function formatObjectKeys(value) {
  return !value || typeof value != "object"
    ? "none"
    : Object.keys(value).sort().join(",") || "none";
}

/* keepNames: normalizeUploadCredentialMaxSize -> normalizeUploadCredentialMaxSize */
/** max_size 容错：字符串数字也收，负数/非有限数一律视为未提供。 */
function normalizeUploadCredentialMaxSize(maxSize) {
  if (maxSize == null) return;
  let parsed = typeof maxSize == "string" ? Number(maxSize) : maxSize;
  if (!(typeof parsed != "number" || !Number.isFinite(parsed) || parsed < 0))
    return parsed;
}

/* keepNames: normalizePublicKeySpkiPem -> normalizePublicKeySpkiPem */
/**
 * 服务端公钥 PEM 规整：统一换行、补尾换行；createPublicKey 校验失败时
 * 把 SPKI 头换成 RSA 头再试一次，仍失败则原样返回（后续加密阶段才会暴露）。
 */
function normalizePublicKeySpkiPem(pem) {
  let trimmed = pem
    .trim()
    .replaceAll("\\r\\n", "\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\r\n", "\n");
  if (!trimmed.includes("-----BEGIN PUBLIC KEY-----")) return trimmed;
  let normalized = trimmed.endsWith(`
`)
    ? trimmed
    : `${trimmed}
`;
  try {
    return (createPublicKey(normalized), normalized);
  } catch {
    let rsaVariant = normalized
      .replace("-----BEGIN PUBLIC KEY-----", "-----BEGIN RSA PUBLIC KEY-----")
      .replace("-----END PUBLIC KEY-----", "-----END RSA PUBLIC KEY-----");
    try {
      return (createPublicKey(rsaVariant), rsaVariant);
    } catch {
      return normalized;
    }
  }
}
