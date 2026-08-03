import { clearTestArtifacts, testArtifactsRoot } from "./support/artifacts";
import { afterAll } from "bun:test";

clearTestArtifacts();
process.env["TEMP"] = testArtifactsRoot;
process.env["TMP"] = testArtifactsRoot;
process.env["TMPDIR"] = testArtifactsRoot;
process.env["OMITY_SETTINGS_DIR"] = `${testArtifactsRoot}/user-settings`;
afterAll(clearTestArtifacts);
process.once("exit", clearTestArtifacts);
