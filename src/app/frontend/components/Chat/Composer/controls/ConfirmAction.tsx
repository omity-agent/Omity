import { type ReactNode, useCallback, useEffect, useState } from "react";
import { IconButton } from "../../../ParkUI";
import { LoaderCircle } from "lucide-react";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../../../services/errors";
import { useTranslation } from "react-i18next";

const armed = css({
    _enabled: {
      _hover: { bg: "statusError", color: "canvas" },
      bg: "statusError",
      color: "canvas",
    },
  }),
  busyIcon = css({ animation: "spin 1s linear infinite" });
export function ConfirmAction({
  children,
  disabled = false,
  disabledLabel,
  label,
  confirmation,
  onConfirm,
}: {
  children: ReactNode;
  disabled?: boolean;
  disabledLabel?: string;
  label: string;
  confirmation: string;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation(),
    [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirming) {
      return undefined;
    }
    const timeout = globalThis.setTimeout(() => {
      setConfirming(false);
    }, 2000);
    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [confirming]);
  const handleClick = useCallback(() => {
      if (busy) {
        return;
      }
      if (!confirming) {
        setConfirming(true);
        return;
      }
      setConfirming(false);
      reportPromiseErrors(runConfirmedAction(onConfirm, setBusy));
    }, [busy, confirming, onConfirm]),
    resetConfirmation = useCallback(() => setConfirming(false), []),
    description = busy ? t("working") : confirming ? confirmation : label;
  return (
    <IconButton
      aria-busy={busy}
      aria-label={description}
      className={confirming ? armed : undefined}
      disabled={disabled || busy}
      onBlur={resetConfirmation}
      onClick={handleClick}
      title={disabled && disabledLabel ? disabledLabel : description}
      type="button"
    >
      {busy ? <LoaderCircle aria-hidden className={busyIcon} size={16} /> : children}
    </IconButton>
  );
}
async function runConfirmedAction(action: () => Promise<void>, setBusy: (busy: boolean) => void) {
  setBusy(true);
  try {
    await action();
  } finally {
    setBusy(false);
  }
}
