local M = {}

local config
local watcher_group

local function plugin_root()
  local source = debug.getinfo(1, "S").source
  if source:sub(1, 1) == "@" then
    source = source:sub(2)
  end
  return vim.fs.dirname(vim.fs.dirname(vim.fs.dirname(vim.fs.normalize(source))))
end

local function is_file(path)
  local stat = (vim.uv or vim.loop).fs_stat(path)
  return stat ~= nil and stat.type == "file"
end

local function default_command()
  if vim.fn.executable("delta") == 1 then
    return { "delta", "lsp" }
  end

  local bundled_server =
    vim.fs.normalize(vim.fs.joinpath(plugin_root(), "..", "delta-vscode", "server", "server.js"))
  if vim.fn.executable("node") == 1 and is_file(bundled_server) then
    return { "node", bundled_server }
  end

  return { "delta", "lsp" }
end

local function notify_file_changed(path)
  if path == "" then
    return
  end

  local change = {
    uri = vim.uri_from_fname(vim.fs.normalize(path)),
    type = 2, -- FileChangeType.Changed
  }
  for _, client in ipairs(vim.lsp.get_clients({ name = "delta" })) do
    client:notify("workspace/didChangeWatchedFiles", {
      changes = { change },
    })
  end
end

local function setup_file_watcher()
  watcher_group = vim.api.nvim_create_augroup("delta_lsp_file_watcher", { clear = true })
  vim.api.nvim_create_autocmd("BufWritePost", {
    group = watcher_group,
    pattern = { "*.delta", "delta.json" },
    callback = function(event)
      notify_file_changed(event.file)
    end,
    desc = "Notify the Delta language server about saved project files",
  })
end

---Configure and enable the Delta language server.
---@param opts? table
function M.setup(opts)
  if vim.fn.has("nvim-0.11") == 0 then
    error("delta.nvim requires Neovim 0.11 or newer")
  end

  opts = opts or {}
  local cmd = opts.cmd or default_command()
  local settings = vim.tbl_deep_extend("force", {
    delta = {
      autoImports = {
        enabled = opts.auto_imports ~= false,
      },
    },
  }, opts.settings or {})
  local cmd_env = vim.deepcopy(opts.cmd_env or {})
  if opts.standard_library and opts.standard_library ~= "" then
    cmd_env.DELTA_STD_LIB = vim.fs.normalize(vim.fn.expand(opts.standard_library))
  end

  local server_config = {
    cmd = cmd,
    cmd_env = cmd_env,
    filetypes = { "delta" },
    root_markers = { "delta.json", ".git" },
    settings = settings,
  }
  if opts.capabilities then
    server_config.capabilities = opts.capabilities
  end
  server_config = vim.tbl_deep_extend("force", server_config, opts.server or {})

  vim.lsp.config("delta", server_config)
  if opts.watch_files ~= false then
    setup_file_watcher()
  elseif watcher_group then
    vim.api.nvim_del_augroup_by_id(watcher_group)
    watcher_group = nil
  end
  if opts.enable ~= false then
    vim.lsp.enable("delta")
  end

  config = server_config
  return server_config
end

---Return the resolved server configuration from the most recent setup call.
---@return table?
function M.get_config()
  return config
end

return M
