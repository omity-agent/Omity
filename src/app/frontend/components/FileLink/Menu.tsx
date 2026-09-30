/* oxlint-disable @pandacss/no-descendant-selectors -- Menu labels style arbitrary link content supplied by callers. */
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

const classes = menu({ size: "sm" }),
  positioning = { gutter: 4, placement: "bottom-start" as const },
  trigger = css({
    _focusVisible: {
      outlineColor: "mutedStrong",
      outlineOffset: "0.5",
      outlineStyle: "solid",
      outlineWidth: "hairline",
    },
    background: "clear",
    borderWidth: "zero",
    color: "currentText",
    cursor: "pointer",
    display: "inline",
    font: "inherit",
    lineHeight: "inherit",
    padding: "zero",
    textAlign: "inherit",
    verticalAlign: "baseline",
    whiteSpace: "inherit",
  }),
  label = css({
    "& > *": {
      textDecorationColor: "currentText",
      textDecorationLine: "underline",
      textUnderlineOffset: "0.15em",
    },
    "&:has(> *)": { textDecoration: "none" },
    textDecorationColor: "currentText",
    textDecorationLine: "underline",
    textUnderlineOffset: "0.15em",
  }),
  content = css({
    background: "surfaceRaised",
    borderColor: "lineStrong",
    borderRadius: "l1",
    borderWidth: "hairline",
    boxShadow: "lg",
    padding: "1",
    width: "intrinsicContent",
    zIndex: "dropdown",
  }),
  item = css({
    _highlighted: { background: "controlHover" },
    alignItems: "center",
    background: "clear",
    borderWidth: "zero",
    color: "text",
    cursor: "pointer",
    display: "flex",
    fontFamily: "body",
    gap: "2",
    minHeight: "8",
    paddingBlock: "1.5",
    paddingInline: "2",
    textAlign: "left",
    whiteSpace: "nowrap",
    width: "full",
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
  const { t } = useTranslation(),
    sessionId = useFileLinkSession(),
    open = useCallback(() => {
      reportPromiseErrors(activateFileLink(sessionId, path, "open"));
    }, [path, sessionId]),
    reveal = useCallback(() => {
      reportPromiseErrors(activateFileLink(sessionId, path, "reveal"));
    }, [path, sessionId]);
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
