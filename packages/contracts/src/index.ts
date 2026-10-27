import { z } from "zod";

export const SessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  institutionId: z.string().uuid(),
  role: z.enum(["admin", "reader"]),
});
export type SessionUser = z.infer<typeof SessionUser>;

export const AnnotationPut = z.object({
  tool: z.string().min(1).max(64),
  seriesUid: z.string().max(64).nullish(),
  imageId: z.string().max(512).nullish(),
  data: z.record(z.unknown()),
});
export type AnnotationPut = z.infer<typeof AnnotationPut>;

export const AnnotationRecord = z.object({
  uid: z.string(),
  studyUid: z.string(),
  seriesUid: z.string().nullable(),
  imageId: z.string().nullable(),
  tool: z.string(),
  data: z.record(z.unknown()),
  authorId: z.string().uuid(),
  authorEmail: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AnnotationRecord = z.infer<typeof AnnotationRecord>;

// Hanging protocol: rule fields are case-insensitive regex sources (see viewer-core hanging-protocols.ts)
const Rx = z.string().max(200).optional();
export const HangingProtocol = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  match: z.object({ modality: Rx, studyDescription: Rx, bodyPart: Rx }),
  layout: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  cells: z.array(z.object({ seriesDescription: Rx, modality: Rx, bodyPart: Rx })).max(4),
});

// keymap: command id -> key (e.g. "w"); only what the viewer needs to restore a user's setup
export const Preferences = z.object({
  keymap: z.record(z.string().max(32)).optional(),
  protocols: z.array(HangingProtocol).max(50).optional(),
});
export type Preferences = z.infer<typeof Preferences>;
