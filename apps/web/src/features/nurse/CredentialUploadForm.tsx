"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { CredentialType } from "@shiftpatch/contracts";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { AppBar, UserAvatar } from "@/components/shells/NurseShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { OfflineBanner, useOnline } from "@/components/ui/OfflineBanner";
import { buildCredentialForm, CREDENTIALS_PATH, EMPTY_UPLOAD, mb, resolver, UPLOAD_ACCEPT, type UploadValues } from "./credential-upload";
import { useUploadCredential } from "./queries";

const optional = <small>(optional)</small>;
const required = <small>(required)</small>;

/**
 * One cohesive "Add credential" form (route /nurse/credentials/new). Only fields the API accepts:
 * type, licenseType (license), expiresOn (required for a license), screenedOn (TB only), file.
 * Progress is indeterminate: the API client uses fetch (no upload events) and owns auth + refresh,
 * so a progress-event XHR would bypass it.
 */
export function CredentialUploadForm({ initialType = "license" }: { initialType?: CredentialType }) {
  const router = useRouter();
  const upload = useUploadCredential();
  const online = useOnline();
  const [leaveTo, setLeaveTo] = useState<string | null>(null); // destination awaiting the "Discard?" answer
  const submitted = useRef(false);
  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors, isSubmitted },
  } = useForm<UploadValues>({ resolver, mode: "onChange", defaultValues: { type: initialType, ...EMPTY_UPLOAD } });
  const type = watch("type");
  // Which dates are required depends on `type`, but RHF only re-validates the changed field: re-check the
  // dependent ones when the type changes, but only once the user has submitted (a fresh form stays quiet).
  const typeSeen = useRef(type);
  useEffect(() => {
    if (typeSeen.current === type) return;
    typeSeen.current = type;
    if (isSubmitted || errors.expiresOn || errors.screenedOn) void trigger(["expiresOn", "screenedOn"]);
  }, [type, isSubmitted, errors.expiresOn, errors.screenedOn, trigger]);
  const file = watch("file")?.[0];
  const pending = upload.isPending;
  // Dirty from actual values, not RHF's isDirty: a picked-then-cleared file leaves an empty FileList vs the null default.
  const values = watch();
  const dirty = !!file || !!values.licenseType || !!values.expiresOn || !!values.screenedOn || type !== initialType;
  const guard = dirty && !submitted.current;

  // Browser-level guard (reload, close tab, external link) while there is unsaved input.
  useEffect(() => {
    if (!guard) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guard]);

  // In-app guard: client-side navigation (shell links, tabs, Back) never fires beforeunload, so intercept plain
  // left clicks on same-origin links in the capture phase. Known limit: browser Back/Forward (popstate) stays unguarded.
  useEffect(() => {
    if (!guard && !pending) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page / hash
      e.preventDefault();
      if (!pending) setLeaveTo(url.pathname + url.search + url.hash); // never navigate away mid-upload
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guard, pending]);

  const leave = () => {
    if (pending) return; // never navigate away mid-upload
    if (guard) setLeaveTo(CREDENTIALS_PATH);
    else router.push(CREDENTIALS_PATH);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await upload.mutateAsync(buildCredentialForm(values, values.file![0]!));
    } catch {
      return; // shown by the mutation's notify.error (413 / 415 / 503 text verbatim); values stay for a retry
    }
    submitted.current = true;
    router.push(CREDENTIALS_PATH);
  });

  return (
    <>
      <AppBar title="Add credential">
        <UserAvatar />
      </AppBar>
      <div className="body nurse-stack nurse-narrow">
        <OfflineBanner />
        <Link
          href={CREDENTIALS_PATH}
          className="nurse-notice-link"
        >
          <Icon name="left" size="sm" />
          Back to credentials
        </Link>
        <form onSubmit={onSubmit} noValidate className="card pad" aria-label="Add credential" aria-busy={pending || undefined}>
          <p className="muted nurse-upload-sub">An administrator reviews every credential you add. Fields marked required must be filled in.</p>

          <section aria-labelledby="cred-what-h" className="nurse-form-group">
            <h2 id="cred-what-h" className="nurse-list-h">
              1. What are you adding?
            </h2>
            <Field label={<>Credential type {required}</>} required>
              {(p) => (
                <Select {...p} {...register("type")}>
                  <option value="license">Nursing license</option>
                  <option value="tb_screening">TB screening</option>
                  <option value="other">Other document</option>
                </Select>
              )}
            </Field>
            {type === "license" && (
              <Field label={<>License type {optional}</>}>
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
          </section>

          <section aria-labelledby="cred-dates-h" className="nurse-form-group">
            <h2 id="cred-dates-h" className="nurse-list-h">
              2. Dates
            </h2>
            {type === "tb_screening" && (
              <Field label={<>Screening date {required}</>} error={errors.screenedOn?.message} required>
                {(p) => <Input {...p} {...register("screenedOn")} type="date" />}
              </Field>
            )}
            <Field
              label={<>Expiry date {type === "license" ? required : optional}</>}
              error={errors.expiresOn?.message}
              hint={type === "license" ? "A license needs an expiry date." : "Leave empty if the document does not expire."}
              required={type === "license"}
            >
              {(p) => <Input {...p} {...register("expiresOn")} type="date" data-testid="credential-expiry-date-input" />}
            </Field>
          </section>

          <section aria-labelledby="cred-file-h" className="nurse-form-group">
            <h2 id="cred-file-h" className="nurse-list-h">
              3. Document
            </h2>
            <Field label={<>File {required}</>} error={errors.file?.message} hint="PDF, JPG, PNG or HEIC. Up to 10 MB. On a phone you can take a photo." required>
              {(p) => (
                <>
                  <Button asChild variant="secondary" block className="relative justify-start has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
                    <label>
                      <Icon name="file" />
                      {file ? "Choose another file" : "Choose file or take photo"}
                      {/* Visually hidden, still focusable: the label shows the focus ring. No forced `capture`, so desktop works. */}
                      <input
                        id={p.id}
                        aria-describedby={p["aria-describedby"]}
                        aria-invalid={p["aria-invalid"]}
                        required={p.required}
                        {...register("file")}
                        type="file"
                        className="sr"
                        accept={UPLOAD_ACCEPT}
                        data-testid="credential-upload-input"
                      />
                    </label>
                  </Button>
                  {file && (
                    <div className="nurse-file-chip" data-testid="credential-file-name">
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
          </section>

          {pending && (
            <div className="nurse-progress-wrap" role="status">
              <div className="nurse-progress" role="progressbar" aria-label="Uploading credential" />
              <p className="muted">Uploading. Keep this page open.</p>
            </div>
          )}

          <div className="nurse-form-actions">
            <Button type="submit" loading={pending} disabled={!online}>
              {!pending && <Icon name="upload" />}
              {pending ? "Uploading…" : "Add credential"}
            </Button>
            <Button variant="secondary" onClick={leave} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={leaveTo !== null}
        onClose={() => setLeaveTo(null)}
        onConfirm={() => {
          submitted.current = true; // skip the beforeunload guard for this deliberate exit
          router.push(leaveTo ?? CREDENTIALS_PATH);
        }}
        title="Discard this credential?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
      >
        What you entered, including the chosen file, will be lost.
      </ConfirmDialog>
    </>
  );
}
