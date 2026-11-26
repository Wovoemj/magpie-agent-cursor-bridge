# Cursor 原生模型（中文） · Magpie 热切换

在 **Magpie → Agents → Cursor 原生模型（中文）** 选择模型，已经打开的 Cursor 聊天不用重启，也不用在 Cursor 再选一遍。不使用 `ask_magpie`、代理、流量拦截或根证书。

[下载 v0.6.0](https://github.com/Wovoemj/magpie-agent-cursor-bridge/releases/tag/v0.6.0) · [版本记录](CHANGELOG.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

| 你在 Magpie 的操作 | 已打开的 Cursor 聊天 |
| --- | --- |
| 打开开关，选 A | 切到 A；首次接管前只问一次，关闭时要切回哪个 Cursor 模型。取消不会改变当前模型。 |
| 从 A 改为 B | 下一条新请求改用 B。在途回复不迁移。使用固定模型组时，Cursor 菜单显示同一个组 ID，不随成员改名。 |
| 关闭开关或选“默认” | 切回你指定的 Cursor 原生模型并停止跟随。不会把“关闭”擅自理解成 Auto，也不会清除你原有的 BYOK 设置。 |

## 首次接入（Windows）

1. 从发布页下载 `magpie-agent-cursor-bridge-0.6.0.tgz`，解压到你准备长期保留的空目录，在解压出的 `package` 目录运行 `magpie plugin add .`。在 Cursor 的扩展菜单选择 **从 VSIX 安装**，打开 `assets/magpie-cursor-native-models-0.6.0.vsix`。如需简体中文，再安装同目录的 `cursor-language-pack-1.3.0.vsix`；已有中文不用重装。首次安装若提示重载窗口，按提示操作；之后切模型不用重载。这种安装方式不依赖 npm 搜索。
2. **先核对地址。** 普通 Cursor 的[原生 BYOK 请求经过 Cursor 后端](https://cursor.com/help/models-and-usage/api-keys)。需要一个你控制、Cursor 可访问的 **Magpie HTTPS `/v1` 网关**和一个单独配发的受限密钥。只有本机回环或局域网地址不够；已经在 Magpie 配好的供应商密钥不用重填。插件不创建公网入口、不接触供应商密钥、不自动覆盖 Cursor 的地址或密钥。
3. 在 Cursor 命令面板运行一次 **Magpie：配置原生模型**。同意后助手在 Magpie 创建专用的单成员模型组，并复制它的 `group/cursor-hot-…` ID。到 **Cursor Settings → Models** 手动设置兼容网关与专用密钥，再用 **Add Custom Model** 添加这个固定 ID **一次**；以后无需逐个添加 A、B。关闭时建议选择不经过这个 BYOK 出口的 Cursor 原生模型。
4. 保持一个原生聊天打开，回到 Magpie 打开开关、选择模型。首次在 Cursor 选择关闭时使用的模型（Auto 或具体 ID），之后可以一直留在 Magpie 切 A/B。已在 Cursor 添加过各模型 ID 的旧配置也可直接跟随，不创建模型组；没有添加、被组织禁用或不兼容的 ID 不能保证可用。

只跟随最近使用的 Cursor 窗口；有并排聊天或没有打开的聊天时暂停，不自动创建聊天。实际切回的对象是首次指定的模型，不是从私人聊天或数据库猜出的上一个模型；不会回滚第三方密钥或尽力重播已经发送的消息。修改该选项使用 **Magpie：设置关闭时使用的 Cursor 模型**。已开始的接管使用当时记录的返回模型。

**从 0.3.x 升级：** 如果启用过旧版，先在 Magpie 关闭旧的 Agent，并按原版本的卸载说明恢复原设置，再启用本版。安装新版不会自动清理旧代理或证书，也不会重启你的 Cursor。旧版源码保留在历史标签，不随 0.6.0 分发。

## 验证及边界

- 插件读取 Magpie 自己写出的 `~/.config/magpie-cursor-native/selection.json`。开启、切换、默认、缺失文件和原子替换都会处理。无效或不完整的文件不作断开处理。
- Cursor 状态栏里的模型名是控制状态，**不是推理回执**。可在你自己的可达网关上发一条无敏感信息的新问题，对照 Magpie 用量明细的时间、实际供应商及模型。Tab 补全、其他聊天窗口、已经开始的生成不在范围内。
- 在源码目录运行 `npm test` 可重复离线测试。已在 Cursor 3.31.15 / Magpie 0.1.4572 的隔离配置中读回同一聊天的 A → B → 指定原生模型，并向本地测试供应商验证固定组分别返回 A、B。未通过真实 Cursor 原生聊天向线上供应商发送请求。`test/cursor-smoke.cjs` 使用的测试只读接口不在正式插件中；插件不读取聊天正文。GitHub 公开发行不等于已被 Magpie 插件搜索收录。
