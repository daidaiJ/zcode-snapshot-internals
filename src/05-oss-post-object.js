/*!
 * ★ 逆向还原代码摘录（原文逐字，未美化）——《OSS 直传 · PUT 预签名 / POST 表单（PostObject）》
 *
 * 来源 : ZCode Desktop 3.12.2 / resources/app.asar → out/host/index.js（minified）
 * 用途 : 安全研究与教学。仅摘录理解上传链路所需的最小片段；
 *        片段边界按锚点截取，可能起止于任意 token，用 /* ⋯ *​/ 标注截断。
 * 版权 : 原始代码版权归 Z.ai（智谱）所有，本摘录出于互操作性与安全审计目的。
 * 解析 : 见 docs/02-code-flow.md（流程拆解）与 docs/03-design-notes.md（设计点评）
 */

/* ═══════ 锚点: a(odt,"uploadPutObject") ═══════ */
t.encryptedSizeBytes,1),formFields:{success_action_status:"200",policy:r.oss.policy,"x-oss-signature":r.oss.x_oss_signature,"x-oss-signature-version":r.oss.x_oss_signature_version,"x-oss-credential":r.oss.x_oss_credential,"x-oss-date":r.oss.x_oss_date,key:r.oss.path,"x-oss-security-token":r.oss.x_oss_security_token,...s,callback:edt({callback:r.callback,callbackBody:l})},callback:{mode:"oss-callback"}}}}a(rdt,"buildObjectUploadTarget");async function odt(e){let t=new Headers(e.target.headers),r=e.target.checksum;return r?.headerName&&r.value&&t.set(r.headerName,r.value),e.fetchImpl(e.target.url,{method:"PUT",redirect:"error",headers:t,body:jlt(e.artifactPath),duplex:"half",signal:e.signal})}a(odt,"uploadPutObject");async function idt(e){let t=new FormData;for(let[o,n]of Object.entries(e.target.formFields??{}))t.set(o,n);let r=await Zlt(e.artifactPath,{type:"application/octet-stream"});return t.set("file",r,"repo-snapshot.tar.gz.enc"),e.fetchImpl(e.target.url,{method:"POST",redirect:"error",headers:e.target.headers,body:t,signal:e.signal})}a(idt,"uploadPostObject");var Wk=class{static{a(this,"RepoSnapshotUploadClient")}apiClient;objectUploadFetch;credentialTimeoutMs;objectUploadTimeoutMs;uploadCredentialsByHandle=new Map;constructor(t){this.apiClient=t.apiClient,this.objectUploadFetch=t.objectUploadFetch,this.credentialTimeoutMs=t.credentialTimeoutMs??Hlt,this.objectUploadTimeoutMs=t.objectUploadTimeoutMs??Klt}async getUploadCredential(t,r,o){let n=Vlt(r),i=await Ot(this.apiClient,n,{method:"GET",headers:qlt(t),timeoutMs:this.credentialTimeoutMs,signal:o}),s=vIe(i);return s?
