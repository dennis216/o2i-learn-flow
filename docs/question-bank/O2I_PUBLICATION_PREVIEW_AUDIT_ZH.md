# 发布预览收尾与 UNCERTAIN 核对（2026-10-18）

## 原文件与隔离回放结论

范围更正：以下表格只描述原 XLSX 与此前未做计算器编辑的隔离回放，不代表当前生产草稿。用户明确表示 Save draft 前已修改 Calculator policy；不能用原文件空值推断生产空值。现已通过生产只读查询和 Edit/Publish 核对，当前生产 8 题均为 no_calculator，完整版本见下方补充调查；新版前端部署后验收仍未完成。

只读源文件：`/Users/mucenyao/Downloads/O2I_Q1-10_Post_Review_Draft_2026-10-03.xlsx`。SHA256：`dea5aa3cfaac1f5e33ea326a70d79ba25a502906afe7723aeb42fcfdc869cd60`。实际 8 题/32 选项，原题号 1–6、8、9。

| 原题号 | Difficulty | Calculator policy | AB/BC | Topic | Skills | 物理 PDF 页 | 来源题号 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | easy | NULL | BOTH | 1.5 | 1.E | 1 | 1 |
| 2 | easy | NULL | BOTH | 1.5 | 1.E | 1 | 2 |
| 3 | medium | NULL | BOTH | 1.6 | 1.E | 1 | 3 |
| 4 | medium | NULL | BOTH | 1.6 | 1.E | 2 | 4 |
| 5 | medium | NULL | BOTH | 1.6 | 1.E | 2 | 5 |
| 6 | easy | NULL | BOTH | 1.15 | 1.E | 2 | 6 |
| 8 | hard | NULL | BOTH | 1.15 | 1.E | 2 | 8 |
| 9 | hard | NULL | BOTH | 1.6 | 1.E | 3 | 9 |

全部来源文件为 `Calc AB:BC Unit 1 questions.pdf`。8 题的 source_locator 均空，但已有明确印刷题号，满足来源定位数据要求。计算器规则确实全部未填写；这是允许保留 NULL 的可选事实，不推断成 no_calculator。XLSX 本来不提供 source_type 列；本次不补造来源许可。

8 题的原始 ai_flags 完全相同：`TAXONOMY_UNCERTAIN|DIFFICULTY_UNCERTAIN|CALCULATOR_POLICY_UNCERTAIN`。这些是文件原有值，不是解析器生成或字段错误映射。难度和分类已有值，仍带相应历史 flags；flags 不能证明字段缺失。

原始 human_review_notes 保留了当时“XLSX 收录不等于数据库正式批准、四组 pending、CODE_UNVERIFIED”等历史说明。Q6 另有正无穷方向修正，Q8/Q9 另有难度调为 hard 的记录；本次没有删除、重写或伪造这些说明。

## 映射与修复范围

使用独立只读 XLSX 提取与产品解析器比较，再在新建的 loopback/tmpfs 本地 Auth/REST/PostgreSQL 环境回放。逐题比较原单元格、解析对象、保存 payload、数据库回读、精确版本 Preview 和发布 plan：难度、计算器规则、课程范围、Topic/Skills、来源定位、原 flags 和审核备注一致。没有发现保存链路丢字段；calculator 从原单元格空值解析成空串、保存为 NULL，是既有明确转换。

展示层原先有两个问题：共享版本预览没有携带完整元数据；Publish 继续展示历史 AI/JSON 信息，让已填值和旧 UNCERTAIN 并列。旧线上表单还把逐 flag 解决说明作为门槛，造成重复审核。修复为：

- 共享版本查询及类型携带已保存的 calculator/difficulty/course scope 和规范 Topic/Skills；精确版本详情直接使用本次回读值，发布摘要重新读取已保存值，不从 flags 推断。
- 单题默认展开题目和解析；批量保持清楚的只读标签摘要，可展开。Calculator NULL 明确显示 Not specified (optional)，已有值按真实枚举展示。
- Publish 移除原 flags、原 JSON 和审核表；来源定位仍可折叠。现有 Preview 入口继续提供完整原导入证据，无新增审核系统。
- 一次默认未勾选的人工确认、取消选择、最多 20 题、最终 Publish 才写入等规则沿用 9b5dc1a。内容阻断提示包含明确题目 ID 和字段。
- 不增加或修改数据库迁移，不改学生端、practice_problems 或原文件。

## 本地验证与截图

已通过题库单元测试 82/82、一次性 PostgreSQL 发布回归 36/36、app/node TypeScript、修改文件定向 ESLint、build 和 diff 检查。最终完整本地 Chrome/Auth/REST/PostgreSQL 浏览器验收 31/31 通过，结果无 error，隔离临时容器及网络已清理。

验收覆盖全部 8 题原始单元格 → 解析 → payload → 数据库 → 精确版本预览/发布摘要一致；全部真实题只读标签、默认展开内容和取消零写入；完整合成题保留三类旧 UNCERTAIN flags 后明确确认发布成功；缺必要图片提示准确到题目和 image_url；批量数据库故障完整回滚及重试；权限撤销、过期版本、答案隔离、20 题上限、发布读回、撤回/修订/重新发布和历史保留。实际真实 8 题仅在隔离环境回放为草稿，未发布。

一次运行曾被手动暂停的 Docker 中断；恢复后已按最终代码从新建环境完整重跑通过，没有遗留失败项。此处的迁移与 Auth 账号仅存在于一次性本地环境，未使用生产数据库或生产管理员账号。

