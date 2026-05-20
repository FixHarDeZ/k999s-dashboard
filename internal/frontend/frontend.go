// Package frontend embeds the compiled React application.
package frontend

import "embed"

// FS holds the compiled React frontend (web/dist build output).
//
//go:embed all:dist
var FS embed.FS
