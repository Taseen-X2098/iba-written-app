import { z } from "zod";

export const profileFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
  institute: z.string().trim().min(1, "Institute is required").max(300, "Institute is too long"),
  phone: z.string().trim().max(50, "Phone number is too long"),
});

export const signupSchema = profileFieldsSchema.extend({
  email: z.string().trim().email("Enter a valid email address").max(320),
  password: z.string().min(6, "Password must be at least 6 characters").max(128, "Password is too long"),
  confirmPassword: z.string(),
}).superRefine((value, context) => {
  if (value.password !== value.confirmPassword) {
    context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match" });
  }
});
