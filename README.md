# AI Orbit｜账号关系可视化原型

把多个 AI 官号分散的公开关注列表，转成一张可搜索、可解释、可写回运营动作的 3D 关系地图。

[主站演示](https://liyichao-ai-orbit.liyichao0215.chatgpt.site) · [GitHub Pages 备用站](https://liyichao0215-pixel.github.io/ai-orbit-account-map/) · [60 秒演示入口](https://liyichao-ai-orbit.liyichao0215.chatgpt.site)

![AI Orbit 全局关系图](./public/screenshots/overview.png)

## 这是一个什么项目

矩阵运营面对的不是“找不到账号”，而是多个官号的关注关系彼此分散，很难发现共同关注对象，也很难解释为什么先研究某个账号。

这个原型完成了四件事：

1. 把 16 个 AI 产品官号及其一跳关注关系建模为 Node / Link；
2. 用关系社区和 Fibonacci Sphere 展开 3D 节点空间；
3. 用影响力、品牌共识、内容匹配形成可解释的 S/A 初筛；
4. 把候选写入本机运营清单，补充负责人、状态、备注和下一步，并导出 CSV。

它不是自动建联工具、达人 CRM 或已经验证业务收益的成熟产品。

## 在线版本

| 版本 | 地址 | 用途 |
|---|---|---|
| 主站 | [liyichao-ai-orbit.liyichao0215.chatgpt.site](https://liyichao-ai-orbit.liyichao0215.chatgpt.site) | 面试演示与作品集主入口 |
| 备用站 | [liyichao0215-pixel.github.io/ai-orbit-account-map](https://liyichao0215-pixel.github.io/ai-orbit-account-map/) | GitHub Pages 静态备份 |
| 源代码 | [github.com/liyichao0215-pixel/ai-orbit-account-map](https://github.com/liyichao0215-pixel/ai-orbit-account-map) | 代码、PRD、规则与迭代证据 |

## 面试时的 60 秒讲法

1. **问题**：运营需要从 1,809 个账号中找到值得继续人工核验的人。
2. **关系**：把 16 个官号的 2,410 条公开关注关系放进同一张图。
3. **初筛**：只看 44 个 S 级与 81 个 A 级公开候选。
4. **证据**：以 INK 为例，88 分、5 个官号共同关注，详情能拆出每项得分。
5. **行动与边界**：加入本机运营清单，但不自动触达；快照、评分和真人验证限制都明确展示。

网页顶部的“60 秒演示”会按这五步切换视图。

![公开 S/A 候选雷达](./public/screenshots/radar.png)

![候选详情与可解释评分](./public/screenshots/detail.png)

## 连续追问七个为什么

```text
账号信息为什么难用
→ 为什么使用官号关注关系
→ 为什么分析共同关注与社区
→ 为什么使用球形 3D
→ 为什么还要可解释评分
→ 为什么必须有隐私与数据契约
→ 为什么最终要形成运营写回闭环
```

完整因果链见 [连续追问七个为什么](./docs/连续追问七个为什么-项目思维链路.md)。

## S/A 筛选逻辑

先过资格门槛：

- 粉丝量在 2,000–5,000,000 之间；
- 内容匹配至少 8 分；
- 未通过门槛进入 WATCH。

再计算：

```text
总分 = 粉丝影响力（最高 45）
     + 核心官号共同关注（最高 35）
     + 简介内容匹配（最高 20）

S：总分 ≥ 75
A：65 ≤ 总分 < 75
B：55 ≤ 总分 < 65
```

影响力使用粉丝量对数归一；品牌共识最多计算 4 个官号；内容信号为 AI 相关 +9、创作人 +8、行业建设者 +5，封顶 20。

这是一套可解释的产品假设，不是账号价值的客观结论。当前公开展示规则版本为 `outreach-v1.1`。

## 数据可信度与隐私

当前快照包含：

- 1,809 个账号节点；
- 2,410 条关注关系；
- 16 个公开官号；
- 44 个公开 S 级候选；
- 81 个公开 A 级候选；
- 1,668 个匿名 B/C/WATCH 账号。

分级在脱敏前确定并锁定。匿名账号移除身份、头像和外链，精确指标被扰动；前端不会用匿名名称或占位简介重新计算 S/A，避免产生虚假候选。

详细边界见 [DATA_POLICY.md](./DATA_POLICY.md) 与 [ATTRIBUTION.md](./ATTRIBUTION.md)。

## 技术结构

```text
授权图谱快照
  → shared/outreach-model.mjs        评分与公开展示契约
  → scripts/sanitize-graph.mjs       分层脱敏
  → public/data/graph.json           公开快照
  → app/graph.ts                     社区、球心、球面坐标
  → app/OrbitApp.tsx                 3D、搜索、雷达、详情、清单
  → localStorage / CSV               设备本地运营写回
```

关键文件：

- `app/graph.ts`：社区分配、球体中心、Fibonacci Sphere；
- `app/OrbitApp.tsx`：Three.js 节点、曲线、镜头与完整交互；
- `shared/outreach-model.mjs`：评分规则和匿名账号安全展示规则；
- `scripts/sanitize-graph.mjs`：官号 / S/A 公开，其余账号脱敏；
- `tests/rendered-html.test.mjs`：公开数据不变量和匿名账号不晋级测试。

## 用户研究状态

已经完成的是 **5 个 Agent 的角色化页面走查**，覆盖矩阵负责人、达人运营、实习生、一线运营和数据产品经理。它属于启发式预检，不是 5 位真人访谈，不能写成真实业务验证。

- [五角色模拟可用性测试报告](./docs/五角色模拟可用性测试报告.md)
- [真人可用性测试执行包](./docs/真人可用性测试执行包.md)

真人测试当前状态：**待执行**。

## 本地运行

需要 Node.js 22.13+ 与 pnpm：

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000/`。macOS 也可以双击 `启动本地网站.command`。

验证：

```bash
pnpm lint
pnpm test
pnpm build:pages
```

重新生成公开快照时，必须显式传入你有权访问的地址：

```bash
pnpm reload:snapshot -- "https://example.com/authorized-graph.json"
```

## 已知限制

- 数据是快照，不是实时平台数据；
- 关注关系不等于品牌背书或合作；
- 评分未经过真实回复率、合作率或内容表现校准；
- 3D 图适合探索，不一定适合高频批量操作；
- 运营清单只保存在当前浏览器，不支持账号登录和多人协作；
- 尚未完成 3–5 位真人运营者测试。

## 许可

项目源代码使用 [MIT License](./LICENSE)。许可证不授予第三方账号资料、头像、名称、商标或其他外部资产的权利。
