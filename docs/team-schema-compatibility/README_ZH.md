# Team / Admin 白屏兼容修复与安全升级

本次仅本地实施、验证、commit；没有 push、部署或生产写入。题库与 Practice 不属于补丁范围。

## 已核对的生产事实

通过公开 Team API **只读 GET** 核对：8 行仍使用 `role/department` 字符串。角色包括 `Co-founder & Team Leader`、`Co-founder & Website Developer & Team Leader`、`Team Leader`、`Team Member`；所属组为 Math、Chemistry、Physics。没有读取密码、管理员密钥或个人账户数据。

`ee9d9b9` 页面直接访问不存在的 `roles/departments` 数组，导致 Team 与 Admin 渲染异常。原 `20261020010000_team_member_roles_and_departments.sql` 不支持三重复合角色，并删除旧字段，**不要直接执行它**。

## 兼容前端

- 两个页面共同使用 `loadTeamMembers` / `normalizeTeamMember`，在读取边界转换旧字段。已有数组优先，包括明确的空数组；旧复合角色拆分、`Leader` 别名及两个旧部门名转换；不推测未知值。
- 未知/空组成员进入 Team Members 兜底区。角色、所属组原值仍显示；姓名、简介、照片、排序保留。
- 旧 schema：成员可见，编辑窗口可查看/取消；**Team 新增和编辑保存禁用**，请求函数也有保护，不发送不存在的数组列或上传照片。提示明确说明尚需 Team 数据库升级。其他后台入口不受此限制。
- 数组 schema（仅数组或新旧共存）：允许按现有表单保存，成功响应后重新查询；查询失败时准确提示需要核对，不显示成功。未知角色/组留在原数组中，不因表单仅列出常用选项而被删掉。
- 获取失败与实际无数据分开显示，可重试；Cancel 不写入。

## 准确上线顺序

1. **先单独送审并部署本次 Team 兼容前端。** 本轮不执行 push/merge/deploy；不要顺带发布其他尚未送审的 Practice 或题库改动。部署后，在旧数据库上 `/team` 和管理员 `/admin` 就应恢复显示。此时 Team 新增/编辑保存禁用是预期行为。
2. 核对 Supabase 项目 `lxoaeaewcrshjkigzyqe` 及 Team 执行前人数（当前只读快照为 8）。在 SQL Editor **一次复制执行本目录 `10_upgrade.sql` 全文**。没有占位符，只执行本次新增兼容 SQL；不要额外执行原迁移或整库 `db push`。
3. 该包将结构转换、同步触发器与迁移账本放在同一事务；失败整体回滚。旧字段保留，现有数组优先，复合角色完整拆分，未知值保留，不重建或重新灌入成员。角色/部门的旧受控枚举 CHECK 不再用于丢弃或阻断未知身份；管理员 RLS 和授权不变。
4. **账本处理透明：** 若旧 `20261020010000` 未执行，将该版本登记为 `superseded_by_20261022000000`，statements 明文注明“原脚本未执行、被新增兼容迁移替代”，防止以后误跑旧删列脚本。不是伪造原 SQL 已执行；若原版本确已记录，则不覆盖。新增 `20261022000000` 单独记录实际完整 SQL 原文。历史迁移文件没有修改。
5. 独立执行 `20_verify_readonly.sql` 全文，确认 `all_checks_pass=true`（8 项）、`member_count` 与执行前一致。它只读，不修改成员或账本。若旧版本是替代登记，结果会明确显示替代名称。
6. 兼容前端中点击 **Reload Team data** 或刷新。数组列检测通过后 Team 新增/编辑保存自动启用，无需第二次前端部署。由用户自行选择合法的实际编辑，保存后刷新核对 Admin 与 Team 一致；本轮没有代做生产保存。

新旧字段共存时，触发器兼容旧字符串写入和新数组写入。既有记录的旧字符串不会在升级回填时被覆盖；后续实际编辑会同步表示。对于旧迁移已经删除字符串列的其他环境，兼容字符串由现有数组生成，不声称恢复已删除的原始文本。

升级成功后不要重跑 `10_upgrade.sql`；它会拒绝重复执行。不要用旧删除字段脚本、重灌成员或放宽权限处理部署顺序问题。

## 本地验证

```sh
node --experimental-strip-types --test src/lib/teamDepartments.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json
npm run build
O2I_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
O2I_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node --experimental-strip-types scripts/team-compatibility.test.mjs
```

集成脚本只使用专用一次性 PostgreSQL/Auth/REST/Chrome。8 组角色、分组和排序来自生产只读形状，姓名、简介、照片和 UUID 是本地合成数据；不复制生产个人资料。结果与两页截图在 Git 忽略的 `node_modules/.cache/team-schema-compatibility/`，结束删除容器。详细记录见 `VALIDATION.md`。

生成完整上线副本：`node scripts/generate-team-compat-deploy.mjs`。权威新增 SQL 为 `supabase/migrations/20261022000000_team_schema_compatibility.sql`。
