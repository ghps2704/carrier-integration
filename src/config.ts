import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  UPS_CLIENT_ID: z.string().min(1, 'UPS_CLIENT_ID is required'),
  UPS_CLIENT_SECRET: z.string().min(1, 'UPS_CLIENT_SECRET is required'),
  // Production: https://onlinetools.ups.com
  // CIE (testing): https://wwwcie.ups.com
  UPS_BASE_URL: z.string().url().default('https://onlinetools.ups.com'),
  UPS_AUTH_URL: z.string().url().default('https://wwwcie.ups.com/security/v1/oauth/token'),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return result.data;
}
