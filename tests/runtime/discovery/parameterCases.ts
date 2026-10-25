import type { ModelToolDefinition } from "../../../src/infrastructure/mcp/tools/definitions";

type ParameterSchema = ModelToolDefinition["inputSchema"];
function objectParameters(
  properties: NonNullable<ParameterSchema["properties"]>,
  required = Object.keys(properties),
): ParameterSchema {
  return { additionalProperties: false, properties, required, type: "object" };
}
const text = { type: "string" } as const,
  closed = objectParameters({ text }),
  recursive = objectParameters({ child: { anyOf: [{ $ref: "#" }, { type: "null" }] } });

export const parameterCases: {
  eligible: [boolean, boolean, boolean];
  name: string;
  schema: ParameterSchema;
}[] = [
  { eligible: [true, true, true], name: "closed", schema: closed },
  { eligible: [true, true, true], name: "empty", schema: objectParameters({}) },
  { eligible: [false, true, true], name: "optional", schema: objectParameters({ text }, []) },
  {
    eligible: [false, false, true],
    name: "open",
    schema: { properties: { text }, type: "object" },
  },
  {
    eligible: [false, true, true],
    name: "nested_optional",
    schema: objectParameters({ child: objectParameters({ text }, []) }),
  },
  {
    eligible: [false, false, true],
    name: "open_array_item",
    schema: objectParameters({ list: { items: { type: "object" }, type: "array" } }),
  },
  {
    eligible: [true, false, true],
    name: "number_bounds",
    schema: objectParameters({ number: { minimum: 1, type: "number" } }),
  },
  {
    eligible: [true, false, false],
    name: "string_length",
    schema: objectParameters({ text: { minLength: 1, type: "string" } }),
  },
  {
    eligible: [true, false, true],
    name: "array_count",
    schema: objectParameters({ list: { items: text, minItems: 2, type: "array" } }),
  },
  {
    eligible: [true, true, true],
    name: "nullable",
    schema: objectParameters({ text: { type: ["string", "null"] } }),
  },
  {
    eligible: [false, false, false],
    name: "exclusive_union",
    schema: objectParameters({ text: { oneOf: [text, { type: "null" }] } }),
  },
  {
    eligible: [false, true, false],
    name: "intersection",
    schema: objectParameters({ text: { allOf: [text] } }),
  },
  {
    eligible: [true, true, true],
    name: "reference",
    schema: { ...objectParameters({ text: { $ref: "#/$defs/a~1~0" } }), $defs: { "a/~": text } },
  },
  { eligible: [true, false, false], name: "recursive", schema: recursive },
  {
    eligible: [false, false, false],
    name: "missing_reference",
    schema: objectParameters({ text: { $ref: "#/$defs/missing" } }),
  },
  {
    eligible: [false, false, false],
    name: "external_reference",
    schema: objectParameters({ text: { $ref: "https://example.invalid/schema" } }),
  },
  {
    eligible: [false, false, false],
    name: "unconstrained",
    schema: objectParameters({ text: {} }),
  },
  {
    eligible: [false, false, false],
    name: "negation",
    schema: objectParameters({ text: { not: text, type: "string" } }),
  },
  {
    eligible: [true, true, false],
    name: "literal_pattern",
    schema: objectParameters({ text: { pattern: String.raw`\(?=`, type: "string" } }),
  },
];

function nestedParameters(depth: number) {
  let schema = closed;
  for (let i = 1; i < depth; i += 1) {
    schema = objectParameters({ child: schema });
  }
  return schema;
}
function propertyBudget(count: number) {
  return objectParameters(
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`p${i}`, text])),
  );
}
function enumBudget(count: number, width = 1) {
  return objectParameters({
    choice: {
      enum: Array.from({ length: count }, (_, i) => String(i).padStart(width, "0")),
      type: "string",
    },
  });
}
function stringBudget(length: number) {
  return objectParameters({ ["s".repeat(length)]: text });
}
export const schemaBoundaries = [
  { name: "nesting", schemas: [nestedParameters(10), nestedParameters(11)] },
  { name: "properties", schemas: [propertyBudget(5000), propertyBudget(5001)] },
  { name: "enums", schemas: [enumBudget(1000), enumBudget(1001)] },
  { name: "strings", schemas: [stringBudget(120_000), stringBudget(120_001)] },
  { name: "large_enum", schemas: [enumBudget(251, 59), enumBudget(251, 60)] },
];
