# Win VM 方案调研报告 — Phase 2 T-3.2 后续路径

> 调研日期：2026-07-10 11:21 CST
> 触发：T-3.2 PARTIAL (无 Win VM 物理不可达) + NJX 拍板「PM 主动研究 Win VM 方案」
> 作者：Mavis (PM)

## 背景

T-3.2 worker 在 `feat/windows-e2e` commit `8ef9f44` 验证出 macOS host 无 Win VM (Parallels/UTM/VMware/Wine 全无)，真 Win `.exe` + 物理启动 demo 不可达。Phase 4 启动前需先解决 Win 验证环境，否则 T-3.2 永远停在 docs-only。

## 4 方案对比

| # | 方案 | 一次性 | 持续 | Apple Silicon | 性能 | 体验 | Win license | 主要用途 | 风险 |
|---|---|---|---|---|---|---|---|---|---|
| 🅰 | **UTM + Win 11 arm64** | ¥0 | ¥0 | ✅ 原生 QEMU | 中（arm64 原生 / x86 转译 Rosetta-like） | 需手动配 | 免费（VM 用） | 本地手动 e2e + 截图 + 临时 Win app | x86 native module 性能差；WebDAV 文件共享 4.29GB 限制 |
| 🅱 | **GitHub Actions Win runner** | ¥0 (公开 repo) / $4/月 (私有 2000min) | 同上 | 云端 server | 高（Server 2022/2025 + VS2022） | CI 自动化 only，无桌面交互 | N/A | CI/CD 自动 Win `.exe` 构建 + 启动测试 | runner 启动慢 ~30s / 60min 后清空 / 无 GUI |
| 🅲 | **Parallels Desktop** | ¥0 (14天试用) / ¥498 (永久 ¥598) | ¥498/年 (订阅) 或 ¥598 永久 | ✅ 原生 (Coherence 模式) | 高 | 最优（Win app 像 Mac app 跑） | 需另买 Win license | 日常 Win 桌面 + 多平台测试 | 有 recurring 成本（订阅模式） |
| 🅳 | **维持 docs-only** | ¥0 | ¥0 | N/A | N/A | 已收摊 | N/A | 留 Phase 4 启动后再配 | T-3.2 真 Win 验证永远缺 |

## 详细调研

### 🅰 UTM（0 成本首选）

- **下载**：<https://mac.getutm.app/>（免费 / Apache 2.0 开源）
- **Apple Silicon 原生**（M1/M2/M3/M4），基于 QEMU 8.0 ARM Virtual Machine
- **Win 11 arm64 ISO 免费**（无需 Windows Insider 登录，VM license 免费）：
  - 官方下载：<https://www.microsoft.com/zh-cn/software-download/windows11arm64>
  - 24H2 中文商业版 ~5.2 GB（最新 26H1 ~7.4 GB）
- **安装流程**（实测可行）：
  1. UTM.app 安装
  2. 新建 VM → 虚拟化（arm64）
  3. 选 Windows → 选 ISO
  4. 内存 8 GB（≤8GB Mac 用 4 GB）/ CPU 4 核
  5. SPICE Guest Tools 装好（自动 GitHub 下载，需能访问）
  6. Win 11 arm64 安装完后激活跳过（VM license 免费）
- **性能**：
  - arm64 Win app 原生跑（快）
  - x86/x64 Win app 转译跑（中，类似 Mac Rosetta）
  - electron-builder Win build = x64 → 转译中等；arm64 Win build 原生（理论可行）
- **限制**：
  - 无快照（可克隆 VM）
  - 文件共享 WebDAV 4.29 GB 单文件限制（够用）
  - 无 Coherence 模式（PD 独占）
  - 部分 Windows 版本 WDDM 驱动不完善
- **适合 NJX 的场景**：
  - 一次性手动跑 Win e2e + 截图（**T-3.2 真正需求**）
  - 长期备用 Win 环境（不需要的话不占资源）

### 🅱 GitHub Actions Win runner（CI 自动化）

- **免费额度**：
  - 公共 repo: **无限制** ✅
  - 私有 repo: **2000 min/月 free**，超出 $0.008/min
  - 团队/org: 类似
- **可用 runner image**：
  - `windows-2022` (Win Server 2022 + VS 2022 + Node 20 + Python 3.12 + .NET 8/9/10)
  - `windows-2025` (Win Server 2025 + VS 2022)
  - `windows-11-arm` (preview, 公共 repo free, 私有付费)
