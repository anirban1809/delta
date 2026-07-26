local plugin = assert(vim.env.DELTA_NVIM_TEST_PLUGIN)
local fixture = assert(vim.env.DELTA_NVIM_TEST_FIXTURE)

vim.opt.runtimepath:prepend(plugin)
vim.cmd("filetype plugin on")
require("delta").setup()
vim.cmd.edit(vim.fn.fnameescape(fixture))

assert(
  vim.wait(10000, function()
    return #vim.lsp.get_clients({ bufnr = 0, name = "delta" }) == 1
  end),
  "Delta language server did not attach"
)

local client = assert(vim.lsp.get_clients({ bufnr = 0, name = "delta" })[1])
assert(client.server_capabilities.hoverProvider)
assert(client.server_capabilities.definitionProvider)
assert(client.server_capabilities.completionProvider)

local target_line
local target_character
for index, line in ipairs(vim.api.nvim_buf_get_lines(0, 0, -1, false)) do
  local start = line:find("total", 1, true)
  if line:find("return uint8", 1, true) and start then
    target_line = index - 1
    target_character = start - 1
    break
  end
end
assert(target_line and target_character)

local response, request_error = client:request_sync("textDocument/hover", {
  textDocument = { uri = vim.uri_from_bufnr(0) },
  position = { line = target_line, character = target_character },
}, 5000, 0)
assert(not request_error, vim.inspect(request_error))
assert(response and not response.err, vim.inspect(response and response.err))
assert(response.result and response.result.contents, "Delta hover returned no content")
