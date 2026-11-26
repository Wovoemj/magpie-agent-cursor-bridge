param([Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$source = Join-Path $PSScriptRoot 'cursor-extension'
$manifest = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
$name = $manifest.name
$publisher = $manifest.publisher
$target = [IO.Path]::GetFullPath($OutputFile)
$types = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="txt" ContentType="text/plain"/></Types>'
$vsix = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="zh-CN" Id="$name" Version="$version" Publisher="$publisher"/><DisplayName>Magpie · Cursor 原生模型</DisplayName><Description xml:space="preserve">在 Cursor 原生模型设置中配置和选择 Magpie 模型。</Description><Tags>cursor,magpie,byok</Tags><Categories>Other</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($manifest.engines.vscode)"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui"/></Properties><License>extension/LICENSE.txt</License></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/></Assets></PackageManifest>
"@
$encoding = [Text.UTF8Encoding]::new($false)
$inputs = [ordered]@{
  '[Content_Types].xml' = $encoding.GetBytes($types)
  'extension.vsixmanifest' = $encoding.GetBytes($vsix)
  'extension/package.json' = [IO.File]::ReadAllBytes((Join-Path $source 'package.json'))
  'extension/catalog.cjs' = [IO.File]::ReadAllBytes((Join-Path $source 'catalog.cjs'))
  'extension/follow.cjs' = [IO.File]::ReadAllBytes((Join-Path $source 'follow.cjs'))
  'extension/route.cjs' = [IO.File]::ReadAllBytes((Join-Path $source 'route.cjs'))
  'extension/window-owner.cjs' = [IO.File]::ReadAllBytes((Join-Path $source 'window-owner.cjs'))
  'extension/extension.cjs' = [IO.File]::ReadAllBytes((Join-Path $source 'extension.cjs'))
  'extension/README.md' = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'README.md'))
  'extension/LICENSE.txt' = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'LICENSE'))
}
$file = [IO.File]::Open($target, [IO.FileMode]::CreateNew)
try {
  $zip = [IO.Compression.ZipArchive]::new($file, [IO.Compression.ZipArchiveMode]::Create, $true)
  try {
    foreach($part in $inputs.GetEnumerator()) {
      $entry = $zip.CreateEntry($part.Key, [IO.Compression.CompressionLevel]::Optimal)
      $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
      $stream = $entry.Open()
      try { $stream.Write($part.Value, 0, $part.Value.Length) } finally { $stream.Dispose() }
    }
  } finally { $zip.Dispose() }
} finally { $file.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($target)
try {
  if ($check.Entries.Count -ne $inputs.Count) { throw 'Invalid VSIX entry count' }
  foreach($part in $inputs.GetEnumerator()) {
    $inputStream = $check.GetEntry($part.Key).Open()
    $buffer = [IO.MemoryStream]::new()
    try {
      $inputStream.CopyTo($buffer)
      if ([Convert]::ToBase64String($buffer.ToArray()) -cne [Convert]::ToBase64String($part.Value)) { throw "VSIX readback mismatch: $($part.Key)" }
    } finally { $inputStream.Dispose(); $buffer.Dispose() }
  }
} finally { $check.Dispose() }
Write-Output "Verified VSIX $target ($($inputs.Count) entries)"
