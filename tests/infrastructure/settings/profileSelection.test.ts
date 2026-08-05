import {
  availableSettingsProfiles,
  createSettingsContext,
  prioritizeSettingsProfile,
  selectSettingsProfiles,
} from "../../../src/infrastructure/configuration/settings/context";
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createTestDirectory } from "../../support/artifacts";

test("profile selection rejects a missing profile directory", () => {
  const root = createTestDirectory("configuration");
  const userSettingsDir = join(root, "user-settings");
  try {
    mkdirSync(userSettingsDir);
    writeFileSync(join(userSettingsDir, "profile.yaml"), "- missing\n");
    expect(() => createSettingsContext(root, userSettingsDir)).toThrow(
      `Profile 配置目录不存在：${resolve(userSettingsDir, "profiles", "missing")}`,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
test("profile selection rejects unsafe names", () => {
  const root = createTestDirectory("configuration");
  const userSettingsDir = join(root, "user-settings");
  try {
    mkdirSync(userSettingsDir);
    writeFileSync(join(userSettingsDir, "profile.yaml"), "- ../outside\n");
    expect(() => createSettingsContext(root, userSettingsDir)).toThrow();
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
test("profile selection rejects duplicate layers", () => {
  const root = createTestDirectory("configuration");
  const userSettingsDir = join(root, "user-settings");
  try {
    mkdirSync(join(userSettingsDir, "profiles", "same"), { recursive: true });
    writeFileSync(join(userSettingsDir, "profile.yaml"), "- same\n- same\n");
    expect(() => createSettingsContext(root, userSettingsDir)).toThrow(
      "Profile 列表不能包含重复项",
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
test("empty profile selection uses only repository defaults", () => {
  const root = createTestDirectory("configuration");
  const userSettingsDir = join(root, "user-settings");
  try {
    mkdirSync(userSettingsDir);
    writeFileSync(join(userSettingsDir, "profile.yaml"), "[]\n");
    expect(createSettingsContext(root, userSettingsDir).profiles).toEqual([]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
test("available profiles are sorted and can be selected per context", () => {
  const root = createTestDirectory("configuration");
  const userSettingsDir = join(root, "user-settings");
  try {
    mkdirSync(join(userSettingsDir, "profiles", "work"), { recursive: true });
    mkdirSync(join(userSettingsDir, "profiles", "base"), { recursive: true });
    const context = createSettingsContext(root, userSettingsDir, []);
    expect(availableSettingsProfiles(context)).toEqual(["base", "work"]);
    expect(selectSettingsProfiles(context, ["work", "base"]).profiles).toEqual([
      { directory: resolve(userSettingsDir, "profiles", "work"), name: "work" },
      { directory: resolve(userSettingsDir, "profiles", "base"), name: "base" },
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
test("selected profile is applied after every profile from profile.yaml", () => {
  const root = createTestDirectory("configuration");
  const userSettingsDir = join(root, "user-settings");
  try {
    for (const name of ["base", "work", "urgent"]) {
      mkdirSync(join(userSettingsDir, "profiles", name), { recursive: true });
    }
    const context = createSettingsContext(root, userSettingsDir, ["base", "work"]);
    expect(prioritizeSettingsProfile(context)).toBe(context);
    expect(prioritizeSettingsProfile(context, "urgent").profiles.map(({ name }) => name)).toEqual([
      "base",
      "work",
      "urgent",
    ]);
    expect(prioritizeSettingsProfile(context, "base").profiles.map(({ name }) => name)).toEqual([
      "work",
      "base",
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
