import { promisify } from "node:util";

const [mode] = process.argv.slice(2),
  secret = process.env["MCP_TEST_SECRET"] ?? "";
if (mode === "exit") {
  const output = `${"startup output\n".repeat(6000)}fatal startup failure: ${secret}\n`;
  await promisify(process.stderr.write.bind(process.stderr))(output);
  process.exit(37);
}
if (mode === "protocol") {
  await promisify(process.stdout.write.bind(process.stdout))("invalid MCP JSON\n");
  process.exit(38);
}
if (mode === "schema") {
  await promisify(process.stdout.write.bind(process.stdout))('{"jsonrpc":"2.0","id":null}\n');
  process.exit(39);
}
throw new Error(`Unknown startup failure mode: ${String(mode)}`);
