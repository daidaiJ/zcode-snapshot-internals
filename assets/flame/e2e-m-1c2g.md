# e2e-m · 86MB 仓库全链路（扫描+打包+加密+上传）· 1C2G

profile: `bench/prof/e2e-m-1c2g.cpuprofile` · total 14.65s

| # | 函数 | 位置 | self ms | self % | total ms |
|--:|---|---|--:|--:|--:|
| 1 | `(idle)` | -:0 | 9209 | 62.9 | 9209 |
| 2 | `processChunk` | zlib:492 | 636 | 4.3 | 636 |
| 3 | `(program)` | -:0 | 472 | 3.2 | 472 |
| 4 | `read` | -:0 | 449 | 3.1 | 449 |
| 5 | `looksBinary` | pipeline.js:73 | 423 | 2.9 | 428 |
| 6 | `(garbage collector)` | -:0 | 225 | 1.5 | 225 |
| 7 | `writeBuffer` | -:0 | 224 | 1.5 | 224 |
| 8 | `close` | -:0 | 166 | 1.1 | 166 |
| 9 | `lstat` | -:0 | 163 | 1.1 | 163 |
| 10 | `open` | -:0 | 149 | 1.0 | 149 |
| 11 | `read` | -:0 | 145 | 1.0 | 145 |
| 12 | `openFileHandle` | -:0 | 132 | 0.9 | 132 |
| 13 | `processCallback` | zlib:512 | 125 | 0.9 | 1159 |
| 14 | `close` | -:0 | 116 | 0.8 | 116 |
| 15 | `processChunk` | zlib:492 | 94 | 0.6 | 94 |
| 16 | `FastBuffer` | buffer:956 | 50 | 0.3 | 50 |
| 17 | `runMicrotasks` | -:0 | 41 | 0.3 | 621 |
| 18 | `update` | hash:132 | 39 | 0.3 | 39 |
| 19 | `createUnsafeBuffer` | buffer:1082 | 38 | 0.3 | 43 |
| 20 | `lstat` | promises:1022 | 37 | 0.3 | 214 |
| 21 | `processTicksAndRejections` | task_queues:71 | 32 | 0.2 | 1751 |
| 22 | `open` | promises:635 | 30 | 0.2 | 166 |

| 类别 | self ms | 占比 |
|---|--:|--:|
| node-internal | 11685 | 79.8% |
| other | 1158 | 7.9% |
| native-streams | 863 | 5.9% |
| bench | 577 | 3.9% |
