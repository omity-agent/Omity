import type { Settings, SkillInfo } from "./types";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { localize } from "./i18n/server";
import matter from "gray-matter";
import untildify from "untildify";
import { z } from "zod";

const skillMetaSchema = z.object({
  description: z.string().min(1),
  name: z.string().min(1),
});
type SkillMeta = z.infer<typeof skillMetaSchema>;
function loadSkills(settings: Pick<Settings, "skills">): SkillInfo[] {
  if (!settings.skills.enabled) {
    return [];
  }
  const skillsDir = resolveUserPath(settings.skills.directory);
  if (!existsSync(skillsDir)) {
    throw new Error(localize("errors:skills.directoryMissing", { value0: skillsDir }));
  }
  const skills = readdirSync(skillsDir)
      .map((entry) => join(skillsDir, entry))
      .filter((entry) => statSync(entry).isDirectory())
      .map(readSkill),
    names = new Set<string>();
  for (const skill of skills) {
    if (names.has(skill.name)) {
      throw new Error(localize("errors:skills.duplicateName", { value0: skill.name }));
    }
    names.add(skill.name);
  }
  for (const skillName of Object.keys(settings.skills.skillEnabled)) {
    if (!names.has(skillName)) {
      throw new Error(localize("errors:skills.unknownToggle", { value0: skillName }));
    }
  }
  return skills.filter((skill) => settings.skills.skillEnabled[skill.name] ?? true);
}
export function buildSkillsList(settings: Pick<Settings, "skills">) {
  const skills = loadSkills(settings);
  if (!settings.skills.enabled) {
    return "";
  }
  const skillsDir = resolveUserPath(settings.skills.directory).replaceAll("\\", "/"),
    lines = [
      skillsDir,
      ...skills.map(
        (skill, index) =>
          `${index === skills.length - 1 ? "└──" : "├──"} ${skill.name}/SKILL.md # ${skill.description}`,
      ),
    ];
  if (skills.length === 0) {
    lines.push(localize("errors:skills.noneEnabled"));
  }
  return lines.join("\n");
}
function readSkill(skillDir: string): SkillInfo {
  const source = join(skillDir, "SKILL.md");
  if (!existsSync(source)) {
    throw new Error(localize("errors:skills.fileMissing", { value0: source }));
  }
  const meta = parseSkillMeta(readFileSync(source, "utf8"), source);
  return { ...meta, source };
}
function parseSkillMeta(content: string, source: string): SkillMeta {
  if (!matter.test(content)) {
    throw new Error(localize("errors:skills.frontMatterMissing", { value0: source }));
  }
  return skillMetaSchema.parse(matter(content).data);
}
function resolveUserPath(path: string) {
  const expanded = untildify(path);
  return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
}
