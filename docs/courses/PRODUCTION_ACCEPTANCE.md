# 课程页缺字段故障 — 生产修复验收

验收日期：2026-10-21，约 23:00 UTC。目标：`o2iinstitute.org` / Supabase `lxoaeaewcrshjkigzyqe`。本记录仅覆盖此次课程列表及目录故障，不代表真实教学样板完成。

## 故障与处理

线上前端已读取 `courses.practice_course_scope`，生产数据库尚未安装相应课程迁移。公开课程查询返回 HTTP 400 / PostgreSQL `42703`；课程关联表返回 `PGRST205`，`get_course_outline` 返回 `PGRST202`。原有 AB、BC 课程仍存在。

使用已提交的数据库前向迁移补齐缺失结构：

1. 通过 SQL Editor 检查真实迁移台账：基础练习和随机组卷的 SQL 指纹一致，adaptation-v2 未部署且无未登记的 telemetry 对象。
2. 安装 adaptation-v2 原始部署包，执行其精确只读核验，20/20 通过。
3. 课程 preflight 的五个门槛全部为 true。用户明确确认 Supabase destructive operations 提示所涉及的持久数据库对象修改后，执行课程原子部署包。
4. 执行 `production/20_verify_readonly.sql`，29/29 通过，`all_checks_pass=true`。包括四条迁移记录、函数正文、RLS、只读表权限、私有游戏桶和内部函数权限。
5. 通过公开匿名 API 及真实生产浏览器验收，无模拟后端、无生产测试内容导入。

## 已登记迁移

| Version | Name | SQL MD5 |
|---|---|---|
| 20261026000000 | question_practice_adaptation_v2 | `354934137b8be264f4b1b2cf58d36b2e` |
| 20261027000000 | course_topic_content | `fcec56f3aa75dae989c9b8dd4afb9ab2` |
| 20261028000000 | course_topic_practice | `f8d0fd626747b1dd42fd6f03cf285591` |
| 20261029000000 | course_html_games | `e895306287717adabf7e04da5c46b1d8` |
| 20261030000000 | course_legacy_links | `a2276460fd2247c87bb072bee8defac3` |

已完成的迁移禁止重复执行。adaptation-v2 的单独函数正文核验是在课程迁移前执行的；课程迁移随后有意替换组卷入口和包装 snapshot，应以课程 `20_verify_readonly.sql` 核验最终函数状态。

## 生产验收结果

- 课程列表、新字段查询、两个课程关联表、AB/BC `get_course_outline` 和 `list_course_practice_topics` 均返回 HTTP 200。
- AB：8 Units / 81 Topics，Unit 1 为 16 Topics；BC：10 Units / 111 Topics，Unit 1 为 16 Topics。AB 排除 BC-only 内容，范围字段分别为 AB、BC。
- 未登录浏览器实际显示 AB、BC 两张卡片，点击 View Course 均能加载目录。BC 深链接刷新及关闭目录返回列表通过。AB 页面无 alert，浏览器错误日志为空。
- 保留原 Framework 的蓝色 Unit 标题、Topic 标题、CHA/LIM 标签和对应考试占比。
- 部署前后数量一致：courses 3、course_videos 0、questions 8、question_versions 8、attempts 14、sessions 15。公开列表为两门课程，受课程发布权限控制。
- 没有视频、游戏或 Topic 发布。正式素材尚未提供，所有 Topic 内容仍为 Draft，整门 Course 的 Published 状态保持不变；目录正常可见，Topic 暂不可展开符合当前配置。课程练习目录接口返回空列表，未替换成其他 Topic 或样题。
- 观察到的线上主 bundle：`/assets/index-CWYfFCJd.js`；本次没有发布新的前端 bundle，不能据此声称线上与当前本地 HEAD 完全相同。

## 本地复核与证据

`npm run test:courses:db` 再次通过：课程范围/约束、保存与 Draft 隔离、游戏 Storage RLS、AB/BC 组卷/服务器判分/账户隔离、精确发布包核验及重复执行拒绝。临时容器已清理。

实际线上截图：

- [恢复后的课程列表](screenshots/production-courses.jpg)
- [真实 BC 课程目录](screenshots/production-bc-framework.jpg)

## 未覆盖

没有正式素材，未验收生产 YouTube 播放、HTML 上传/运行、管理员发布操作或已发布课程到真实练习的完整教学链路。这些仍属于 `PILOT_ACCEPTANCE.md`，不影响此次缺字段故障已恢复的结论。未新增、发布、删除题目或制造学生作答。
