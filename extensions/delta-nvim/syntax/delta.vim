if exists("b:current_syntax")
  finish
endif

syntax keyword deltaConditional if else switch case default
syntax keyword deltaRepeat while for
syntax keyword deltaStatement break continue return check forward
syntax keyword deltaDeclaration function const let type struct enum union
syntax keyword deltaModule import export module from
syntax keyword deltaStorage extern ffi header static dynamic unsafe
syntax keyword deltaOperator as new move clone edit unique heap owned error
syntax keyword deltaBoolean true false
syntax keyword deltaType int8 int16 int32 int64 intsize
syntax keyword deltaType uint8 uint16 uint32 uint64 uintsize
syntax keyword deltaType float32 float64 bool char string stringview void

syntax match deltaFunction "\<function\>\s\+\zs[A-Za-z_][A-Za-z0-9_]*"
syntax match deltaNumber "\<0[xX][0-9A-Fa-f_]\+\>"
syntax match deltaNumber "\<0[bB][01_]\+\>"
syntax match deltaNumber "\<0[oO][0-7_]\+\>"
syntax match deltaNumber "\<[0-9][0-9_]*\(\.[0-9][0-9_]*\)\?\([eE][+-]\?[0-9][0-9_]*\)\?\>"

syntax match deltaEscape "\\\(n\|r\|t\|0\|\\\|\"\|'\|x[0-9A-Fa-f]\{2}\|u{[0-9A-Fa-f]\{1,6}}\)" contained
syntax region deltaString start=+"+ skip=+\\\\\|\\"+ end=+"+ contains=deltaEscape
syntax region deltaCharacter start=+'+ skip=+\\\\\|\\'+ end=+'+ contains=deltaEscape
syntax match deltaLineComment "//.*$" contains=@Spell
syntax region deltaBlockComment start="/\*" end="\*/" contains=deltaBlockComment,@Spell

highlight default link deltaConditional Conditional
highlight default link deltaRepeat Repeat
highlight default link deltaStatement Statement
highlight default link deltaDeclaration Keyword
highlight default link deltaModule Include
highlight default link deltaStorage StorageClass
highlight default link deltaOperator Operator
highlight default link deltaBoolean Boolean
highlight default link deltaType Type
highlight default link deltaFunction Function
highlight default link deltaNumber Number
highlight default link deltaEscape SpecialChar
highlight default link deltaString String
highlight default link deltaCharacter Character
highlight default link deltaLineComment Comment
highlight default link deltaBlockComment Comment

let b:current_syntax = "delta"

