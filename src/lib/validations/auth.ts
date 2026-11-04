import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});

export const resetSchema = z.object({
  email: z.email("Informe um e-mail válido."),
});

export const passwordSchema = z.object({
  password: z.string().min(12, "Use pelo menos 12 caracteres."),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});
