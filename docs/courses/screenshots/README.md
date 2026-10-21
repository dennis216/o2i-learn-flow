# 本地使用效果截图

不是线上样板。正式 YouTube URL 和 HTML 尚未提供。

- [后台维护](admin.png)：真实本地 Auth/REST/数据库；课程、Topic、共享视频提示、HTML 上传入口和发布开关。
- [学生课程目录](student.png)：真实规范 Unit/Topic，展开 1.5；视频区域为明确标注的本地播放器替身，没有验证 YouTube 实际播放。
- [视频与 Practice 入口](topic-practice.png)：同一课内的练习按钮及后续 Topic 标题。
- [手机](phone.png)、[平板](tablet.png)：同一真实本地数据库的响应式页面，播放器在切换布局后重新挂载。
- [练习保存](practice.png)：临时数据库中的合成测试题，经现有服务器判分后保存；不代表真实教学题或真实学生成绩。
- [小游戏](game.png)：UI/网络模拟测试中的单文件 HTML，实际执行内联脚本并验证 iframe 隔离；不是团队的正式游戏。

私有 Storage RLS 已另外通过真实 PostgreSQL 策略测试；这些截图本身不能证明生产存储上传或生产访问权限。
