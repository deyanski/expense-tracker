import { z } from "zod";

export const employeeIdentitySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  employeeId: z.string().trim().min(1).max(64),
});

export type EmployeeIdentity = z.infer<typeof employeeIdentitySchema>;

export const directorIdentitySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  directorId: z.string().trim().min(1).max(64),
});

export type DirectorIdentity = z.infer<typeof directorIdentitySchema>;
