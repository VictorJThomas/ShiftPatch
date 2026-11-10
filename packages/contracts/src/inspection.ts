/**
 * Scoped inspection package (ESCALATION.md, Option D). Additive routes, not part of the 6 required ones.
 *
 * Privacy by shape: responses are z.strictObject and carry NO storage keys, file names, URLs or TB clinical results (none is stored:
 * TB is "screening on file" + date + status). Documents are listed by credential id only; a signed link is requested per document.
 *
 * Standalone on purpose: index.ts re-exports this file, so it cannot import index.ts (cycle). The few primitives are redefined.
 */
import { z } from "zod";

const IsoDate = z.iso.date();
const IsoInstant = z.iso.datetime({ offset: true });
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id");

export const INSPECTION_MAX_NURSES = 200;
export const INSPECTION_MAX_DAYS = 366;
export const INSPECTION_TTL_HOURS = 24;

/** Exact texts. Kept out of `ErrorMessage` (another workstream edits that object). */
export const InspectionMessage = {
  expired: "Inspection package expired", // 410: past expiresAt or revoked
  invalidPeriod: "Choose a period of at most 366 days", // 400
  invalidRequest: "Invalid request", // 400
  tbNeedsDocuments: "TB documents require attaching license documents", // 400 (DB CHECK inspection_packages_tb_needs_docs)
  singleNetwork: "Select nurses from a single network", // 400
  forbidden: "Forbidden", // 403 (same text as ErrorMessage.forbidden)
  notFound: "Not found", // 404
} as const;

const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
/** to >= from and an inclusive count of at most 366 days. */
const periodOk = (p: { from: string; to: string }) => daysBetween(p.from, p.to) >= 0 && daysBetween(p.from, p.to) < INSPECTION_MAX_DAYS;

/** GET /api/inspection/nurses?from&to */
export const InspectionNursesQuery = z.object({ from: IsoDate, to: IsoDate }).refine(periodOk, { message: InspectionMessage.invalidPeriod, path: ["to"] });
export const InspectionLicenseStatus = z.enum(["verified", "pending", "expired", "rejected", "none"]);
export const InspectionCandidate = z.strictObject({ id: Id, name: z.string().min(1), licenseStatus: InspectionLicenseStatus });
export const InspectionNursesResponse = z.strictObject({ nurses: z.array(InspectionCandidate) });

/** POST /api/inspection-packages. Strict: an unknown key is a 400, never silently dropped. */
export const CreateInspectionPackageRequest = z
  .strictObject({
    nurseIds: z.array(Id).min(1).max(INSPECTION_MAX_NURSES),
    from: IsoDate,
    to: IsoDate,
    includeDocuments: z.boolean().default(false),
    includeTbDocuments: z.boolean().default(false),
  })
  .refine(periodOk, { message: InspectionMessage.invalidPeriod, path: ["to"] })
  .refine((r) => new Set(r.nurseIds).size === r.nurseIds.length, { message: InspectionMessage.invalidRequest, path: ["nurseIds"] })
  .refine((r) => !r.includeTbDocuments || r.includeDocuments, { message: InspectionMessage.tbNeedsDocuments, path: ["includeTbDocuments"] });

export const InspectionPackage = z.strictObject({
  id: Id,
  createdByName: z.string().min(1),
  createdAt: IsoInstant,
  expiresAt: IsoInstant,
  revoked: z.boolean(),
  expired: z.boolean(), // past expiresAt (a revoked package is `revoked`, and also unusable)
  nurseCount: z.number().int(),
  from: IsoDate,
  to: IsoDate,
  includeDocuments: z.boolean(),
  includeTbDocuments: z.boolean(),
});
export const InspectionPackageResponse = z.strictObject({ package: InspectionPackage });
export const InspectionPackagesResponse = z.strictObject({ packages: z.array(InspectionPackage) });

export const InspectionLicense = z.strictObject({
  licenseType: z.enum(["RN", "LPN", "CNA"]).nullable(),
  number: z.string().nullable(),
  issuingState: z.string().nullable(),
  expiresOn: IsoDate.nullable(),
  status: z.enum(["pending", "verified", "rejected"]),
  verifiedByName: z.string().nullable(), // only for status = verified
  verifiedAt: IsoInstant.nullable(),
});
/** "Screening on file" + date + status. Never a clinical result. */
export const InspectionTb = z.strictObject({
  onFile: z.boolean(),
  screenedOn: IsoDate.nullable(),
  status: z.enum(["pending", "verified", "rejected"]).nullable(),
});
export const InspectionNurseSummary = z.strictObject({
  nurseId: Id,
  name: z.string().min(1),
  email: z.string().min(1),
  licenses: z.array(InspectionLicense),
  tb: InspectionTb,
});
/** A downloadable document: ids and kind only. No file name, key or URL. */
export const InspectionDocument = z.strictObject({
  credentialId: Id,
  nurseId: Id,
  nurseName: z.string().min(1),
  type: z.enum(["license", "tb_screening"]),
});
/** GET /api/inspection-packages/:id */
export const InspectionPackageDetailResponse = z.strictObject({
  package: InspectionPackage,
  nurses: z.array(InspectionNurseSummary),
  documents: z.array(InspectionDocument),
});

export const InspectionDocumentParams = z.object({ id: Id, credentialId: Id });
/** POST /api/inspection-packages/:id/documents/:credentialId/link: a 5-minute signed link. Fetch on click, never in advance. */
export const InspectionDocumentLinkResponse = z.strictObject({ url: z.url(), expiresAt: IsoInstant });

export type InspectionNursesQuery = z.infer<typeof InspectionNursesQuery>;
export type InspectionLicenseStatus = z.infer<typeof InspectionLicenseStatus>;
export type InspectionCandidate = z.infer<typeof InspectionCandidate>;
export type InspectionNursesResponse = z.infer<typeof InspectionNursesResponse>;
export type CreateInspectionPackageRequest = z.input<typeof CreateInspectionPackageRequest>;
export type InspectionPackage = z.infer<typeof InspectionPackage>;
export type InspectionPackageResponse = z.infer<typeof InspectionPackageResponse>;
export type InspectionPackagesResponse = z.infer<typeof InspectionPackagesResponse>;
export type InspectionLicense = z.infer<typeof InspectionLicense>;
export type InspectionTb = z.infer<typeof InspectionTb>;
export type InspectionNurseSummary = z.infer<typeof InspectionNurseSummary>;
export type InspectionDocument = z.infer<typeof InspectionDocument>;
export type InspectionPackageDetailResponse = z.infer<typeof InspectionPackageDetailResponse>;
export type InspectionDocumentLinkResponse = z.infer<typeof InspectionDocumentLinkResponse>;
