export const agent = {
  id: 'cursor-desktop-native',
  name: 'Cursor 原生模型（中文）',
  bin: 'cursor',
  dir: '~/.cursor',
  config: '~/.config/magpie-cursor-native/selection.json',
  format: 'json',
  model: 'model',
  notice: 'Cursor 热切换助手会跟随这里的选择，下一条新消息用新模型；关闭时切回首次指定的 Cursor 模型。需要先配置 Cursor 可达的 Magpie BYOK 网关。切模型不代表请求已接通。'
};

export function connect({ models }) {
  return { enabled: true, catalog: models.map(item => ({ id: item.id, name: item.name || item.id })) };
}
