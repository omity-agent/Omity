import type { JSONSchema7 } from "@ai-sdk/provider";
import { RegExpParser, visitRegExpAST } from "@eslint-community/regexpp";
import { sumBy } from "es-toolkit";
import { compileSchema, isJsonError, type SchemaNode } from "json-schema-library";

import { schemaConstraints } from "../../../../settings/schemaConstraints";
import type { ModelApi } from "../../../types";

const patterns = new RegExpParser();
export function isStrictSchema(schema: JSONSchema7, api: ModelApi): boolean {
  const profile =
      api === "messages"
        ? schemaConstraints.anthropic
        : api === "interactions" || api === "generate-content"
          ? schemaConstraints.gemini
          : schemaConstraints.openai,
    root = compileSchema(schema),
    nodes = root.toSchemaNodes(),
    schemas = nodes.map((node) => node.schema as JSONSchema7),
    keywords = new Set<string>(profile.keywords),
    children = new Map<string, SchemaNode[]>(),
    active = new Set<string>();
  if (
    (root.schemaErrors?.length ?? 0) > 0 ||
    schema.type !== "object" ||
    (!profile.allowRootUnion && schema.anyOf !== undefined)
  ) {
    return false;
  }
  for (const node of nodes) {
    if (node.parent) {
      const siblings = children.get(node.parent.schemaLocation) ?? [];
      siblings.push(node);
      children.set(node.parent.schemaLocation, siblings);
    }
  }
  if ("maxProperties" in profile) {
    const strings = schemas
      .flatMap((node) => [
        ...Object.keys(node.properties ?? {}),
        ...Object.keys(node.$defs ?? {}),
        ...Object.keys(node.definitions ?? {}),
        ...(node.enum ?? []),
        node.const,
      ])
      .filter((value): value is string => typeof value === "string");
    if (
      sumBy(schemas, (node) => Object.keys(node.properties ?? {}).length) > profile.maxProperties ||
      sumBy(schemas, (node) => node.enum?.length ?? 0) > profile.maxEnumValues ||
      sumBy(strings, (value) => value.length) > profile.maxStringLength
    ) {
      return false;
    }
  }
  return nodes.every(eligible) && visit(root, 0);

  function eligible(node: SchemaNode) {
    const value = node.schema as JSONSchema7,
      types = Array.isArray(value.type) ? value.type : [value.type],
      required = new Set(value.required);
    const unsupported = new Set<string>();
    if (node.pattern) {
      visitRegExpAST(patterns.parseLiteral(node.pattern.toString()), {
        onAssertionEnter({ kind }) {
          if (
            kind === "lookahead" ||
            kind === "lookbehind" ||
            (api === "messages" && kind === "word")
          ) {
            unsupported.add(kind);
          }
        },
        onBackreferenceEnter() {
          if (api === "messages") {
            unsupported.add("backreference");
          }
        },
      });
    }
    return (
      unsupported.size === 0 &&
      Object.keys(value).every((key) => keywords.has(key)) &&
      (value.type !== undefined ||
        value.$ref !== undefined ||
        value.anyOf !== undefined ||
        value.allOf !== undefined ||
        value.enum !== undefined ||
        Object.hasOwn(value, "const")) &&
      (value.format === undefined || profile.formats.some((format) => format === value.format)) &&
      (!types.includes("object") ||
        ((!profile.closedObjects || value.additionalProperties === false) &&
          (!profile.allRequired ||
            Object.keys(value.properties ?? {}).every((key) => required.has(key))))) &&
      [...required].every((key) => Object.hasOwn(value.properties ?? {}, key)) &&
      (!types.includes("array") || value.items !== undefined || node.prefixItems !== undefined) &&
      (value.$ref === undefined ||
        (value.$ref.startsWith("#") && !isJsonError(node.resolveRef()))) &&
      (api !== "messages" ||
        ((value.minItems ?? 0) <= 1 &&
          !(value.$ref !== undefined && /\/allOf\/\d+(?:\/|$)/u.test(node.evaluationPath)))) &&
      (!("maxLargeEnumLength" in profile) ||
        (value.enum?.length ?? 0) <= profile.largeEnumThreshold ||
        sumBy(value.enum ?? [], (item) => (typeof item === "string" ? item.length : 0)) <=
          profile.maxLargeEnumLength)
    );
  }
  function visit(node: SchemaNode, depth: number): boolean {
    if (active.has(node.schemaLocation)) {
      return profile.recursive;
    }
    const nextDepth = depth + (node.type === "object" || node.type === "array" ? 1 : 0);
    if ("maxDepth" in profile && nextDepth > profile.maxDepth) {
      return false;
    }
    active.add(node.schemaLocation);
    const valid =
      (children.get(node.schemaLocation) ?? []).every((child) =>
        visit(child, Object.values(node.$defs ?? {}).includes(child) ? depth : nextDepth),
      ) &&
      (node.schema["$ref"] === undefined || visit(node.resolveRef(), nextDepth));
    active.delete(node.schemaLocation);
    return valid;
  }
}
