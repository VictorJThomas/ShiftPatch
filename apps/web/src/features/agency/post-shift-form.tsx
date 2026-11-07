"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ShiftRole, type CreateShiftRequest, type Shift } from "@shiftpatch/contracts";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { formatShiftWhen, isOvernight, shiftHours } from "@/lib/format";
import { useCreateShift } from "./queries";

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

const ROLE_HINT: Record<Values["role"], string> = { RN: "Registered", LPN: "Licensed practical", CNA: "Nursing assistant" };

/** "Fri, Oct 2 · 19:00 → Sat 07:00 · Overnight · 12 h", or null until date + both times are valid. */
export function previewLine(v: { date?: string; startTime?: string; endTime?: string }): string | null {
  if (!v.date || !ISO_DATE.test(v.date) || !v.startTime || !HHMM.test(v.startTime) || !v.endTime || !HHMM.test(v.endTime) || v.startTime === v.endTime) return null;
  const times = { startTime: v.startTime, endTime: v.endTime };
  return [formatShiftWhen({ date: v.date, ...times }), isOvernight(times) ? "Overnight" : null, `${shiftHours(times)} h`].filter(Boolean).join(" · ");
}

/** Right panel (≥720) / full-height sheet (<720). Stays open on a server error so nothing typed is lost. */
export function PostShiftDialog({ open, onClose, agencyName, onPosted }: { open: boolean; onClose: () => void; agencyName: string; onPosted: (shift: Shift) => void }) {
  const create = useCreateShift();
  const formId = useId();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof PostShiftSchema>, unknown, Values>({
    resolver: zodResolver(PostShiftSchema),
    defaultValues: { date: "", startTime: "", endTime: "" },
  });
  const watched = useWatch({ control });
  const preview = previewLine(watched);
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
    <Dialog
      open={open}
      onClose={close}
      variant="panel"
      title="Post a shift"
      description={`For ${agencyName}. Nurses who match see it right away.`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={pending} aria-busy={pending || undefined} data-testid="agency-post-shift-submit-button">
            {pending && <span className="spin" aria-hidden="true" />}
            Post shift
          </button>
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
          {(p) => <input {...p} type="date" {...register("date")} />}
        </Field>
        <div className="ag-two">
          <Field label="Start time" error={errors.startTime?.message} required>
            {(p) => <input {...p} type="time" step={60} {...register("startTime")} />}
          </Field>
          <Field label="End time" error={errors.endTime?.message} required>
            {(p) => <input {...p} type="time" step={60} {...register("endTime")} />}
          </Field>
        </div>
        <p className="hint ag-hint">Facility-local time, 24-hour. Ending earlier than the start is an overnight shift (ends next day).</p>
        <div className="ag-preview" aria-live="polite">
          <Icon name="cal" />
          {preview ? <span className="tnum">{preview}</span> : <span className="muted">Pick a date and times to preview the shift.</span>}
        </div>
      </form>
    </Dialog>
  );
}
