# heap-pipeline-m · 打包+加密全链分配热点 · 1C2G

profile: `bench/prof/heap-pipeline-m-1c2g.heapprofile` · 采样分配 2.0MB

| # | 函数 | 位置 | self MB | self % | total MB |
|--:|---|---|--:|--:|--:|
| 1 | `howMuchToRead` | readable:630 | 0.5 | 25.0 | 0.5 |
| 2 | `getOptions` | utils:320 | 0.5 | 25.0 | 0.5 |
| 3 | `finish` | writable:949 | 0.5 | 25.0 | 0.5 |
| 4 | `(anonymous)` | child_process:1 | 0.5 | 25.0 | 0.5 |
| 5 | `(root)` | -:0 | 0.0 | 0.0 | 2.0 |
| 6 | `processTicksAndRejections` | task_queues:71 | 0.0 | 0.0 | 1.0 |
| 7 | `(anonymous)` | -:0 | 0.0 | 0.0 | 0.5 |
| 8 | `writeGzipTarToPath` | pipeline.js:191 | 0.0 | 0.0 | 0.5 |
| 9 | `writeTarEntry` | tar.js:43 | 0.0 | 0.0 | 0.5 |
| 10 | `next` | -:0 | 0.0 | 0.0 | 0.5 |
| 11 | `createAsyncIterator` | readable:1359 | 0.0 | 0.0 | 0.5 |
| 12 | `Readable.read` | readable:647 | 0.0 | 0.0 | 0.5 |
| 13 | `(anonymous)` | -:0 | 0.0 | 0.0 | 1.0 |
| 14 | `executeUserEntryPoint` | run_main:157 | 0.0 | 0.0 | 1.0 |
| 15 | `wrapModuleLoad` | loader:237 | 0.0 | 0.0 | 1.0 |
| 16 | `(anonymous)` | loader:1193 | 0.0 | 0.0 | 1.0 |
| 17 | `(anonymous)` | loader:1490 | 0.0 | 0.0 | 1.0 |
| 18 | `(anonymous)` | loader:1878 | 0.0 | 0.0 | 1.0 |
| 19 | `(anonymous)` | loader:1731 | 0.0 | 0.0 | 1.0 |
| 20 | `(anonymous)` | -:0 | 0.0 | 0.0 | 1.0 |
| 21 | `require` | helpers:146 | 0.0 | 0.0 | 1.0 |
| 22 | `(anonymous)` | loader:1519 | 0.0 | 0.0 | 1.0 |

| 类别 | self MB | 占比 |
|---|--:|--:|
| other | 2.0 | 100.0% |
| node-internal | 0.0 | 0.0% |
| bench | 0.0 | 0.0% |
