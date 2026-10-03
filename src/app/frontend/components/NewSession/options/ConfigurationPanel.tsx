import { Button } from "../../ParkUI";
import { CapabilityGroup } from "./CapabilityGroup";
import { ModelInput } from "./ModelInput";
import { ProfilePicker } from "../ProfilePicker";
import { reportPromiseErrors } from "../../../services/errors";
import { setupFirst } from "../layout";
import { useCallback } from "react";
import type { useSessionPreferences } from "./preferences";
import { useTranslation } from "react-i18next";

export function ConfigurationPanel({
  availableProfiles,
  disabled,
  onProfileChange,
  selectedProfile,
  selection,
}: {
  availableProfiles: string[];
  disabled: boolean;
  onProfileChange: (profile?: string) => void;
  selectedProfile?: string;
  selection: ReturnType<typeof useSessionPreferences>;
}) {
  const { t } = useTranslation(),
    handleRetry = useCallback(() => reportPromiseErrors(selection.reload()), [selection]);
  return (
    <>
      <ProfilePicker
        available={availableProfiles}
        disabled={disabled}
        onChange={onProfileChange}
        selected={selectedProfile}
      />
      <ModelInput
        disabled={disabled || !selection.ready}
        model={selection.model}
        onChange={selection.handleModelChange}
      />
      {selection.error ? (
        <div className={setupFirst} role="alert">
          <p>{t("optionsLoadFailed", { message: selection.error.message })}</p>
          <Button disabled={disabled} onClick={handleRetry} type="button">
            {t("retry")}
          </Button>
        </div>
      ) : !selection.ready ? (
        <span className={setupFirst} role="status">
          {t("loadingOptions")}
        </span>
      ) : (
        <>
          <CapabilityGroup
            disabled={disabled}
            emptyLabel={t("noHooks")}
            label={t("hooks")}
            onChange={selection.handleHookChange}
            options={selection.hooks}
          />
          <CapabilityGroup
            disabled={disabled}
            emptyLabel={t("noMcpServers")}
            label={t("mcpServers")}
            onChange={selection.handleServerChange}
            options={selection.mcpServers}
          />
        </>
      )}
    </>
  );
}
