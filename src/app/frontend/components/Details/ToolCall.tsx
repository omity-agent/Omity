import {
  type DisplayToolCall,
  type DisplayToolOutput,
  type ToolCallPhase,
  canCancelToolCall,
} from "../../../timeline";
import { Frame } from "./Frame";
import { HighlightedCode } from "../HighlightedCode";
import { Wrench } from "lucide-react";
import { css } from "styled-system/css";
import { formatTokens } from "../../tokenUnits";
import { formatToolInput } from "../../../../fileLinks/toolInput";
import { useToolAccessory } from "./ToolAccessory";
import { useTranslation } from "react-i18next";

const ioGrid = css({
    borderTopColor: "line",
    borderTopWidth: "1px",
    display: "grid",
    gap: "3",
    gridTemplateColumns: {
      base: "minmax(0, 1fr)",
      xl: "repeat(2, minmax(0, 1fr))",
    },
    m: "3",
    minW: 0,
    mt: 0,
    pt: "3",
  }),
  ioPanel = css({
    alignContent: "start",
    display: "grid",
    gap: "2",
    minW: 0,
  }),
  panelTitle = css({
    alignItems: "center",
    color: "mutedStrong",
    display: "flex",
    fontSize: "xs",
    justifyContent: "space-between",
    m: 0,
  }),
  tokenCount = css({ color: "muted", fontFamily: "mono" }),
  codeBlock = css({
    maxH: "toolOutput",
    minH: "3rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  }),
  imageList = css({ display: "grid", gap: "2" }),
  outputImage = css({ display: "block", h: "auto", maxW: "full" });
export function ToolCall({
  call,
  latest,
  onCancel,
  output,
  phase,
}: {
  call: DisplayToolCall;
  latest: boolean;
  onCancel: (toolCallId: string) => Promise<void>;
  output?: DisplayToolOutput;
  phase: ToolCallPhase;
}) {
  const { t } = useTranslation(),
    cancellable = canCancelToolCall(phase),
    running = phase === "running",
    showOutput = output !== undefined || running,
    showOutputCode = output
      ? output.content.trim().length > 0 || output.images.length === 0
      : showOutput,
    inputCode = formatToolInput(call),
    frameAccessory = useToolAccessory({
      callId: call.id,
      cancellable,
      onCancel,
      phase,
    });
  return (
    <Frame
      accessory={frameAccessory}
      expandedInitially={latest}
      icon={Wrench}
      label={`${t("toolCall")}: ${call.name}`}
      title={call.name}
      tone="tool"
    >
      <div className={ioGrid}>
        <section className={ioPanel}>
          <p className={panelTitle}>
            <span>{t("input")}</span>
            <span className={tokenCount}>{formatTokens(call.inputTokens)}</span>
          </p>
          <HighlightedCode
            autoFollow={latest}
            className={codeBlock}
            code={inputCode}
            fileLinkMatches={call.fileLinks}
            language={call.rawInput === undefined ? "yaml" : "plaintext"}
          />
        </section>
        {showOutput ? (
          <section className={ioPanel}>
            <p className={panelTitle}>
              <span>{t("output")}</span>
              <span className={tokenCount}>
                {output ? formatTokens(output.outputTokens ?? 0) : t("unavailableTokens")}
              </span>
            </p>
            {showOutputCode ? (
              <HighlightedCode
                autoFollow={latest}
                className={codeBlock}
                code={output?.content ?? ""}
                fileLinkMatches={output?.fileLinks}
              />
            ) : null}
            {output && output.images.length > 0 ? (
              <div className={imageList}>
                {output.images.map((image, index) => (
                  <img
                    alt=""
                    className={outputImage}
                    key={`${image.mimeType}-${index.toString()}`}
                    src={image.src}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Frame>
  );
}
