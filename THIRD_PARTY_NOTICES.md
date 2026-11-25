# Third-party notices

The native bridge derives from [leookun/cursor-byok](https://github.com/leookun/cursor-byok), MIT, copyright 2026 leookun, tag v1.0.1, commit 2068ab20513288e6a0289d33febe872a30608610. Its license is included as LICENSE. The exact source changes are in source.patch. Dependency versions are pinned by upstream Cargo.lock.

The supervisor uses jsonc-parser 3.3.1, MIT, copyright Microsoft Corporation; its license is included in node_modules/jsonc-parser/LICENSE.md. Dependencies of the native executable retain their respective licenses in their source packages.

Magpie is a separate installed application; this package uses its public Agent Plugin interface. Compatibility was developed against v0.1.1220. This package does not bundle Magpie or Cursor.

The complete Chinese localization uses [polang233/cursor-language-pack](https://github.com/polang233/cursor-language-pack), MIT, version 1.3.0 (the published npm release for that version, verified against Cursor 3.30.14). Its installer, bundled VSIX, LICENSE and NOTICE are distributed unchanged under vendor/cursor-language-pack. Workbench translations originate from the MIT-licensed microsoft/vscode-loc snapshot pinned by that project's config.json.
