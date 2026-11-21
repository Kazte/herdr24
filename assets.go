// Package herdr24 contains the native runtime files shipped by the installer.
package herdr24

import "embed"

// Assets contains runtime files only; editor-generated sidecars are excluded.
//
//go:embed layouts/herdr24.json themes/*.json mods/*/main.js mods/*/mod.json mods/*/ui.js
var Assets embed.FS
