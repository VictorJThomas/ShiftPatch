"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built
import type { CoverageRow } from "@shiftpatch/contracts";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { AppDialog } from "@/components/ui/AppDialog";
import { DetailList } from "@/components/ui/DetailList";
import { Icon } from "@/components/ui/Icon";
import { NurseDetailDialog } from "@/components/ui/NurseDetailDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useShiftNurse } from "@/lib/shift-nurse";
import { formatDate, formatShiftWhen, isOvernight, shiftHours } from "@/lib/format";


/** Every field of a shift for the admin, plus the claiming nurse's name and a way into their details. */
export function ShiftDetailsDialog({ shift, onClose }: { shift: CoverageRow | null; onClose: () => void }) {
  const [nurseOpen, setNurseOpen] = useState(false);
  const nurse = useShiftNurse(nurseOpen && shift ? shift.id : null);
  return (
    <>
      <AppDialog
        size="md"
        open={!!shift}
        onClose={() => {
          setNurseOpen(false);
          onClose();
        }}
        title="Shift details"
        footer={
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        }
      >
        {shift && (
          <DetailList
            items={[
              { label: "Shift ID", value: <span className="adm-id">{shift.id}</span>, icon: "file" },
              { label: "Agency", value: shift.agencyName, icon: "building" },
              { label: "Role", value: shift.role, icon: "brief" },
              { label: "Date", value: formatDate(shift.date), icon: "cal" },
              { label: "Time", value: `${formatShiftWhen(shift)}${isOvernight(shift) ? " · overnight" : ""}`, icon: "clock" },
              { label: "Duration", value: `${shiftHours(shift)} h` },
              { label: "Status", value: <StatusBadge status={shift.status} /> },
              {
                label: "Claimed by",
                icon: "user",
                value: shift.claimedByName ? (
                  <span>
                    {shift.claimedByName}{" "}
                    <Button variant="ghost" size="sm" onClick={() => setNurseOpen(true)}>
                      <Icon name="eye" />
                      View nurse details
                    </Button>
                  </span>
                ) : (
                  <span className="muted">Not claimed</span>
                ),
              },
            ]}
          />
        )}
      </AppDialog>
      <NurseDetailDialog
        open={nurseOpen && !!shift}
        onClose={() => setNurseOpen(false)}
        nurse={nurse.data}
        loading={nurse.isPending}
        error={nurse.isError ? nurse.error.message : undefined}
        onRetry={() => void nurse.refetch()}
      />
    </>
  );
}
