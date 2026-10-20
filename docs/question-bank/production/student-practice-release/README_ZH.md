# 学生真实练习：本次上线入口

本 PR 汇总基础闭环、随机去重复、Topic 内自适应及 AI workflow v3。第一阶段仍只上线基础闭环和随机去重复；使用现有真实题，不等待扩题，暂不部署 Topic 自适应。前端兼容没有自适应摘要的基础接口。代码合并、数据库部署、前端部署、真实题发布和普通账号验收分别记录。

## 1. 只读核对

确认 Dashboard 项目为 `lxoaeaewcrshjkigzyqe`，执行本目录 `00_preflight_readonly.sql` 全文。它只返回迁移指纹和结构是否存在，不返回题目或学生数据。

- `matches`：运行该阶段已有只读核验；通过后跳过部署，不能重跑。
- `absent`：确认前置阶段通过、没有部分安装，再执行该阶段部署包。
- `ledger_mismatch`：停止部署，查明实际迁移与代码差异；不能改账本或重跑历史 SQL。
- 学生基础迁移 absent 但任一 practice table / start RPC 已存在：视为部分安装，先调查。
- `adaptive_present=true`：与本次发布范围不符，先确认实际部署；不能用旧随机 SQL覆盖已部署自适应。

## 2. 数据库、PR 和前端顺序

在合并前完成本分支回归，确保前端部署已就绪。依次只补缺失迁移，每步核验通过再继续：

| 阶段 | 完整执行包 | 独立只读核验 |
| --- | --- | --- |
| 简化发布 | [10_deploy.sql](../simple-publication/10_deploy.sql) | [20_verify_readonly.sql](../simple-publication/20_verify_readonly.sql) |
| 学生基础闭环 | [10_deploy.sql](../student-practice/10_deploy.sql) | [20_verify_readonly.sql](../student-practice/20_verify_readonly.sql)，11 项全部通过 |
| 随机去重复 | [10_random_deploy.sql](../practice-selection/10_random_deploy.sql) | [11_random_verify.sql](../practice-selection/11_random_verify.sql)，4 项全部通过 |

简化发布核验中的 `all_catalog_checks_pass` 和 `all_ledger_checks_pass` 均须 true；另外两阶段要求 `all_checks_pass=true`。不执行整库 db push，不重跑 Task 4 / taxonomy / Team 迁移，不执行 `20_adaptive_deploy.sql`。

随后合并本 PR并部署其前端；记录实际部署 commit，刷新 Admin 和 Practice。简化发布更新会改变人工确认入参，数据库与匹配前端应紧邻上线；旧页面仍打开时需要刷新。已合并的 Team/Admin 兼容修复必须保留，Team 成员升级不是学生练习依赖。

基础闭环普通账号线上验收通过后，再按 [Topic 内自适应上线说明](../practice-selection/README_ZH.md#topic-内自适应) 单独安排自适应迁移和验收；合并代码不代表该迁移已执行。AI workflow v3 是后续调整的文档基线，尚未用新批次验证效率。

## 3. 现有真实题人工审核与发布

在生产 Admin 先清点 Saved drafts / Published problems，记录现存题目和版本；无需重新导入同一批题。以保存后的当前题目和标签为准，不用旧 XLSX 覆盖人工修改。

逐题核对来源、独立数学解答、唯一正确选项、解析、Topic/Skills、难度、AB/BC、计算器政策、必要图片及桌面/手机公式显示。来源和使用依据需确认；未知信息不补造。AI 保留 pending，不代写审核人或代替最终人工确认。

问题题留草稿并记录原因；你或指定审核人确认合格后，经现有 Publish 流程发布。刷新核实题目状态、current_version_id 和学生入口计数。发布清单至少记录 question_id、version_id、Topic、批准人及发布状态；不能把历史 8 题候选数当成实际批准数。

## 4. 普通账号 A/B 验收

使用两个真实普通账号，不能用管理员权限代替：

1. A 获取实际已发布题，每组最多 5 题；不足按实际数量返回，零题无示例替代。
2. 未提交题目的网络响应不含答案、解析、is_correct 或导入证据。
3. 在不同会话分别测试正确和错误选择；结果、解析和账户记录一致。重复提交不新增记录，不同选项不能覆盖。
4. 刷新同一会话保留题目、精确版本和已保存结果；Practice 最近作答可重新进入。
5. 下一组优先未发题；不足时补旧题，同组唯一，刷新不重新抽题。
6. A 退出后内容清除；B 无法通过旧链接或接口读取 A 的会话/作答；换回 A 能恢复。B 已有自己的记录无需为空。
7. 网络失败不误报保存成功；请求结果未知时查询已保存结果后恢复。桌面和手机的公式、选项、图片及解析可读。

记录实际前端 commit、三个阶段核验结果、实际发布清单、A/B 验收截图与结果。全部通过才标记上线完成。内容缺陷通过撤回阻止新发题，再修订审核；保留历史版本和作答，不删表回滚。

## 已核实状态

2026-10-19 已在生产补齐学生练习和随机取题迁移，分别通过 11/11、4/4 独立核验；最终三阶段指纹均 matches，未部署自适应。8 道已发布真实题的当前版本和审核指纹均匹配。普通账号 A 已通过取题、对错判分、解析、刷新、历史和退出检查；账号 B 的旧链接、读/提交接口与记录隔离、换回 A 恢复及反向隔离也均已通过。详见 [生产修复记录](PRODUCTION_ACCEPTANCE_2026-10-19.md)，历史本地检查见 [VALIDATION.md](VALIDATION.md)。
