"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { CREDENTIAL_MAX_BYTES, CREDENTIAL_MIME_TYPES, ErrorMessage, UploadCredentialFields, type CredentialType } from "@shiftpatch/contracts";
import { Field, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useUploadCredential } from "./queries";

export interface UploadValues {
  type: CredentialType;
  licenseType: "" | "RN" | "LPN" | "CNA";
  expiresOn: string;
  screenedOn: string;
  file: FileList | null;
}

const FORM_ID = "credential-upload";
const ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,.heic";

/** Early, friendly version of the API's 413/415 (the server still sniffs the bytes). HEIC often has an empty MIME type. */
export function fileProblem(file: File | undefined): string | null {
  if (!file) return ErrorMessage.fileRequired;
  if (file.size > CREDENTIAL_MAX_BYTES) return ErrorMessage.fileTooLarge;
  const typeOk = (CREDENTIAL_MIME_TYPES as readonly string[]).includes(file.type) || /\.heic$/i.test(file.name);
  return typeOk ? null : ErrorMessage.unsupportedFileType;
}

/** Only the fields that apply to the chosen type are sent. */
function textFields(v: UploadValues) {
  return {
    type: v.type,
    licenseType: v.type === "license" && v.licenseType ? v.licenseType : undefined,
    expiresOn: v.expiresOn || undefined,
    screenedOn: v.type === "tb_screening" && v.screenedOn ? v.screenedOn : undefined,
  };
}

/** zod (`UploadCredentialFields`) for the text fields + the file checks, as one react-hook-form resolver. */
const resolver: Resolver<UploadValues> = (values) => {
  const errors: FieldErrors<UploadValues> = {};
  const parsed = UploadCredentialFields.safeParse(textFields(values));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof UploadValues;
      errors[key] ??= { type: issue.code, message: issue.code === "custom" ? issue.message : "Enter a valid date" };
    }
  }
  const problem = fileProblem(values.file?.[0]);
  if (problem) errors.file = { type: "file", message: problem };
  return Object.keys(errors).length ? { values: {}, errors } : { values, errors: {} };
};

export function buildCredentialForm(values: UploadValues, file: File): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(textFields(values))) if (value) form.append(key, value);
  form.append("file", file); // last: the API reads text fields before the file part
  return form;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Inline upload form, always on the Credentials page (QA D3): `credential-upload-input` and
 * `credential-expiry-date-input` exist from page load, once each, with no dialog to open first. The page's
 * "Upload" buttons preset the type and move focus here. The expiry field is shown for every type (required for
 * a license, optional otherwise); a TB screening adds its screening date.
 */
export function UploadCredentialForm({ type: presetType = "license", disabled = false }: { type?: CredentialType; disabled?: boolean }) {
  const upload = useUploadCredential();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<UploadValues>({
    resolver,
    values: { type: presetType, licenseType: "", expiresOn: "", screenedOn: "", file: null },
    resetOptions: { keepDirtyValues: false },
  });
  const type = watch("type");
  const file = watch("file")?.[0];

  const onSubmit = handleSubmit(async (values) => {
    try {
      await upload.mutateAsync(buildCredentialForm(values, values.file![0]!));
      reset({ type: values.type, licenseType: "", expiresOn: "", screenedOn: "", file: null });
    } catch {
      // shown by the mutation's notify.error (413 / 415 / 503 text verbatim); keep the values to retry
    }
  });

  return (
    <section className="card pad nurse-upload" aria-labelledby="upload-h" id="upload">
      <h2 id="upload-h" className="nurse-list-h">
        Upload a credential
      </h2>
      <p className="muted nurse-upload-sub">An administrator reviews it. Max 10 MB, PDF, JPG, PNG or HEIC.</p>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate>
        <Field label="Credential type" required>
          {(p) => (
            <Select {...p} {...register("type")}>
              <option value="license">Nursing license</option>
              <option value="tb_screening">TB screening</option>
              <option value="other">Other document</option>
            </Select>
          )}
        </Field>
        {type === "license" && (
          <Field label={<>License type <small>(optional)</small></>}>
            {(p) => (
              <Select {...p} {...register("licenseType")}>
                <option value="">Select</option>
                <option value="RN">RN</option>
                <option value="LPN">LPN</option>
                <option value="CNA">CNA</option>
              </Select>
            )}
          </Field>
        )}
        <Field label="File" error={errors.file?.message} hint={file ? undefined : "PDF, JPG, PNG or HEIC, up to 10 MB."} required>
          {(p) => (
            <>
              <label className="btn btn-secondary btn-block nurse-file">
                <Icon name="file" />
                {file ? "Choose another file" : "Choose file or take photo"}
                {/* Visually hidden, still focusable: the label shows the focus ring (nurse.css). No forced `capture`, so desktop works. */}
                <input
                  id={p.id}
                  aria-describedby={p["aria-describedby"]}
                  aria-invalid={p["aria-invalid"]}
                  required={p.required}
                  {...register("file")} type="file" className="sr" accept={ACCEPT} data-testid="credential-upload-input" />
              </label>
              {file && (
                <div className="nurse-file-chip">
                  <Icon name="file" />
                  <div>
                    <b>{file.name}</b>
                    <span className="muted tnum">{mb(file.size)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </Field>
        {type === "tb_screening" && (
          <Field label="Screening date" error={errors.screenedOn?.message} required>
            {(p) => <input {...p} {...register("screenedOn")} type="date" />}
          </Field>
        )}
        <Field
          label={type === "license" ? "Expiry date" : <>Expiry date <small>(optional)</small></>}
          error={errors.expiresOn?.message}
          hint={type === "license" ? "Required for licenses." : undefined}
          required={type === "license"}
        >
          {(p) => <input {...p} {...register("expiresOn")} type="date" data-testid="credential-expiry-date-input" />}
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={disabled || upload.isPending} aria-busy={upload.isPending || undefined}>
          {upload.isPending ? <span className="spin" aria-hidden="true" /> : <Icon name="upload" />}
          {upload.isPending ? "Uploading…" : "Upload"}
        </button>
      </form>
    </section>
  );
}
