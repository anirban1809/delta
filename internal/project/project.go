package project

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

type TargetConfig struct {
	Backend  string `json:"backend"`
	Standard string `json:"standard"`
	Compiler string `json:"compiler"`
}

type BuildMode struct {
	Output string `json:"output"`
}

type Manifest struct {
	Name          string               `json:"name"`
	Version       string               `json:"version"`
	SchemaVersion int                  `json:"schemaVersion"`
	Entry         string               `json:"entry"`
	Target        TargetConfig         `json:"target"`
	Build         map[string]BuildMode `json:"build"`
}

type Project struct {
	Root          string
	Entry         string
	EntryRelative string
	Mode          string
	Manifest      *Manifest
}

type InitOptions struct {
	Dir   string
	Name  string
	NoSrc bool
}

func ReadManifest(path string) (*Manifest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	stripped, err := stripJSONC(raw)
	if err != nil {
		return nil, err
	}
	var m Manifest
	dec := json.NewDecoder(bytes.NewReader(stripped))
	if err := dec.Decode(&m); err != nil {
		return nil, err
	}
	if m.SchemaVersion != 0 && m.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported schemaVersion %d", m.SchemaVersion)
	}
	if strings.TrimSpace(m.Entry) == "" {
		return nil, fmt.Errorf("manifest missing entry")
	}
	return &m, nil
}

func Resolve(arg, mode string) (*Project, error) {
	if mode == "" {
		mode = "debug"
	}
	if arg == "" {
		wd, err := os.Getwd()
		if err != nil {
			return nil, err
		}
		return resolveManifest(wd, mode)
	}
	abs, err := filepath.Abs(arg)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(abs)
	if err == nil && info.IsDir() {
		return resolveManifest(abs, mode)
	}
	if filepath.Ext(abs) != ".delta" {
		return nil, fmt.Errorf("invalid extension: must be .delta")
	}
	root := filepath.Dir(abs)
	return &Project{
		Root:          root,
		Entry:         abs,
		EntryRelative: filepath.Base(abs),
		Mode:          mode,
	}, nil
}

func resolveManifest(dir, mode string) (*Project, error) {
	path := filepath.Join(dir, "delta.json")
	m, err := ReadManifest(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no delta.json manifest found and no source file given")
		}
		return nil, err
	}
	entry := filepath.Clean(m.Entry)
	if filepath.IsAbs(entry) {
		return nil, fmt.Errorf("manifest entry must be relative")
	}
	abs := filepath.Join(dir, entry)
	if filepath.Ext(abs) != ".delta" {
		return nil, fmt.Errorf("manifest entry must be a .delta file")
	}
	return &Project{
		Root:          dir,
		Entry:         abs,
		EntryRelative: filepath.ToSlash(entry),
		Mode:          mode,
		Manifest:      m,
	}, nil
}

func (p *Project) CDir() string {
	return filepath.Join(p.Root, "build", p.Mode, "c")
}

func (p *Project) ObjDir() string {
	return filepath.Join(p.Root, "build", p.Mode, "obj")
}

func (p *Project) BinDir() string {
	return filepath.Join(p.Root, "build", p.Mode, "bin")
}

func (p *Project) BinaryPath() string {
	base := strings.TrimSuffix(filepath.Base(p.Entry), ".delta")
	return filepath.Join(p.BinDir(), base)
}

func ModuleID(projectRoot, absPath string) string {
	rel, err := filepath.Rel(projectRoot, absPath)
	if err != nil {
		rel = filepath.Base(absPath)
	}
	rel = strings.TrimSuffix(filepath.ToSlash(rel), ".delta")
	var b strings.Builder
	lastUnderscore := false
	for _, r := range rel {
		ok := r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r)
		if ok {
			b.WriteRune(r)
			lastUnderscore = false
			continue
		}
		if !lastUnderscore {
			b.WriteString("__")
			lastUnderscore = true
		}
	}
	id := strings.Trim(b.String(), "_")
	if id == "" {
		id = "main"
	}
	if first := rune(id[0]); unicode.IsDigit(first) {
		id = "_" + id
	}
	return id
}

func Init(opts InitOptions) error {
	dir := opts.Dir
	if dir == "" {
		var err error
		dir, err = os.Getwd()
		if err != nil {
			return err
		}
	}
	if opts.Name == "" {
		opts.Name = filepath.Base(dir)
	}
	manifestPath := filepath.Join(dir, "delta.json")
	if _, err := os.Stat(manifestPath); err == nil {
		return fmt.Errorf("delta.json already exists")
	}
	entry := "src/main.delta"
	if opts.NoSrc {
		entry = "main.delta"
	}
	manifest := fmt.Sprintf(`{
  "schemaVersion": 1,
  "name": %q,
  "version": "0.1.0",
  "entry": %q,
  "target": {
    "backend": "c",
    "standard": "v0.5",
    "compiler": "stage0"
  },
  "build": {
    "debug": {},
    "release": {}
  }
}
`, opts.Name, entry)
	if err := os.WriteFile(manifestPath, []byte(manifest), 0o644); err != nil {
		return err
	}
	sourcePath := filepath.Join(dir, filepath.FromSlash(entry))
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		return err
	}
	source := "function main(): int32 {\n\treturn 0;\n}\n"
	if err := os.WriteFile(sourcePath, []byte(source), 0o644); err != nil {
		return err
	}
	gitignore := filepath.Join(dir, ".gitignore")
	if _, err := os.Stat(gitignore); os.IsNotExist(err) {
		if err := os.WriteFile(gitignore, []byte("/build\n"), 0o644); err != nil {
			return err
		}
	}
	return nil
}

func stripJSONC(raw []byte) ([]byte, error) {
	var out []byte
	inString := false
	escape := false
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if inString {
			out = append(out, c)
			if escape {
				escape = false
			} else if c == '\\' {
				escape = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			out = append(out, c)
			continue
		}
		if c == '/' && i+1 < len(raw) && raw[i+1] == '/' {
			for i < len(raw) && raw[i] != '\n' {
				i++
			}
			if i < len(raw) {
				out = append(out, raw[i])
			}
			continue
		}
		if c == '/' && i+1 < len(raw) && raw[i+1] == '*' {
			i += 2
			for i+1 < len(raw) && !(raw[i] == '*' && raw[i+1] == '/') {
				i++
			}
			if i+1 >= len(raw) {
				return nil, fmt.Errorf("unterminated block comment in manifest")
			}
			i++
			continue
		}
		out = append(out, c)
	}
	return stripTrailingCommas(out), nil
}

func stripTrailingCommas(raw []byte) []byte {
	var out []byte
	inString := false
	escape := false
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if inString {
			out = append(out, c)
			if escape {
				escape = false
			} else if c == '\\' {
				escape = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			out = append(out, c)
			continue
		}
		if c == ',' {
			j := i + 1
			for j < len(raw) && unicode.IsSpace(rune(raw[j])) {
				j++
			}
			if j < len(raw) && (raw[j] == '}' || raw[j] == ']') {
				continue
			}
		}
		out = append(out, c)
	}
	return out
}
