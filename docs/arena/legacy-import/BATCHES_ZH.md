# 旧 Arena 候选批次对账

这是待审核内容清单。296 道已录入生产草稿并完成全字段、来源哈希和配图回读，其余 90 道待录入；发布 0 道。用户尚未确认具体内容发布。

- 原始 471 道全部有唯一去向：386 道候选、85 道排除。
- 候选 348 道 easy、38 道 medium；386 道均 non-calculator。
- 每道候选都具有 canonical Topic、至少一个 Skill、难度、独立核对过的解析和唯一正确选项。
- 生产只读预检：386 道来源原行哈希一致，Topic/Skills 与课程范围有效，字段完整，existing ID 碰撞为 0。
- 真实题目、答案、PNG、审核页、逐题排除原因与录入文件只在仓库外私有目录；Git 仅保存计数和内容包哈希。

| 来源工作批次 | 候选 | 排除 | 私有内容包 SHA-256 |
| --- | ---: | ---: | --- |
| pilot | 18 | 2 | `d4ddd053ac3a691b81dec7f8d3ec39dc6f1b6cc849b2caf12b53d11063c05f7f` |
| text-u1-1 | 42 | 8 | `4eb6bd328141e6059e589bab1a772d2fe6f157315b30fae18ff08fe4e06b13a3` |
| text-u1-2 | 41 | 9 | `ead25fd925d4c2d6c13781c56a82e64e486c932314400a54bceda1de2b0baa5c` |
| text-u1-3 | 17 | 18 | `2b51e6697c59b1ef2a25de9403c61c3e3587fdfa80bda3d58699e0313ccd5883` |
| text-u2-1 | 30 | 4 | `14c125db0a7fc184dc8656e177ffb1d042b9b80d64f86f11371c3bd25efb2447` |
| text-u3-1 | 29 | 4 | `bdb4306d3a34b0f6e0d3781e44ac8fc844e3a778e2ee62340bd4cacbc2694fa3` |
| text-u4-1 | 32 | 1 | `4b6f7dd92d9d35df043c72319da0b6fea938493a508f56eb369a7d2803c5665d` |
| text-u5-1 | 28 | 5 | `35a43a636cca5420841c4f49ad661d26e93769e865a31f0a20eba3cf68dcb651` |
| text-u6-1 | 29 | 5 | `fb905e7435ce0e6dc80c59b551ccb0a1ec13766b71b670ca4aa4913769c2873a` |
| text-u7-1 | 30 | 2 | `5162d8b3aa049091d551fc786b2b1fbd3a032abea94e49bc8407c8c6c89d9cf1` |
| text-u8-1 | 22 | 10 | `505ee3a770f0aacdbc414f4aad22c36d765ba07b7c625b426f86192019c4c150` |
| text-u9-1 | 19 | 13 | `50259cefec83616aa0afd0f012d8ef3c484cebd5a36a8ba39cdcf80fd15887d7` |
| text-u10-1 | 30 | 4 | `0a6b341167837d01d2fa823e7ff833e207f72a7e403cb31393385472df240236` |
| graph-u1-1 | 16 | 0 | `cc8c070774faaa22e7ae15fad271e058bd475a037b58201d7d4c50419195de16` |
| table-u1-1 | 3 | 0 | `52bf5b87782bd9a501900f41f591bcb20ec5989d715ced4c1a5493ace8445bbe` |

批次名沿用旧来源 Unit 分组，不代替正式 canonical Topic。排除数包括转换前排除与盲解后排除，同一道题只计一次。

## 生产草稿验收

所有下列题目均为未发布草稿。验收通过不代替人工内容确认。时间列为 UTC；完整逐字段结果保留在各批私有 `production-draft-readback.json`。

| 批次 | 实际草稿 | 来源哈希通过 | 配图 SHA 通过 | 回读验收时间 |
| --- | ---: | ---: | ---: | --- |
| pilot | 18 | 18 | 3 | 2026-11-06T04:22:59.349Z |
| text-u1-1 | 42 | 42 | 0 | 2026-11-06T04:23:43.761Z |
| text-u1-2 | 41 | 41 | 0 | 2026-11-06T04:25:01.451Z |
| text-u1-3 | 17 | 17 | 0 | 2026-11-06T04:26:16.081Z |
| text-u2-1 | 30 | 30 | 0 | 2026-11-06T04:26:57.226Z |
| text-u3-1 | 29 | 29 | 0 | 2026-11-06T04:27:31.610Z |
| text-u4-1 | 32 | 32 | 0 | 2026-11-06T04:28:03.474Z |
| text-u5-1 | 28 | 28 | 0 | 2026-11-06T04:28:38.069Z |
| text-u6-1 | 29 | 29 | 0 | 2026-11-06T04:29:16.604Z |
| text-u7-1 | 30 | 30 | 0 | 2026-11-06T04:29:49.957Z |

## 后续录入与验收

1. 在线上前端具有原生 Arena JSON 入口后，使用已登录的 Questions 管理员导入对应 `prepared-batch-browser-*.json`。预览/取消零写入；Save drafts 上传并回读核验图片，再保存原生来源草稿。
2. 每批保存后完整核对 questions / version / options / skills / image / source hash / difficulty / solution / non-calculator，确认身份数量与草稿状态；每批验收单独 commit。
3. 用户检查具体题目并确认后，按既有发布窗口一次最多 20 题发布。不根据 AI 输出、计划批准或管理员登录自动确认。
4. 发布后检查 Practice 和 Arena 的实际可选数量、答题/解析/刷新/历史，以及两个真实学生账号的隔离；保留旧题和旧历史。

完整私有目录：`~/Documents/O2I-private/arena-legacy/2026-11-05-v1/`，入口为 `REVIEW_INDEX.html`。
