# upost-256m · OSS POST 直传 256MB 密文 · 2C4G

profile: `bench/prof/upost-256m-2c4g.cpuprofile` · total 1.56s

| # | 函数 | 位置 | self ms | self % | total ms |
|--:|---|---|--:|--:|--:|
| 1 | `(idle)` | -:0 | 390 | 25.1 | 390 |
| 2 | `writeBuffer` | -:0 | 282 | 18.1 | 282 |
| 3 | `writeBuffer` | -:0 | 167 | 10.7 | 167 |
| 4 | `(program)` | -:0 | 134 | 8.6 | 134 |
| 5 | `randomFillSync` | random:118 | 59 | 3.8 | 59 |
| 6 | `generateKeyPairSync` | keygen:101 | 39 | 2.5 | 39 |
| 7 | `pull` | undici:5749 | 35 | 2.2 | 46 |
| 8 | `(garbage collector)` | -:0 | 26 | 1.7 | 26 |
| 9 | `readNext` | blob:330 | 25 | 1.6 | 25 |
| 10 | `FastBuffer` | buffer:956 | 19 | 1.2 | 19 |
| 11 | `parserOnBody` | _http_common:128 | 19 | 1.2 | 39 |
| 12 | `afterWriteDispatched` | stream_base_commons:154 | 13 | 0.8 | 23 |
| 13 | `queueMicrotask` | task_queues:158 | 13 | 0.8 | 22 |
| 14 | `write` | undici:6964 | 12 | 0.7 | 245 |
| 15 | `writeIterable` | undici:6911 | 10 | 0.7 | 259 |
| 16 | `maybeReadMore_` | readable:864 | 8 | 0.5 | 18 |
| 17 | `nextTick` | task_queues:111 | 7 | 0.4 | 8 |
| 18 | `runMicrotasks` | -:0 | 7 | 0.4 | 67 |
| 19 | `readableStreamFulfillReadRequest` | readablestream:2105 | 7 | 0.4 | 9 |
| 20 | `(anonymous)` | blob:331 | 6 | 0.4 | 49 |
| 21 | `maybeReadMore` | readable:857 | 6 | 0.4 | 14 |
| 22 | `(anonymous)` | undici:11370 | 6 | 0.4 | 6 |

| 类别 | self ms | 占比 |
|---|--:|--:|
| node-internal | 1023 | 65.7% |
| other | 525 | 33.8% |
| bench | 6 | 0.4% |
| native-streams | 0 | 0.0% |
