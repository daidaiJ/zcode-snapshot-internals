/*!
 * ★ 逆向还原代码摘录（原文逐字，未美化）——《信封加密 · encryptArchive（AES-256-CTR + RSA-OAEP）》
 *
 * 来源 : ZCode Desktop 3.12.2 / resources/app.asar → out/host/index.js（minified）
 * 用途 : 安全研究与教学。仅摘录理解上传链路所需的最小片段；
 *        片段边界按锚点截取，可能起止于任意 token，用 /* ⋯ *​/ 标注截断。
 * 版权 : 原始代码版权归 Z.ai（智谱）所有，本摘录出于互操作性与安全审计目的。
 * 解析 : 见 docs/02-code-flow.md（流程拆解）与 docs/03-design-notes.md（设计点评）
 */

/* ═══════ 锚点: a(oct,"encryptArchive") ═══════ */
||r===".."))throw new Error(`invalid repo snapshot artifact path: ${e}`);return t}a(P5,"normalizeTarPath");async function S_e(e,t){let r=Yst("sha256");return await new Promise((o,n)=>{let i=b_e(e,{signal:t});i.on("data",s=>r.update(s)),i.on("error",n),i.on("end",o)}),r.digest("hex")}a(S_e,"sha256File");async function rct(e,t){await new Promise((r,o)=>{e.write(t,n=>{if(n){o(n);return}r()})})}a(rct,"writeNoncePrefix");async function oct(e){await y_e(w_e(e.encryptedArtifactPath),{recursive:!0}),await y_e(w_e(e.envelopePath),{recursive:!0});let t=v_e(32),r=v_e(16);e.signal?.throwIfAborted();let o=await S_e(e.plaintextArchivePath,e.signal),n=Xst("aes-256-ctr",t,r),i=ect(e.encryptedArtifactPath,{signal:e.signal});await rct(i,r),await nct(b_e(e.plaintextArchivePath,{signal:e.signal}),n,i,{signal:e.signal});let s={...e.envelopeInput,encryptedDataKey:Qst({key:e.uploadKey.publicKeySpkiPem,padding:Jst.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},t).toString("base64"),plaintextSha256:o};await df(e.envelopePath,s);let c=await tct(e.encryptedArtifactPath);return{encryptedArtifactPath:e.encryptedArtifactPath,envelopePath:e.envelopePath,manifestPath:"",envelope:s,encryptedSizeBytes:c.size,encryptedSha256:await S_e(e.encryptedArtifactPath,e.signal)}}a(oct,"encryptArchive");function P_e(e){return new Map(e.files.map(t=>[t.path,t]))}a(P_e,"fileMap");function __e(e){let t=P_e(e.baseManifest),r=P_e(e.nextManifest),o=e.nextManifest.files.filter(i=>{le
