# delta.nvim

Neovim support for the [Delta programming language](https://github.com/anirban1809/delta).

The plugin provides:

- `.delta` filetype detection
- syntax highlighting and sensible buffer-local editing options
- automatic startup of the Delta language server
- diagnostics, completion, hover, and go-to-definition through Neovim's built-in LSP client
- change notifications for Delta source files and `delta.json` manifests
- `:checkhealth delta` diagnostics

## Requirements

- Neovim 0.11 or newer
- Node.js when using the bundled JavaScript language server
- either `delta` on `PATH`, a custom `cmd`, or a Delta repository checkout beside this plugin

When the plugin is used from `extensions/delta-nvim` in the Delta repository, it automatically
finds `extensions/delta-vscode/server/server.js`. Otherwise, it runs `delta lsp`.

## Setup

With lazy.nvim and a local Delta checkout:

```lua
{
  dir = vim.fn.expand("~/src/delta/extensions/delta-nvim"),
  name = "delta.nvim",
  opts = {},
}
```

For an installed `delta` executable:

```lua
require("delta").setup()
```

To use a specific command:

```lua
require("delta").setup({
  cmd = { "node", "/path/to/delta/dist/main.js", "lsp" },
  standard_library = "/path/to/delta-stdlib",
  auto_imports = true,
})
```

Completion plugins can extend the client capabilities:

```lua
require("delta").setup({
  capabilities = require("blink.cmp").get_lsp_capabilities(),
})
```

All standard Neovim LSP configuration fields can be supplied under `server`:

```lua
require("delta").setup({
  server = {
    root_markers = { "delta.json", ".git" },
    on_attach = function(client, bufnr)
      -- Your buffer-local setup.
    end,
  },
})
```

Set `watch_files = false` to disable the plugin's save notifications or `enable = false` to
define the `delta` LSP configuration without enabling it.

