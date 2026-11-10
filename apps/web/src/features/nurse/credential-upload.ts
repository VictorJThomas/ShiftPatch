import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import type { FieldErrors, Resolver } from "react-hook-form";
import { CREDENTIAL_MAX_BYTES, CREDENTIAL_MIME_TYPES, CredentialType, ErrorMessage, UploadCredentialFields } from "@shiftpatch/contracts";

export interface UploadValues {
  type: CredentialType;
  licenseType: "" | "RN" | "LPN" | "CNA";
  expiresOn: string;
  screenedOn: string;
  file: FileList | null;
}

export const NEW_CREDENTIAL_PATH = "/nurse/credentials/new";
export const CREDENTIALS_PATH = "/nurse/credentials";
export const UPLOAD_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,.heic";
export const EMPTY_UPLOAD: Omit<UploadValues, "type"> = { licenseType: "", expiresOn: "", screenedOn: "", file: null };

/** `?type=` preset for renewal links: anything but a known credential type falls back to a license. */
export function parseCredentialType(value: unknown): CredentialType {
  const parsed = CredentialType.safeParse(Array.isArray(value) ? value[0] : value);
  return parsed.success ? parsed.data : "license";
}

export const newCredentialHref = (type: CredentialType) => `${NEW_CREDENTIAL_PATH}?type=${type}`;

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
export const resolver: Resolver<UploadValues> = (values) => {
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

export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
