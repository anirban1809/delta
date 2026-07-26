local plugin = assert(vim.env.DELTA_NVIM_TEST_PLUGIN)
vim.opt.runtimepath:prepend(plugin)
vim.cmd("filetype plugin on")

require("delta").setup({ enable = false })

local config = assert(require("delta").get_config())
assert(vim.deep_equal(config.filetypes, { "delta" }))
assert(vim.deep_equal(config.root_markers, { "delta.json", ".git" }))
assert(config.settings.delta.autoImports.enabled == true)
assert(config.cmd[1] == "node" or config.cmd[1] == "delta")

local fixture = assert(vim.env.DELTA_NVIM_TEST_FIXTURE)
vim.cmd.edit(vim.fn.fnameescape(fixture))
assert(vim.bo.filetype == "delta")
assert(vim.bo.commentstring == "// %s")
assert(vim.bo.suffixesadd == ".delta")

vim.cmd.syntax("on")
assert(vim.b.current_syntax == "delta")
