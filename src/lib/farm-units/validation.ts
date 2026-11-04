import { z } from "zod";

const uuid = z.uuid();
const dateTime = z.string().min(1);

export const farmUnitInputSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(2, "Informe o nome do núcleo.").max(120),
  code: z.string().trim().max(40).nullable(),
  description: z.string().trim().max(500).nullable(),
  isActive: z.boolean(),
});

export const farmUnitRowSchema = z.object({
  id: uuid,
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  created_at: dateTime,
});
