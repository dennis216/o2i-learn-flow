# 简化发布本地验证记录（2026-10-18）

范围：`/Users/mucenyao/Projects/o2i`，分支 `migrate-codex-work`，基线 `e485d12`。仅修改现有新题库发布链路和受影响的导入提示；没有修改已部署迁移、学生 Quiz、自适应、旧 practice_problems、课程或账号功能。

## 当前行为

- 英文 UI：查看题目/正确答案/解析/标签，取消问题题，一次默认未勾选的人工确认，直接 Publish；保留单题/跨分页批量与每批最多 20 题。来源与原 AI 信息折叠显示。
- 不再要求四组审核及说明、逐 flag 解决、来源类别/许可说明、题号/locator 额外勾选、非空 calculator 或第二层确认。不填造旧字段；calculator/source 未知保持 NULL，import_evidence 和历史审核原样保留。
- 新增迁移 `20261020000000_question_bank_simple_publication.sql`：移除旧元数据非空约束/触发器，替换内容/审核检查与可信审核 RPC。审核输入只接受 `{ "confirmed": true }`，不接受客户端身份、时间或多余字段；服务器写真实身份、时间及对应版本/内容指纹。
- 仍保留题目结构、非空内容、唯一正确答案、规范分类、必要配图、来源定位、权限、答案隔离、旧值并发保护、历史保护及原子批量发布。旧真实审核记录在内容未变时继续有效；新版页面每次仍要求一次新确认。

## 已通过

| 验证 | 最终结果 |
| --- | --- |
| `npm run test:question-bank` | 82/82 |
| `npm run test:adaptive` | 8/8 |
| `node --test supabase/tests/question_bank_foundation_static.test.mjs` | 15/15，历史迁移静态保护，不冒充当前 RLS 验收 |
| `npm run test:question-bank:db-publication` | 36/36（包含外层 test）；实际 PostgreSQL、8 个双连接锁竞争场景、独立读者提交可见性、最新 30 条 pgTAP 与官方 pg_prove |
| `npm run test:question-bank:db-drafts` | 21/21；独立旧草稿基线及历史 128 条 pgTAP |
| `npm run test:question-bank:browser`，本机 Chrome + 独立 Auth/REST/PostgreSQL | 29/29 |
| app/node TypeScript | 两个 tsconfig 均通过 |
| 本次修改的 TS/TSX 定向 ESLint | 通过 |
| `npm run build`、`git diff --check` | 通过 |

关键证据：

- 在旧 schema 创建八道旧草稿和一份通过原接口建立的真实旧格式审核，再执行新迁移；版本与审核 JSON 完全不变。旧审核可直接发布、撤回、恢复，旧 JSON 未被替换成虚构的新记录。
- calculator/source 为 NULL、locator_verified=false、原 AI flag 未解决时，新确认可通过并发布。服务器审核人、时间和内容指纹与实际版本一致，原始证据不变。
- 没有确认、false/字符串确认、伪造审核身份/时间、过期指纹均拒绝。非管理员被拒绝。空内容、多个正确答案和无效 Topic 有底层约束保护；无正确答案、选项不足、无 Skill、缺必要图片、来源页码/locator 不匹配均不能通过。
- 注入第二个发布事件写入故障后，两个题目的状态、当前版本、送审/批准转换及事件全部回滚。并发/重复请求不会产生重复版本或部分发布。最终成功显示之前实际读回正确 current_version_id。
- 浏览器检查实际题目预览/绿色正确答案/解析；未确认时 Publish 禁用，更改选择清除确认；选中缺图题时确认也不能发布，排除后可继续；没有第二层发布确认。勾选后 Cancel 对完整题库快照零修改，双击 Publish 只发送一个发布 RPC。
- 真实 XLSX 是 8 题/32 选项。在旧 schema 下先保存为草稿，再迁移；新页面直接读回旧题及证据并打开发布预检查，未重导入、未代做真实题内容审核、未发布。重复导入仍被拦截，工作副本文件哈希不变。
- 完整上线执行副本含新迁移的逐字原文。旧账本漂移时执行失败且无题目/审核变化；正确执行时 DDL 与准确账本同事务提交；19 项目录检查和账本检查均通过；重复执行被拒绝。
- 测试均使用自建 loopback/tmpfs 容器，不重置原工作库、不连接生产。临时容器、网络、账号、题目已随测试清理；运行输出/截图及 XLSX 工作副本留在 Git 忽略的 `.task4d-browser.local/`。

## 未通过项及边界

最终必需检查无未通过项。首轮测试中的旧门槛断言已按新规则更新；“多正确答案”测试已改为确认唯一索引直接拒绝该写入，未削弱数据库约束。

未运行全仓 lint；既有 lint 债务未修改。未执行生产 SQL、push、merge、切分支或部署，没有生产管理员验收结果。学生端仍未接入新题库。

人工确认与发布仍是两个阶段：最终 Publish 后，后续发布失败时已保存的真实审核记录可能保留；发布本身保持原子性。上线需新迁移与匹配前端，旧页面发送的旧格式审核输入会被新接口拒绝。没有完整备份，不声称具备提交后完整恢复能力。
