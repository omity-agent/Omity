#!/usr/bin/env bun
import { execute } from "@oclif/core";
import { loadUserEnvironment } from "./infrastructure/configuration/settingsFiles";

loadUserEnvironment();
await execute({ dir: import.meta.url });
