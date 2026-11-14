# 无限练习：新题做完后继续出做过的题（continuous-repeat）

Issue #44。起因：无限练习（自由练习 / Topic 练习）只出账号从没答过的题。账号把范围内的题都答过一次后，新开的练习第一题就显示"都做过了"，练习卡住。

## 行为

- 有没做过的题时，规则不变：仍优先出没做过的题，Topic 选择、难度升降、每第 5 题的复习都和以前一样。
- 范围内没有没做过的题时，接着出以前做过的题：上次答错的优先，然后按最久没做的顺序。
- 同一次练习不重复出同一道题。只有这次练习已经把范围内的题都出过一遍，才显示"这次练习已经把这里的题都出过一遍了"。
- 重复出的题照常随机打乱选项、正常判分；练习总结里不算"新题"。
- 出题原因里的 `kind` 仍是 `continue`（正式站现有前端认识），另加 `repeat`（`incorrect` / `oldest`）；新前端不显示原因句子，只在题号那一行右侧显示一个淡橙色小标签 `Review`。旧前端忽略这个字段，照常运行。
- 只替换 `question_practice_issue_next` 一个函数，不改表、不改题、不改答题记录；5 题练习和 Arena 不受影响。

## 部署步骤（Reeva 执行）

1. 只读执行 `00_preflight_readonly.sql`，要求三列都是 `t`：前置迁移（continuous、option-order）账本匹配、当前出题函数正文与 20261104 版本一致、本包尚未登记。
2. 执行一次 `10_deploy.sql`（单事务；已登记或前置不匹配会中止，不重放旧迁移）。
3. 只读执行 `20_verify_readonly.sql`，要求 `all_checks_pass=true`。
4. 用已经答过全部题的测试账号开自由练习：第一题能出来，题号那一行右侧有 `Review` 小标签；答错过的题先出现。

## 本地验证与重新生成

```bash
node scripts/generate-practice-continuous-repeat-deploy.mjs
npm run test:practice:continuous-repeat:db   # 一次性本地 PostgreSQL，经 docker 命令启动
npm run test:student-practice
```

## 部署记录

- 待部署。
