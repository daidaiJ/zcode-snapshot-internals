/**
 * encryptArchive — 信封加密（AES-256-CTR + RSA-OAEP）
 *
 * 上传链路阶段 3/6 · 明文 tar.gz → 密文产物 + 信封 JSON。数据密钥只有
 * 服务端公钥能解开：本地加密的文件，只有厂商云端能解密。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../03-encrypt-archive.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   encryptArchive      加密主编排：生成密钥 → 流式加密 → 写信封 → 返回元数据
 *   sha256File          流式计算文件 sha256（hex）
 *   writeNoncePrefix    把 16B nonce 前缀写入密文文件头（回调式 write 包装）
 *   normalizeTarPath    tar 路径规整（与 02 重复，见 README 备注）
 *
 * ── 调用链位置 ──────────────────────────────────────────────
 *   createEncryptedRepoSnapshotArtifact() [09] → encryptArchive()
 *   信封字段由 09 组装传入（envelopeInput），公钥来自 04 的上传凭证。
 *
 * Node 内建别名已还原：fs/promises: mkdir/rm/stat · fs: createReadStream/
 * createWriteStream · path: dirname · stream/promises: pipeline ·
 * crypto: randomBytes/createCipheriv/createHash/publicEncrypt/constants。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: encryptArchive -> encryptArchive */
/**
 * 信封加密编排：
 *  1. 随机生成 32B 数据密钥（AES-256）与 16B CTR nonce
 *  2. 明文 tar.gz 流式 AES-256-CTR 加密落盘，nonce 以 16B 前缀写在密文头
 *  3. 数据密钥用服务端 RSA 公钥（RSA-OAEP-SHA256）封装成 encryptedDataKey
 *  4. 信封 JSON（含明文 sha256）原子落盘
 * 私钥只在服务端 —— 本地加密的快照只有厂商云端能解。
 */
async function encryptArchive(input) {
  (await mkdir(dirname(input.encryptedArtifactPath), { recursive: true }),
    await mkdir(dirname(input.envelopePath), { recursive: true }));
  // 32B AES-256 数据密钥；只以 RSA 封装后的形态离开本机
  let dataKey = randomBytes(32), // 32B AES-256 data key
    // 16B CTR IV，明文存于密文文件头（ciphertext-prefix-16-byte）
    noncePrefix = randomBytes(16); // 16B CTR IV, written as ciphertext prefix
  input.signal?.throwIfAborted();
  let plaintextSha256 = await sha256File(
      input.plaintextArchivePath,
      input.signal,
    ),
    // 流式加密：明文 tar.gz → pipeline → 密文文件（先写 16B nonce 前缀）
    cipher = createCipheriv("aes-256-ctr", dataKey, noncePrefix),
    cipherOutput = createWriteStream(input.encryptedArtifactPath, {
      signal: input.signal,
    });
  (await writeNoncePrefix(cipherOutput, noncePrefix),
    await pipeline(
      createReadStream(input.plaintextArchivePath, { signal: input.signal }),
      cipher,
      cipherOutput,
      {
        signal: input.signal,
      },
    ));
  let envelope = {
    ...input.envelopeInput,
    // RSA-OAEP-SHA256 封装数据密钥；公钥来自 04 的上传凭证（服务端下发）
    encryptedDataKey: publicEncrypt(
      {
        key: input.uploadKey.publicKeySpkiPem,
        padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      dataKey,
    ).toString("base64"),
    plaintextSha256: plaintextSha256,
  };
  // 信封 = 解密说明书：算法/keyId/nonce 编码/AAD + 封装后的密钥 + 明文哈希
  await atomicWriteJson(input.envelopePath, envelope);
  let encryptedStat = await stat(input.encryptedArtifactPath);
  return {
    encryptedArtifactPath: input.encryptedArtifactPath,
    envelopePath: input.envelopePath,
    manifestPath: "",
    envelope: envelope,
    encryptedSizeBytes: encryptedStat.size,
    encryptedSha256: await sha256File(
      input.encryptedArtifactPath,
      input.signal,
    ),
  };
}

/* keepNames: ldt -> sha256File */
/** 流式计算文件 sha256（hex）。加密前后各算一次：明文进信封，密文进上传请求。 */
async function sha256File(filePath) {
  let hash = createHash("sha256");
  return (
    await new Promise((resolve, reject) => {
      let stream = createReadStream(filePath);
      (stream.on("data", (chunk) => hash.update(chunk)),
        stream.on("error", reject),
        stream.on("end", resolve));
    }),
    hash.digest("hex")
  );
}

/* keepNames: rct -> writeNoncePrefix */
/** 回调式 write 包装：把 16B nonce 前缀写进密文文件头，失败向上传递。 */
async function writeNoncePrefix(stream, noncePrefix) {
  await new Promise((resolve, reject) => {
    stream.write(noncePrefix, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/* keepNames: normalizeTarPath -> normalizeTarPath */
/**
 * tar 路径规整：反斜杠归一为斜杠、去掉开头的 /；空段或 .. 段直接抛错
 * （防路径穿越）。注意：02 与 03 各有一份逐字相同的实现（bundle 内重复），
 * 本仓库按原样分文件保留。
 */
function normalizeTarPath(path) {
  let normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.split("/").some((segment) => !segment || segment === "..")
  )
    throw new Error(`invalid repo snapshot artifact path: ${path}`);
  return normalized;
}
