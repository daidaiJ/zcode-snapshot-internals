# pipeline-l · 343MB 明文打包+加密 · 1C2G

profile: `bench/prof/pipeline-l-1c2g.cpuprofile` · total 61.86s

| # | 函数 | 位置 | self ms | self % | total ms |
|--:|---|---|--:|--:|--:|
| 1 | `(idle)` | -:0 | 35312 | 57.1 | 35312 |
| 2 | `(garbage collector)` | -:0 | 5445 | 8.8 | 5445 |
| 3 | `processChunk` | zlib:492 | 3264 | 5.3 | 3264 |
| 4 | `read` | -:0 | 2850 | 4.6 | 2850 |
| 5 | `close` | -:0 | 1593 | 2.6 | 1593 |
| 6 | `(program)` | -:0 | 1526 | 2.5 | 1526 |
| 7 | `open` | -:0 | 947 | 1.5 | 947 |
| 8 | `processCallback` | zlib:512 | 811 | 1.3 | 5057 |
| 9 | `processChunk` | zlib:492 | 711 | 1.1 | 711 |
| 10 | `scanRepoSnapshot` | pipeline.js:82 | 659 | 1.1 | 2830 |
| 11 | `looksBinary` | pipeline.js:73 | 586 | 0.9 | 609 |
| 12 | `writeBuffer` | -:0 | 577 | 0.9 | 577 |
| 13 | `read` | -:0 | 568 | 0.9 | 568 |
| 14 | `lstat` | -:0 | 566 | 0.9 | 566 |
| 15 | `openFileHandle` | -:0 | 565 | 0.9 | 565 |
| 16 | `close` | -:0 | 500 | 0.8 | 500 |
| 17 | `memoryUsage` | -:0 | 265 | 0.4 | 265 |
| 18 | `readFileUtf8` | -:0 | 199 | 0.3 | 199 |
| 19 | `writeBuffer` | -:0 | 143 | 0.2 | 143 |
| 20 | `lstat` | promises:1022 | 135 | 0.2 | 714 |
| 21 | `runMicrotasks` | -:0 | 115 | 0.2 | 1896 |
| 22 | `nextTick` | task_queues:111 | 114 | 0.2 | 117 |

| 类别 | self ms | 占比 |
|---|--:|--:|
| node-internal | 51567 | 83.4% |
| native-streams | 4786 | 7.7% |
| other | 3058 | 4.9% |
| bench | 1574 | 2.5% |
