import { IconButton } from "../../../ParkUI";
import { Send } from "lucide-react";
import { css } from "styled-system/css";

const primary = css({
  _enabled: {
    _hover: { background: "mutedStrong", borderColor: "mutedStrong" },
    background: "text",
    borderColor: "text",
    color: "canvas",
  },
});
export function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <IconButton
      aria-label={label}
      className={disabled ? undefined : primary}
      disabled={disabled}
      title={label}
      type="submit"
    >
      <Send aria-hidden size={16} />
    </IconButton>
  );
}
