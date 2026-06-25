package stdlib

import (
	"embed"
	"path"
	"strings"
)

//go:embed stdlib
var files embed.FS

func Resolve(importPath string) ([]byte, bool) {
	if !strings.HasPrefix(importPath, "std/") {
		return nil, false
	}
	rel := strings.TrimPrefix(importPath, "std/")
	if rel == "" || strings.Contains(rel, "..") {
		return nil, false
	}
	content, err := files.ReadFile(path.Join("stdlib", rel+".delta"))
	if err != nil {
		return nil, false
	}
	return content, true
}
