import { afterAll } from "bun:test";

import { clearTestArtifacts, testArtifactsRoot } from "./support/artifacts";

clearTestArtifacts();
process.env["TEMP"] = testArtifactsRoot;
process.env["TMP"] = testArtifactsRoot;
process.env["TMPDIR"] = testArtifactsRoot;
process.env["OMITY_HOME"] = `${testArtifactsRoot}/user-data`;
afterAll(clearTestArtifacts);
process.once("exit", clearTestArtifacts);
