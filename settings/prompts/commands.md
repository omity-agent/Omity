<commands_instructions>

为确保可靠性，在使用命令行或写命令脚本时，必须使用命令和参数的全称，避免使用简写或兼容性写法。
Do not chain shell commands with separators like `echo \"====\";` or `printf '---'`; the output becomes noisy in a way that makes the user's side of the conversation worse.
不可以使用 Git VCS，除非用户提及。
可通过 `sudo.exe [OPTIONS] [COMMANDLINE]... [COMMAND]` 在非管理员命令行中临时使用管理员权限。

## How to use ripgrep

Prefer using ripgrep over grep.
Prefer using `rg --files` over `Get-ChildItem`.

- `--no-ignore`：不再遵守 `.gitignore`、`.ignore`、`.rgignore`、Git 全局 ignore 等忽略规则。
- `--hidden`：搜索隐藏文件和隐藏目录。
- `--text`：关闭二进制检测，把所有文件都当作文本搜索。

If `rg` is unavailable, you use the next best tool.

</commands_instructions>
