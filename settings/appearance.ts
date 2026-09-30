export const compactViewport = "(width < 64rem)";
export const interfaceMetrics = {
  animations: {
    disabled: { value: "none" },
    progressPulse: { value: "pulse 1.8s ease-in-out infinite" },
  },
  borderWidths: {
    accent: { value: "4px" },
    hairline: { value: "1px" },
    medium: { value: "3px" },
    zero: { value: "0" },
  },
  durations: {
    fast: { value: "120ms" },
    medium: { value: "150ms" },
  },
  easings: {
    ease: { value: "ease" },
  },
  fontSizes: {
    editor: { value: { _coarse: "1rem", _compact: "1rem", base: "0.875rem" } },
    interface: { value: { _compact: "0.9375rem", base: "0.8125rem" } },
    metadata: { value: { _compact: "0.8125rem", base: "0.75rem" } },
    source: { value: { _compact: "0.9375rem", base: "0.875rem" } },
  },
  letterSpacings: {
    caption: { value: "0.04em" },
    none: { value: "0" },
    selected: { value: "0.08em" },
  },
  lineHeights: {
    code: { value: "1.65" },
    markdown: { value: "1.7" },
    markdownHeading: { value: "1.35" },
  },
  sizes: {
    accessCard: { value: "32rem" },
    composerActions: { value: "calc(5 * {sizes.controlTarget} + 4 * {spacing.1})" },
    controlTarget: { value: { _coarse: "2.75rem", _compact: "2.75rem", base: "2rem" } },
    editorCompact: { value: "8rem" },
    editorShort: { value: "24dvh" },
    fitContent: { value: "fit-content" },
    interfaceIcon: { value: { _coarse: "1.125rem", _compact: "1.125rem", base: "1rem" } },
    intrinsicContent: { value: "max-content" },
    messageLimit: { value: "66.666667cqh" },
    runtimeControls: { value: "calc(2 * {sizes.controlTarget} + {spacing.1})" },
    smallIcon: { value: { _compact: "1rem", base: "0.875rem" } },
    sourceLine: { value: "1lh" },
    tableContent: { value: "max-content" },
    toolOutputMinimum: { value: "3rem" },
    twoThirds: { value: "66.666667%" },
    unbounded: { value: "none" },
    viewport: { value: "100dvh" },
    zero: { value: "0" },
  },
  spacing: {
    detailOverlap: { value: "-0.5rem" },
    focusInset: { value: "-1px" },
    safeAreaBlockEnd: { value: "env(safe-area-inset-bottom)" },
    safeAreaBlockStart: { value: "env(safe-area-inset-top)" },
    safeAreaInlineEnd: { value: "env(safe-area-inset-right)" },
    safeAreaInlineStart: { value: "env(safe-area-inset-left)" },
    sidebarInset: { value: "2px" },
    zero: { value: "0" },
  },
  zIndex: {
    base: { value: 1 },
    pinned: { value: 2 },
  },
};
export const interfaceTextStyles = {
  accessHeading: { value: { fontSize: "xl", fontWeight: "medium" } },
  badge: { value: { fontFamily: "body", fontWeight: "normal" } },
  codeBlock: {
    value: { fontFamily: "mono", fontSize: "source", lineHeight: "code" },
  },
  codeElement: {
    value: { fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit" },
  },
  contextUsage: { value: { fontFamily: "mono", fontSize: "metadata" } },
  control: {
    value: { fontFamily: "body", fontSize: "interface", fontWeight: "normal" },
  },
  formPrompt: {
    value: { fontSize: "sm", fontWeight: "medium", lineHeight: "normal" },
  },
  inlineCode: { value: { fontSize: "source", lineHeight: "tight" } },
  markdownHeading: {
    value: { fontWeight: "bold", lineHeight: "markdownHeading" },
  },
  selectedCaption: {
    value: { fontWeight: "bold", letterSpacing: "selected" },
  },
  sidebarBrand: {
    value: { fontSize: "interface", fontWeight: "medium", letterSpacing: "selected" },
  },
  sidebarCount: {
    value: { fontSize: "metadata", fontWeight: "normal", letterSpacing: "none" },
  },
  sourceCode: {
    value: { fontFamily: "mono", fontSize: "inherit", lineHeight: "inherit" },
  },
};
