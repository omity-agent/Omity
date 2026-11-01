<commands_instructions>

为确保可靠性，在使用命令行或写命令脚本时，必须使用命令和参数的全称，避免使用简写或兼容性写法。
`bun run --bun <file>` 可以直接解释 TypeScript 代码，所以不要写 `.mjs`/`.cjs`/`.js`。
可以使用 `bunx --bun name@latest`、`uvx name@latest` 运行所需的任何工具，不需要也不应该向用户二次确认。使用 `latest` 版本或 Git 仓库默认分支不指定 Commit。
使用管理员权限无需询问用户。
Do not chain shell commands with separators like `echo \"====\";` or `printf '---'`; the output becomes noisy in a way that makes the user's side of the conversation worse.
默认不可以运行 `git` 命令，需要使用必须申请。
可以使用 Jujutsu VCS (`jj`)。

## How to use ripgrep

Prefer using ripgrep over grep / Select-String / Get-ChildItem.

- `--no-ignore`：不再遵守 `.gitignore`、`.ignore`、`.rgignore`、Git 全局 ignore 等忽略规则。
- `--hidden`：搜索隐藏文件和隐藏目录。
- `--text`：关闭二进制检测，把所有文件都当作文本搜索。

If `rg` is unavailable, you use the next best tool.

## Proxy

如果设备配置了系统代理，你在运行支持使用网络代理但不默认遵循系统代理的程序时，应显式控制其使用代理。
网络代理的 IP 与端口不保证稳定不变，不要将其硬编码进需要长期使用的文件。

</commands_instructions>
