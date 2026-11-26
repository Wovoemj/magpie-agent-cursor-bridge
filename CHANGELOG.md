# 版本记录

## 0.6.0 — Cursor 原生模型热切换

- Magpie 的 Agent 开关和模型选择会同步到已经打开的 Cursor 原生聊天。关闭时切回用户首次指定的模型；不猜测上一个模型，也不打断已经发送的请求。
- 支持专用的单成员模型组。固定 ID 只需在 Cursor 中添加一次，以后在 Magpie 换成员。保留手动添加过的单个模型 ID 的接入方式。
- 可选简体中文语言包 `polang233.cursor-language-pack@1.3.0`。本版不分发或运行旧版根证书、TLS 中继及代理安装器。
- 验证范围：14 项离线测试；隔离的 Cursor 原生聊天热切换和关闭恢复；本地模拟供应商经真实 Magpie 网关的 A/B 路由。尚未验证真实线上原生聊天推理。

此前版本保存在 [Git 标签](https://github.com/Wovoemj/magpie-agent-cursor-bridge/tags)中。
