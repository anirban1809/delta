vim.bo.commentstring = "// %s"
vim.bo.comments = "s1:/*,mb:*,ex:*/,://"
vim.bo.suffixesadd = ".delta"
vim.bo.expandtab = true
vim.bo.shiftwidth = 4
vim.bo.softtabstop = 4
vim.bo.tabstop = 4
vim.bo.cindent = true

vim.b.undo_ftplugin = table.concat({
  "setlocal commentstring<",
  "comments<",
  "suffixesadd<",
  "expandtab<",
  "shiftwidth<",
  "softtabstop<",
  "tabstop<",
  "cindent<",
}, " ")