两张已目视检查的本地截图：`.task4d-browser.local/07-real-q004-publication-preview.png` 和 `08-synthetic-complete-publication-preview.png`。原题 4 显示 medium、AB & BC、1.6/1.E、可选计算器未提供，以及完整题目/正确答案/解析；合成题显示 calculator allowed，原 flags 仍存数据库而不显示在 Publish 中。截图与真实输入不提交 Git。

本地通过不等于线上部署或生产题目已获人工批准。

## Calculator policy 补充调查（生产只读核对完成，新版部署后验收待做）

用户说明 Save draft 前已经修改过计算器规则。新增回归使用原始计算器为空的合成 XLSX，分别在浏览器 Adjust metadata 中选择 calculator_allowed、calculator_required，确认实际保存请求 payload 与 manual_edits、保存 RPC 后数据库字段、整页刷新后的精确工作 version_id、Saved drafts 读取、Edit 和 Publish 展示均保留对应选择。两个场景只在临时本地环境运行；最终浏览器 33/33、单元测试 82/82 通过，容器及网络已清理。另保留 NULL 合成题的发布兼容检查。

静态检查当前与旧提交 659f2a6 的保存链路：预览从 workingSheets 重新验证生成 payload；save_question_bank_drafts 接收该 payload；数据库 INSERT 显式使用 item.calculator_policy；Edit 读取工作版本实际字段。当前本地回放未复现编辑值丢失，不能据此排除生产历史问题或缓存/版本读取问题，也不能编造根因并修改保存逻辑。

用户登录后，已逐题只读打开并取消线上 8 题的 Edit 和旧版 Publish：原题 1–6、8、9 均为 Version 1，Edit 与 Publish 的实际 select.value 均为 no_calculator，Edit Changes 均为 0。每题保存的 import_evidence.manual_edits 都记录 calculator_policy 从空串改为 no_calculator（XLSX 行 2–9）。三类原始 UNCERTAIN flags 同时保留。由此确认：用户选择已经持久化，两处 UI 都没有把计算器值读成空；此前用原文件 NULL 推断当前线上值的结论不成立。

线上误导已定位：旧 Publish 表单已经预选 no_calculator，却仍展示 Resolve original AI flags 并要求填写 CALCULATOR_POLICY_UNCERTAIN 的逐条解决说明；当前阻断文案是旧四组审核要求。问题为旧审核门槛及历史 flags 的使用，未发现当前 8 题保存丢失。9b5dc1a/966123a 已在本地移除这些发布门槛并按保存值只读展示；本次没有理由改写保存逻辑或生产数据。

随后使用用户已登录的 Supabase 管理会话，仅执行一条限定这 8 个 external_id 的 SELECT，读取工作版本及已保存证据。每题 working_version_count=1、version_number=1、version_status=draft、question_status=draft、current_version_id=NULL；calculator_policy 均为 no_calculator，原 flags 和空串 → no_calculator 的 manual_edits 均保留，与逐题打开的 Edit/Publish 值一致。

| 原题号 | 当前工作 version_id | calculator_policy |
| --- | --- | --- |
| 1 | 1bcb721f-2c29-4bc2-8afc-017cb1f277a3 | no_calculator |
| 2 | 2846000d-0abe-4e57-860f-e4ef7ae85294 | no_calculator |
| 3 | d01611e7-d130-4cea-bacf-16140caab561 | no_calculator |
| 4 | f77cfe47-d2d6-4d60-8402-815995afe490 | no_calculator |
| 5 | b8c6b8cf-0bb7-46de-a0cc-e83a9a94b722 | no_calculator |
| 6 | 21cfacfc-962b-4e6d-9555-c66591799d38 | no_calculator |
| 8 | 9e579cc7-68ae-4de8-a4d9-69d24ccef7a6 | no_calculator |
| 9 | 9ebf45f2-e2be-4667-8d1c-aa1b67fc198f | no_calculator |

查询未执行迁移、更新、发布或其他生产数据写入，也未索取密钥。本次保存值问题已确认：没有观察到用户选择丢失或被读取成空。重复审核根因是旧线上发布表单继续要求处理历史 UNCERTAIN flags；修复已在本地 9b5dc1a/966123a 中完成，本次只补回归与证据范围更正。无需增加迁移或覆盖 8 题现值。新版前端尚未部署，部署后的线上管理员发布预览验收仍需另做；此次只读核对不等于真实题内容人工批准或发布验收。

## 本地、远端与线上区别

本次开始时本地 HEAD 为 9b5dc1a；实时 `git ls-remote` 显示远端 migrate-codex-work 为 659f2a6，main 为 bd4969c。远端 main 的发布组件仍有旧四组表单。网站公开构建 `/assets/Admin-BtKU41P0.js` 实测包含 Verified calculator policy、Source-use rights and provenance、Resolve original AI flags，不包含新版的一次人工确认文案。不能把旧表单归因为需要刷新；新版提交尚未送达远端与部署版本。该检查只证明公开 bundle 的表单行为，不猜测未嵌入的部署 commit SHA。

用户已回传简化规则生产迁移的 19/19 目录和账本通过。本次不重跑生产 SQL；测试中的迁移仅作用于新建一次性本地库。后续需推送当前分支尚未推送的提交，通过新的 PR 合并到 main，再执行/确认前端部署，最后单独做生产管理员验收。PR #7 已合并的是更早的实现，不包含 9b5dc1a 和本次收尾。本任务没有 push、合并、切分支、部署或生产写入。
