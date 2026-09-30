import { Button, Code, LinkButton } from "../ParkUI";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { AccessStatus } from "../../services/access";
import { css } from "styled-system/css";
import { useTranslation } from "react-i18next";

const page = css({
    alignItems: "center",
    background: "canvas",
    color: "text",
    display: "grid",
    fontFamily: "body",
    minHeight: "viewport",
    overflowY: "auto",
    padding: { _short: "3", base: "4", sm: "6" },
  }),
  card = css({
    background: "surface",
    borderColor: "lineStrong",
    borderWidth: "hairline",
    display: "grid",
    gap: "5",
    justifySelf: "center",
    maxWidth: "accessCard",
    padding: { _short: "5", base: "5", sm: "8" },
    width: "full",
  }),
  icon = css({ color: "mutedStrong" }),
  heading = css({ textStyle: "accessHeading" }),
  description = css({ color: "mutedStrong", lineHeight: "markdown" }),
  errorText = css({ color: "statusError", fontSize: "sm" }),
  action = css({ flexGrow: { base: 1, sm: 0 } }),
  actions = css({
    display: "flex",
    flexWrap: "wrap",
    gap: "3",
  });
interface AccessPageProps {
  busy: boolean;
  error?: string;
  status?: AccessStatus;
  ticketUrl?: string;
  onLogin: () => void;
  onRegister: () => void;
  onTicket: () => void;
  onContinue: () => void;
  setup: boolean;
}
export function AccessPage(props: AccessPageProps) {
  const { t } = useTranslation(),
    { busy, error, status, ticketUrl, onContinue, onLogin, onRegister, onTicket, setup } = props,
    localSetup =
      setup &&
      status?.local === true &&
      globalThis.location.origin !== status.publicOrigin &&
      [null, "manage"].includes(new URLSearchParams(globalThis.location.search).get("setup")),
    setupLink =
      ticketUrl ??
      (status?.publicOrigin
        ? new URL(globalThis.location.pathname, status.publicOrigin).href
        : undefined);
  return (
    <main className={page}>
      <section className={card}>
        {setup ? (
          <ShieldCheck className={icon} size={28} />
        ) : (
          <KeyRound className={icon} size={28} />
        )}
        <h1 className={heading}>{t(setup ? "accessSetupTitle" : "accessLoginTitle")}</h1>
        <p className={description}>
          {t(setup ? "accessSetupDescription" : "accessLoginDescription")}
        </p>
        {status && !status.configured && <p className={errorText}>{t("accessNotConfigured")}</p>}
        {ticketUrl && (
          <p className={description}>
            {t("accessSetupLink")} <Code>{ticketUrl}</Code>
          </p>
        )}
        {error && <p className={errorText}>{error}</p>}
        <div className={actions}>
          {setup ? (
            <>
              {localSetup && (
                <Button
                  className={action}
                  disabled={busy || !status.configured}
                  onClick={onTicket}
                  type="button"
                >
                  {t("accessCreateSetupLink")}
                </Button>
              )}
              {localSetup && setupLink && (
                <LinkButton className={action} href={setupLink}>
                  {t(ticketUrl ? "accessOpenSetupLink" : "accessOpenPublicOrigin")}
                </LinkButton>
              )}
              {!localSetup && (
                <Button className={action} disabled={busy} onClick={onRegister} type="button">
                  {t("accessRegister")}
                </Button>
              )}
              {localSetup && (
                <Button
                  className={action}
                  disabled={busy}
                  onClick={onContinue}
                  type="button"
                  variant="ghost"
                >
                  {t("accessContinueLocal")}
                </Button>
              )}
            </>
          ) : (
            <Button
              className={action}
              disabled={busy || !status?.configured}
              onClick={onLogin}
              type="button"
            >
              {t("accessVerify")}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
