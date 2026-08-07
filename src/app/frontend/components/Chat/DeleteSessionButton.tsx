import { useCallback, useEffect, useState } from "react";
import { IconButton } from "../ParkUI";
import { Trash2 } from "lucide-react";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { useTranslation } from "react-i18next";

const armed = css({
  _hover: { bg: "statusError", color: "canvas" },
  bg: "statusError",
  color: "canvas",
});
export function DeleteSessionButton({
  disabled,
  onDelete,
}: {
  disabled: boolean;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
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
  const handleDelete = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    reportPromiseErrors(onDelete());
  }, [confirming, onDelete]);
  const label = t(confirming ? "confirmDelete" : "deleteSession");
  return (
    <IconButton
      aria-label={label}
      className={confirming ? armed : undefined}
      disabled={disabled}
      onClick={handleDelete}
      title={disabled ? t("pauseBeforeDelete") : label}
      type="button"
    >
      <Trash2 size={16} />
    </IconButton>
  );
}
