import Field from "../../components/Field.jsx";
import { t } from "../../i18n/index.js";
import { QUOTA_FIELDS } from "./quotaFields.js";

export default function QuotaFields({ values, onChange, problem }) {
  return (
    <div className="form-grid">
      {QUOTA_FIELDS.map(field => (
        <Field key={field.key} label={t(`users.quota.${field.key}`)} type="number" inputMode="decimal" dir="ltr" step={field.step} min={field.min} max={field.max}
          value={values[field.key]} onChange={event => onChange({ ...values, [field.key]: event.target.value })}
          error={problem === field.key ? t("users.quotaInvalid", { min: field.min, max: field.max }) : undefined} />
      ))}
    </div>
  );
}
