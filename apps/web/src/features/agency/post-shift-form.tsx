"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ShiftRole, type CreateShiftRequest, type Shift } from "@shiftpatch/contracts";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { AppDialog } from "@/components/ui/AppDialog";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { formatShiftEcho } from "@/lib/format";
import { useActiveMembership, useCreateShift } from "./queries";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mirrors `CreateShiftRequest` (role, YYYY-MM-DD, HH:MM, start ≠ end; overnight allowed) with human messages. */
export const PostShiftSchema = z
  .object({
    role: z.enum(ShiftRole.options, { error: "Pick a role" }),
    date: z.string().regex(ISO_DATE, "Enter a date"),
    startTime: z.string().regex(HHMM, "Use HH:MM"),
    endTime: z.string().regex(HHMM, "Use HH:MM"),
  })
  .refine((s) => s.startTime !== s.endTime, { message: "Start and end must differ", path: ["endTime"] });

type Values = z.output<typeof PostShiftSchema>;

/** Fallback when /api/me gave no timezone: the API's own default for a network without one. */
export const DEFAULT_TIMEZONE = "America/New_York";
/** `YYYY-MM-DD` of `now` in an IANA timezone (same computation as the API's `todayIn`). */
export const todayIn = (timezone: string, now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

/**
 * PostShiftSchema plus the past-date rule (Decisions 2026-11-10): new shifts can't be dated before today in the shift's
 * timezone. Form-only on purpose: the API keeps the spec's POST /api/shifts behaviour, and existing shifts are untouched.
 */
export const postShiftSchemaFor = (today: string) =>
  PostShiftSchema.refine((s) => s.date >= today, { message: "Pick today or a later date", path: ["date"] });

const ROLE_HINT: Record<Values["role"], string> = { RN: "Registered", LPN: "Licensed practical", CNA: "Nursing assistant" };

/** Live echo ("Sat, Oct 3, 2026 · 07:00 → 19:00 · 12 h · Overnight"), or null until date + both times are valid. */
export function echoLine(v: { date?: string; startTime?: string; endTime?: string }): string | null {
  if (!v.date || !ISO_DATE.test(v.date) || !v.startTime || !HHMM.test(v.startTime) || !v.endTime || !HHMM.test(v.endTime) || v.startTime === v.endTime) return null;
  return formatShiftEcho({ date: v.date, startTime: v.startTime, endTime: v.endTime });
}

/** Centered modal. Stays open on a server error so nothing typed is lost. */
export function PostShiftDialog({ open, onClose, agencyName, onPosted }: { open: boolean; onClose: () => void; agencyName: string; onPosted: (shift: Shift) => void }) {
  const create = useCreateShift();
  const formId = useId();
  const timezone = useActiveMembership().membership?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayIn(timezone); // recomputed on each render, so a dialog left open over midnight still uses the new day
  const schema = useMemo(() => postShiftSchemaFor(today), [today]);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof PostShiftSchema>, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: { date: "", startTime: "", endTime: "" },
  });
  const watched = useWatch({ control });
  const preview = echoLine(watched);
  const pending = create.isPending;

  const close = () => {
    if (pending) return;
    reset();
    onClose();
  };

  const onSubmit = handleSubmit((values) => {
    const body: CreateShiftRequest = values;
    create.mutate(body, {
      onSuccess: (shift) => {
        reset();
        onPosted(shift);
      },
    });
  });

  return (
    <AppDialog
      open={open}
      onClose={close}
      size="lg"
      blockClose={pending}
      title="Post a shift"
      description={`For ${agencyName}. Nurses who match see it right away.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending} data-testid="agency-post-shift-submit-button">
            Post shift
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate aria-busy={pending || undefined}>
        <fieldset className="fld ag-fieldset">
          <legend className="lbl">Role</legend>
          <div className="seg">
            {ShiftRole.options.map((role) => (
              <label key={role} className="chip ag-seg">
                <input type="radio" value={role} className="sr" {...register("role")} aria-invalid={errors.role ? true : undefined} aria-describedby={errors.role ? `${formId}-role-err` : undefined} />
                <span className="ag-seg-role">{role}</span>
                <span className="ag-seg-hint">{ROLE_HINT[role]}</span>
              </label>
            ))}
          </div>
          {errors.role?.message && (
            <p id={`${formId}-role-err`} className="errmsg">
              <Icon name="alert-circle" size="sm" />
              {errors.role.message}
            </p>
          )}
        </fieldset>
        <Field label="Date" error={errors.date?.message} required>
          {(p) => <Input {...p} type="date" min={today} {...register("date")} />}
        </Field>
        <div className="ag-two">
          <Field label="Start time" error={errors.startTime?.message} required>
            {(p) => <Input {...p} type="time" step={60} {...register("startTime")} />}
          </Field>
          <Field label="End time" error={errors.endTime?.message} required>
            {(p) => <Input {...p} type="time" step={60} {...register("endTime")} />}
          </Field>
        </div>
        <p className="alert al-info ag-note">
          <Icon name="info" />
          <span>Facility-local time, 24-hour. Ending earlier than the start is an overnight shift (ends next day).</span>
        </p>
        <div className="ag-preview" aria-live="polite">
          <Icon name="cal" />
          {preview ? <span className="tnum">{preview}</span> : <span className="muted">Pick a date and times to preview the shift.</span>}
        </div>
      </form>
    </AppDialog>
  );
}
