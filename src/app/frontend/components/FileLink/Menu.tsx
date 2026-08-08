import { ExternalLink, FolderOpen } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { css, cx } from "styled-system/css";
import type { FilePathKind } from "../../../../fileLinks/types";
import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { activateFileLink } from "../../services/client";
import { menu } from "styled-system/recipes";
import { reportPromiseErrors } from "../../services/errors";
import { useFileLinkSession } from "./context";
import { useTranslation } from "react-i18next";

const classes = menu({ size: "sm" });
const positioning = { gutter: 4, placement: "bottom-start" as const };
const trigger = css({
  _focusVisible: {
    outlineColor: "mutedStrong",
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: "1px",
  },
  bg: "transparent",
  borderWidth: "0",
  color: "current",
  cursor: "pointer",
  display: "inline",
  font: "inherit",
  lineHeight: "inherit",
  p: 0,
  textAlign: "inherit",
  verticalAlign: "baseline",
  whiteSpace: "inherit",
});
const label = css({
  "& > *": {
    textDecoration: "underline",
    textDecorationColor: "current",
    textUnderlineOffset: "0.15em",
  },
  "&:has(> *)": { textDecoration: "none" },
  textDecoration: "underline",
  textDecorationColor: "current",
  textUnderlineOffset: "0.15em",
});
const content = css({
  bg: "surfaceRaised",
  borderColor: "lineStrong",
  borderRadius: "0",
  borderWidth: "1px",
  p: "1",
  shadow: "lg",
  w: "max-content",
  zIndex: "dropdown",
});
const item = css({
  _highlighted: { bg: "controlHover" },
  alignItems: "center",
  bg: "transparent",
  borderWidth: "0",
  color: "text",
  cursor: "pointer",
  display: "flex",
  fontFamily: "body",
  gap: "2",
  minH: "8",
  px: "2",
  py: "1.5",
  textAlign: "left",
  w: "full",
  whiteSpace: "nowrap",
});
export function FileLinkMenu({
  children,
  kind,
  path,
}: {
  children: ReactNode;
  kind: FilePathKind;
  path: string;
}) {
  const { t } = useTranslation();
  const sessionId = useFileLinkSession();
  const run = useCallback(
    (action: "open" | "reveal") => {
      reportPromiseErrors(activateFileLink(sessionId, path, action));
    },
    [path, sessionId],
  );
  const open = useCallback(() => {
    run("open");
  }, [run]);
  const reveal = useCallback(() => {
    run("reveal");
  }, [run]);
  return (
    <Menu.Root positioning={positioning}>
      <Menu.Trigger className={trigger} title={path} type="button">
        <span className={label}>{children}</span>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner className={classes.positioner}>
          <Menu.Content className={cx(classes.content, content)}>
            <Menu.Item asChild value="open" onSelect={open}>
              <button className={cx(classes.item, item)} type="button">
                <ExternalLink aria-hidden size={14} />
                {t("openFileLink")}
              </button>
            </Menu.Item>
            {kind === "file" ? (
              <Menu.Item asChild value="reveal" onSelect={reveal}>
                <button className={cx(classes.item, item)} type="button">
                  <FolderOpen aria-hidden size={14} />
                  {t("revealFileLink")}
                </button>
              </Menu.Item>
            ) : null}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
