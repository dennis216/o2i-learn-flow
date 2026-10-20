# Workflow v4 校验记录

范围：操作协议、prompt、SOP、Schema、空白模板Instructions、代码快照与离线分发包。基于2026-10-20当前工作树，不修改产品代码/数据库迁移，不查询生产。

## 对齐依据

- `src/lib/questionBankImport.ts`：三个sheet、28/6列表头、来源/图形、唯一答案、枚举、严格数学检查。
- `src/lib/questionBankDraftSave.ts`：草稿必填、规范引用、批次100题、pending可保存、导入证据保留。
- `src/lib/questionBankPreviewEdits.ts`：八项元数据，原XLSX不改。
- `src/lib/questionBankPublicationWorkflow.ts` 与 `20261020000000_question_bank_simple_publication.sql`：一次明确确认、最多20题、当前保存元数据、source_type/calculator可空、flags仍为证据。
- `20260920010000_ap_calculus_ced_framework.sql`：111个Topic、23个Skill的仓库种子快照，带源哈希；未重新核验外部CED内容或生产数据。

## 本地检查

- `npm run test:question-bank`：**82/82通过**。覆盖实际模板解析、草稿必填/证据保留、元数据编辑、重复ID、唯一答案、数学格式、一次发布确认和回读；这些测试不证明真实题数学正确。
- 模板只变更Instructions的B12、C12、C23、C28四个单元格；三个sheet、28/6列表头、空白数据表、全部单元格样式、行高/列宽、冻结窗格和数据验证与原文件一致。检查无Excel公式；更新说明区已用Artifact Tool渲染并查看。
- 代码快照：**111个Topic、23个Skill**，代码唯一，源文件哈希附在清单；语义正确性仍由人工审核。
- 构建脚本内置断言核对sheet/字段、模板无题、四段可复制文本（批次说明+三个prompt）、包内相对链接、ZIP完整性。包内MANIFEST记录每个交付文件的SHA-256。
- 静态HTML检查：可复制文本与Markdown原文逐字一致，七段目录标题和包内引用存在，无远程脚本/样式依赖；内联脚本通过Node语法检查。这不等于实际浏览器交互通过。
- `git diff --check`通过；本轮没有修改src、supabase或依赖声明。

浏览器验收未通过执行条件：沙箱内Chrome启动退出；获授权在本机重试后启动超时。备用浏览器拒绝file协议，安全策略要求停止此动作，未尝试绕过。**未验证复制按钮实际行为、浏览器剪贴板回退或手机宽度实际显示。**

重建命令（仓库根目录）：`node --experimental-strip-types scripts/question-bank/build-workflow-package.mjs`。只使用已安装的React/Markdown及平台zip/unzip，不新增依赖。脚本检查模板为空、完整字段/顺序、快照数量/代码唯一、包内链接，生成带逐文件SHA-256的MANIFEST.json并检测ZIP完整性。

## 未执行与限制

- 未用v4处理新的真实PDF，没有数学正确率或审核耗时统计。
- 未替人工选择题目、确认使用许可或生成正式审核记录。
- 未连接Admin/生产数据库、导入真实题、发布、部署或验收学生页面。
- 两AI可能同错，必须保留人工独立核实；外部JSON须单独归档，不能声称后台自动保存。
- 旧V1/V2/无版本号ZIP保留为历史文件；当前入口指向V4。原有三份未跟踪V1文件未纳入或覆盖。