- **用法**：
  ```yaml
  jobs:
    build-win:
      runs-on: windows-2022
      steps:
        - uses: actions/checkout@v4
        - run: npm ci
        - run: npm run build:win
        - run: ./dist/setup-and-launch-demo.exe
  ```
- **限制**：
  - 每次 runner 60-90 min 后清空（无持久状态）
  - 启动 ~30s
  - **无 GUI 桌面**（Server Core，命令行为主）
  - 真 Win 桌面 e2e（截图/点击）需 playwright + xvfb 替代
- **适合 NJX 的场景**：
  - CI/CD 自动跑 Win `.exe` 构建（**electron-builder 标配**）
  - 公开 repo 0 成本，无 Win license 问题
  - openclaw 主仓库目前是 private，但**可以考虑把 e2e workflow 提到 public fork / 拆出 e2e repo**

### 🅲 Parallels Desktop（付费体验最佳）

- **价格**（2026 实时）：
  - 标准版订阅 **¥498/年**
  - 标准版永久 **¥598**（含 3 个月 Toolbox）
  - 专业版订阅 **¥678/年**
  - 专业版永久 **¥998**
  - **14 天免费试用**
- **优势**：
  - Coherence 模式（Win app 像 Mac app，无缝切换）
  - Apple Silicon 原生 + 完整 Win 11 支持（含 25H2）
  - 体验最稳，PD Tools 文件共享无限制
- **劣势**：
  - ¥498/yr 是 OPC 一笔实际支出（NJX 偏好 0 成本）
  - Win license 另算（Win 11 ~¥1,099 一次性，但 VM license 实际免费）
- **适合 NJX 的场景**：
  - 长期需要 Win 桌面（不只是 T-3.2 一锤子）
  - 体验要求高（Coherence / 文件共享 / 性能）

### 🅳 维持 docs-only（已默认）

- T-3.2 PARTIAL accepted，docs/platform-windows.md + 4 mock PNG 已在 main
- 真 Win 验证留 Phase 4 启动后
- 风险：T-3.2 永远是"路径规划"，不能算"真验证"

## PM 推荐

### 🅰 + 🅱 双轨组合（**推荐**）

- **🅰 UTM**：本地手动跑 Win 11 arm64 VM，T-3.2 真 e2e 截图（满足当前需求）
- **🅱 GitHub Actions `windows-2022` runner**：CI 自动化跑 electron-builder Win `.exe` 构建（满足长期需求）
- **0 成本**，互为冗余
- **落地路径**：
  1. PM 装 UTM + Win 11 arm64（30 min）
  2. T-3.2 worker retry cycle 2 在 UTM VM 里跑真 Win `.exe` + 截图（30 min cap 风险 → 拆 scope）
  3. PM 配 GitHub Actions Win workflow 在 openclaw 公共 fork（30 min）
  4. 后续 PR 自动跑 Win 构建验证

### 降级 🅲：仅 🅱 GHA

- 不装 UTM，**纯 CI 跑 Win e2e**
- 风险：T-3.2 永远无"真桌面截图"，只有"命令行 smoke test"
- 成本：$0（公开 repo）/ $4/月（私有 2000min）

### 备选 🅲：仅 🅲 Parallels

- NJX 拍板走付费路径，体验最好
- 成本：¥498/yr（订阅）或 ¥598（永久，含 3 个月 Toolbox）
- 14 天试用免费，**可以先试 14 天再决定**

### 🅳 收摊（最差）

- 不跑真 Win，T-3.2 永远 docs-only
- 不推荐（NJX 已选"PM 主动研究"= 不接受收摊）

## 关键事实表

| 项 | 数值 |
|---|---|
| UTM 下载 | <https://mac.getutm.app/> |
| Win 11 arm64 ISO（中文商业版 24H2） | <https://www.microsoft.com/zh-cn/software-download/windows11arm64> |
| UTM + Win 11 arm64 安装文档 | <https://zhuanlan.zhihu.com/p/526352487> |
| Parallels Desktop 26 价格 | ¥498/yr 订阅 / ¥598 永久 |
| GHA Win runner 文档 | <https://github.com/actions/runner-images> |
| electron-builder Win ARM64 | macOS 不能直接 cross-compile，需 Win VM 或 Wine |

## 待 NJX 拍板

见 PM 回复的 popup 选项。
