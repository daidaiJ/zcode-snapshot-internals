/*!
 * ★ 逆向还原代码摘录（原文逐字，未美化）——《待传队列 · recordUploadAttempt / markAcceptedManifest》
 *
 * 来源 : ZCode Desktop 3.12.2 / resources/app.asar → out/host/index.js（minified）
 * 用途 : 安全研究与教学。仅摘录理解上传链路所需的最小片段；
 *        片段边界按锚点截取，可能起止于任意 token，用 /* ⋯ *​/ 标注截断。
 * 版权 : 原始代码版权归 Z.ai（智谱）所有，本摘录出于互操作性与安全审计目的。
 * 解析 : 见 docs/02-code-flow.md（流程拆解）与 docs/03-design-notes.md（设计点评）
 */

/* ═══════ 锚点: async recordUploadAttempt( ═══════ */
tPendingUpload:s});return await this.stateRepo.write(c),c})}async recordUploadAttempt(t,r){return this.withWorkspaceLock(t,async()=>{let o=await this.stateRepo.read(t),n=ys(o);if(!n||!lc(n,r))return null;let i={...ya(n),attemptCount:(n.attemptCount??0)+1,lastAttemptAt:this.now()};return await this.stateRepo.write(va(o,{activeUpload:i,latestPendingUpload:o.latestPendingUpload})),i})}async failPendingUpload(t,r){return this.withWorkspaceLock(t,async()=>{let o=await this.stateRepo.read(t),n=ys(o);if(!n||!lc(n,r))return"stale";let i=o.latestPendingUpload;if(i){let c=va(o,{activeUpload:ya(i),latestPendingUpload:void 0});await this.stateRepo.write(c);try{await Cl({pending:n,preserveManifestPaths:Il(c)})}catch{}return"promoted"}if(!ult({pending:n,now:this.now(),maxRetryCount:this.maxRetryCount,maxRetentionMs:this.maxRetentionMs}))return"retained";let s=va(o,{activeUpload:void 0,latestPendingUpload:void 0});await this.stateRepo.write(s);try{await Cl({pending:n,preserveManifestPaths:Il(s)})}catch{}return"discarded"})}async discardPendingUpload(t,r,o){return this.withWorkspaceLock(t,async()=>{let n=await this.stateRepo.read(t),i=ys(n);if(!i||!lc(i,r))return"stale";let s=o?.discardLatest?void 0:n.latestPendingUpload,c=va(n,{activeUpload:s?ya(s):void 0,latestPendingUpload:void 0});await this.stateRepo.write(c);try{await Cl({pending:i,preserveManifest
/* ⋯⋯⋯⋯（原文截取）⋯⋯⋯⋯ */

/* ═══════ 锚点: async markAcceptedManifest( ═══════ */
ifestPaths:Il(c)})}catch{}return s?"promoted":"discarded"})}async markAcceptedManifest(t,r,o){return this.withWorkspaceLock(t,async()=>{let n=await this.stateRepo.read(t),i=ys(n);if(!i||!lc(i,r))return"stale";let s=n.latestPendingUpload?ya(n.latestPendingUpload):void 0,c=va({...n,lastAcceptedManifestHash:o.manifestHash,lastAcceptedManifestPath:o.manifestPath,lastAcceptedExtraManifestHash:o.extraManifestHash,lastAcceptedExtraManifestPath:o.extraManifestPath},{activeUpload:s,latestPendingUpload:void 0});await this.stateRepo.write(c);try{await Cl({pending:i,preserveManifestPaths:Il(c)})}catch{}return s?"promoted":"idle"})}};import{readdir as plt,stat as flt}from"fs/promises";import{join as M5}from"path";var mlt=2*1024*1024*1024,cIe=3,glt=6*1024*1024*1024,hlt,vlt=2;function O5(e){let t=e!==void 0&&Number.isFinite(e)&&e>0?e:mlt;return Math.min(t,(hlt??g
