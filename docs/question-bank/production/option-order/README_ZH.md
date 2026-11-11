# Practice 选项乱序（option-order）：发布包

起因：旧 Arena 转录的 386 道题，正确项存储顺序都是 A（见 [排查记录](../../../arena/legacy-import/STATUS_ZH.md)）。Practice 按存储顺序显示，学生“总选 A”就能答对。本包不改任何题目、版本或答题记录。

## 行为

- 每道题发给学生时，服务器随机打乱选项并冻结在 `question_practice_items.option_order`；字母按显示位置重新标 A–F。刷新、重复请求、提交后、Review 都是同一顺序。
- 判分用选项 ID，不受影响。题库后台、导入、存储的 `option_key` 不变。
- 普通 5 题、课程练习、无限练习都生效（一个触发器覆盖所有发题函数）。
- Arena：练习记录直接采用 Arena 已冻结的顺序，Review 里看到的和游戏里一致。
- 部署前已发出的题 `option_order` 为空，继续按原顺序显示，旧会话和 Review 历史完全不变。
- 返回给前端的数据结构不变（`id`/`key`/`text`），正式站和测试站的现有前端都不需要改，也不需要重新发布前端。

## 发布步骤（必须另获明确生产授权）

1. 只读执行 `00_preflight_readonly.sql`，要求三列都是 `t`：前置迁移账本匹配（adaptation-v2、course practice、Arena 接入）、当前快照函数正文与 20261026 版本一致、本包对象尚不存在。为 false 时先查差异，不要改账本强行通过。
2. 执行一次 `10_deploy.sql`（单事务；已登记、部分存在或前置不匹配都会中止，不会重放旧迁移）。
3. 只读执行 `20_verify_readonly.sql`，要求 `all_checks_pass=true`。
4. 用测试学生账号在测试站开一组 5 题、一次无限练习、一局 Arena：选项顺序随机、刷新不变、提交判分正确、Review 顺序一致；再看一个部署前的旧会话没变。

## 本地验证与重新生成

```bash
node scripts/generate-practice-option-order-deploy.mjs
npm run test:practice:option-order:db   # 一次性本地 PostgreSQL，经 docker 命令启动
npm run test:student-practice
npm run test:migrations
```

迁移或前置迁移改变后重新生成三份 SQL。
