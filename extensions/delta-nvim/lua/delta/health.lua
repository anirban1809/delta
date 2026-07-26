local M = {}

local function executable(command)
  return type(command) == "string" and vim.fn.executable(command) == 1
end

function M.check()
  vim.health.start("delta.nvim")

  if vim.fn.has("nvim-0.11") == 1 then
    vim.health.ok("Neovim 0.11+ is available")
  else
    vim.health.error("Neovim 0.11+ is required")
  end

  local config = require("delta").get_config()
  if not config then
    vim.health.warn("delta.nvim has not been set up", {
      "Call require('delta').setup() from your plugin configuration.",
    })
    return
  end

  local cmd = config.cmd or {}
  if executable(cmd[1]) then
    vim.health.ok(("Language-server command is executable: %s"):format(cmd[1]))
  else
    vim.health.error(("Language-server command is not executable: %s"):format(cmd[1] or "<none>"))
  end

  if cmd[1] == "node" and cmd[2] then
    local stat = (vim.uv or vim.loop).fs_stat(cmd[2])
    if stat and stat.type == "file" then
      vim.health.ok(("Language-server entry point exists: %s"):format(cmd[2]))
    else
      vim.health.error(("Language-server entry point does not exist: %s"):format(cmd[2]))
    end
  end

  if config.cmd_env and config.cmd_env.DELTA_STD_LIB then
    if vim.fn.isdirectory(config.cmd_env.DELTA_STD_LIB) == 1 then
      vim.health.ok(("Standard library exists: %s"):format(config.cmd_env.DELTA_STD_LIB))
    else
      vim.health.warn(
        ("Standard library directory does not exist: %s"):format(config.cmd_env.DELTA_STD_LIB)
      )
    end
  end

  local clients = vim.lsp.get_clients({ name = "delta" })
  if #clients > 0 then
    vim.health.ok(("Delta language-server clients running: %d"):format(#clients))
  else
    vim.health.info("No Delta language-server client is currently running")
  end
end

return M
