import Button from "./Button.jsx";
import CopyButton from "./CopyButton.jsx";
import { t } from "../i18n/index.js";

function download(codes) {
  const url = URL.createObjectURL(new Blob([`${codes.join("\n")}\n`], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url; link.download = t("first.recovery.fileName");
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The one time list of recovery codes with ways to keep them.
export default function RecoveryCodesView({ codes }) {
  return (
    <div className="stack">
      <ul className="codes-grid" aria-label={t("first.recovery.title")}>
        {codes.map(code => <li key={code}>{code}</li>)}
      </ul>
      <div className="row">
        <Button size="sm" onClick={() => download(codes)}>{t("first.recovery.download")}</Button>
        <CopyButton text={codes.join("\n")} label={t("first.recovery.copyAll")} />
      </div>
    </div>
  );
}
