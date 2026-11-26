# Cursor · Magpie 桥接

|  |  |
| --- | --- |
| 仓库 | [Wovoemj/magpie-agent-cursor-bridge](https://github.com/Wovoemj/magpie-agent-cursor-bridge) |
| 版本 | v0.3.0 |
| 更新于 | 2026 年 11 月 25 日 |
| 源码 | `D:\Codex会话\magpie-editor-bridges\magpie-agent-cursor-bridge` |
| Magpie 里显示为 | **Cursor · Magpie 桥接**（Agents 页面） |
| 安装 | `magpie plugin add npm:magpie-agent-cursor-bridge` |

让 Cursor 直接使用 Magpie 里配置的全部模型与路由组。模型菜单返回 Magpie 实时完整目录，可以在 Cursor 内直接切换任意模型；隐藏 Cursor 自带的 Auto 入口，保留 Cursor 原有登录与订阅，不替换客户端、不改 `app.asar`。

本机定制版本为 0.3.0，源码路径：`D:\Codex会话\magpie-editor-bridges\magpie-agent-cursor-bridge`。Magpie 的 Agents 页面显示 **Cursor · Magpie 桥接**。

内置 [polang233/cursor-language-pack](https://github.com/polang233/cursor-language-pack) 1.3.0 完整汉化安装器，覆盖标准菜单、Cursor 设置与 Agent 界面，支持 `zh-cn` / `zh-tw` / `ja`；未指定显示语言时默认 `zh-cn`，已有的语言选择与 JSONC 注释原样保留。

思路与 `magpie-agent-raccoon-bridge`、`magpie-agent-trae-bridge` 一致，但按 Cursor 实际的取模方式来适配。

## 为什么这里需要本地 TLS 代理

小浣熊不需要代理，因为它的模型菜单由一份「模型方案」列表驱动，每条方案自带 `remoteBaseUrl` / `remoteApiKey` / `remoteModelId`——那是原生的自带端点通路。Cursor 不是这样：

- Cursor 的对话流量被钉在厂商域名（`api2.cursor.sh` 一族），客户端只允许通过 `http.proxy` 改写出口；
- 这个出口只接受 TLS，并且模型目录由 Cursor 自己按 `/v1/models` 的返回形状拉取；
- 所以在 `127.0.0.1` 上起一个**只监听回环地址**的 TLS 中继，用本机自签的根证书接管这一段连接，只把上游 Host 重写到 Magpie 网关，其余流量原样直连。

因此：不需要证书以外的东西、不碰 Cursor 登录、不引入任何外部中转服务，断开或卸载时按 journal 逐字节还原 Cursor 原来的代理设置。

## 工作流

```text
Magpie Agent 插件（cursor-bridge） → 在 Agents 页面选定模型 / 路由组 → 写 connection.json
                                        ↓
后台 supervisor（15s 心跳）
 ├── 探测网关 GET /v1/models → 同步 Magpie 的模型与路由组
 ├── 维护 Cursor settings.json 的 http.proxy（只写这一个键）
 └── 断开 / 卸载时按 journal 还原，含托盘自启项
                                        ↓
Cursor ──[127.0.0.1 TLS 回环中继 + 本机根证书]──> 桥接引擎 ──[OpenAI 兼容]──> Magpie 网关 127.0.0.1:3425 ──> 各提供方
```

- 数据目录：`%USERPROFILE%\.config\magpie-cursor-bridge\`（macOS 为 `~/.config/magpie-cursor-bridge/`）
- 自启：Windows 走当前用户 Startup 目录无窗口后台执行；macOS 走用户级 `launchd` LaunchAgent。

## 中文界面

- 显示语言默认 `zh-cn`，且只在你没有明确选择语言时写入；已有 `locale` 一律尊重。
- 语言包沿用上游安装器：备份原始程序文件、写补丁记录、安装并核对 VSIX、移除冲突的 Microsoft 语言包；步骤不完整时明确报错，而不是假装成功。
- Cursor 版本不在语言包验证清单内（当前清单为 3.30.14）时给出警告并继续安装，新增文案可能仍显示英文。
- 汉化需要**完全退出 Cursor 后重新打开**，重载窗口不足以加载全部语言资源；Cursor 每次升级后需重新执行一次安装。

## 安装

```text
magpie plugin add npm:magpie-agent-cursor-bridge
```

或在 Magpie → Plugins 里搜索 **Cursor · Magpie 桥接** 直接安装。

前置条件：本机已装 Cursor 与 Magpie，Magpie 里至少有一个可用模型或路由组，安装前先完整退出 Cursor。

| 操作 | Windows | macOS |
| :--- | :--- | :--- |
| 初始化 / 更新 | `powershell -ExecutionPolicy Bypass -File setup.ps1` | `bash setup.command` |
| 查看状态 | `setup.ps1 status` | `setup.command status` |
| 卸载并还原 | `setup.ps1 uninstall` | `setup.command uninstall` |

首次初始化会请求信任本机生成的根证书（系统标准确认窗口里选「是」/「始终信任」）。随后在 Magpie 的 Agents 页面打开 **Cursor · Magpie 桥接** 并选择模型，等状态变为已连接，回到 Cursor 点一下模型下拉框即可看到 Magpie 的模型，无需重启。

## 兼容性

| 项目 | 范围 |
| --- | --- |
| 平台 | Windows x64、Apple Silicon macOS |
| Cursor | 3.29 – 3.31 实测可用；语言包上游验证到 3.30.14 |
| Magpie | OpenAI 兼容网关，默认 `127.0.0.1:3425` |
| 中文包 | 1.3.0（`zh-cn` / `zh-tw` / `ja`） |

## 常见问题

- **模型列表没更新**：后台同步每 15 秒一轮，首次启动需等几十秒；再点一次模型下拉框即可，重启只是强制刷新的一种方式。
- **界面仍有英文**：确认已完全退出 Cursor（含残留后台进程）后重开；或确认安装的是 1.3.0 语言包。
- **网关没启动**：中继对非 Magpie 流量直连放行，Cursor 自身功能不受影响，只是 Magpie 模型不可用。

## 协议

本项目遵循 [MIT License](LICENSE)。原生协议核心来源于 cursor-byok（MIT License）；中文语言包来源于 polang233/cursor-language-pack，版权归其作者所有，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
