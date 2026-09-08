import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment contract.
 *
 * Every value the server needs is declared here and validated at boot.
 * There are no fallbacks for security-bearing values: a missing or weak
 * secret stops the process rather than producing a server that runs with
 * forgeable tokens.
 */

const secret = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters (generate with: openssl rand -hex 32)`);

const originList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.string().url('CORS_ORIGINS entries must be absolute URLs, e.g. https://app.example.com'))
      .min(1, 'CORS_ORIGINS must list at least one origin'),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(5000),

    MONGODB_URI: z
      .string({ required_error: 'MONGODB_URI is required' })
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGODB_URI must start with mongodb:// or mongodb+srv://',
      ),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(20),
    MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).max(50).default(2),

    JWT_SECRET: secret('JWT_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),

    // AES-256 key for health-field encryption: exactly 32 bytes as 64 hex
    // characters. Losing this means losing every encrypted field.
    ENCRYPTION_KEY: z
      .string({ required_error: 'ENCRYPTION_KEY is required' })
      .regex(
        /^[0-9a-fA-F]{64}$/,
        'ENCRYPTION_KEY must be 64 hex characters (generate with: openssl rand -hex 32)',
      ),

    /**
     * How long scan history and chat transcripts are kept. Enforced by a
     * MongoDB TTL index, so changing it and re-running migrations rebuilds the
     * index and applies the new window.
     */
    DATA_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(400),

    /** Version of the terms and privacy policy users are consenting to. */
    CONSENT_VERSION: z.string().min(1).default('2026-09-01'),

    APP_URL: z.string().url('APP_URL must be an absolute URL, e.g. https://vitalai.app'),
    API_URL: z.string().url('API_URL must be an absolute URL, e.g. https://api.vitalai.app'),
    CORS_ORIGINS: originList,

    LLM_PROVIDER: z.enum(['gemini', 'claude']).default('gemini'),
    GEMINI_API_KEY: z.string().min(1).optional(),
    CLAUDE_API_KEY: z.string().min(1).optional(),

    GEMINI_TEXT_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
    CLAUDE_TEXT_MODEL: z.string().min(1).default('claude-sonnet-4-5'),

    PINECONE_API_KEY: z.string({ required_error: 'PINECONE_API_KEY is required' }).min(1),
    PINECONE_INDEX_NAME: z.string().min(1).default('vitalai'),
    PINECONE_CLOUD: z.enum(['aws', 'gcp', 'azure']).default('aws'),
    PINECONE_REGION: z.string().min(1).default('us-east-1'),
    PINECONE_DIMENSION: z.coerce.number().int().positive().default(1536),

    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),

    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Error tracking. Optional, but a production deployment without it is one
    // where nobody learns about a new exception until a user reports it.
    SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL').optional(),
    /** Tags events with the deployed build, so a regression can be traced to a release. */
    RELEASE_VERSION: z.string().min(1).default('dev'),

    // Counters and cache. Required in production: in-process counters reset on
    // deploy and are per-instance, which makes a budget unenforceable.
    REDIS_URL: z
      .string()
      .refine(
        (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
        'REDIS_URL must start with redis:// or rediss://',
      )
      .optional(),

    // ---- cost controls ----
    /** Per-user daily input-token allowance across every AI route. */
    USER_DAILY_INPUT_TOKENS: z.coerce.number().int().min(1000).default(150_000),
    /** Per-user daily output-token allowance. Output costs roughly 8x input. */
    USER_DAILY_OUTPUT_TOKENS: z.coerce.number().int().min(500).default(40_000),
    /**
     * Whole-service daily spend ceiling in USD. Once crossed, AI routes return
     * a graceful message until the next UTC day. This is the only defence
     * against a bug or an attack that a per-user cap cannot see.
     */
    DAILY_SPEND_CEILING_USD: z.coerce.number().positive().default(25),

    // Prices per million tokens, so the spend estimate tracks reality without
    // a code change when the provider's pricing moves.
    PRICE_PER_MTOK_INPUT_USD: z.coerce.number().nonnegative().default(0.3),
    PRICE_PER_MTOK_OUTPUT_USD: z.coerce.number().nonnegative().default(2.5),

    // 'log' writes the message to the application log for local development.
    // Production is required to use 'smtp' (enforced below).
    EMAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    EMAIL_FROM: z.string().email().optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),

    /** How long a password-reset link stays valid. */
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  })
  .superRefine((value, ctx) => {
    if (value.LLM_PROVIDER === 'gemini' && !value.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY is required when LLM_PROVIDER=gemini',
      });
    }

    if (value.LLM_PROVIDER === 'claude' && !value.CLAUDE_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLAUDE_API_KEY'],
        message: 'CLAUDE_API_KEY is required when LLM_PROVIDER=claude',
      });
    }

    // Embeddings always come from Gemini regardless of the generation provider,
    // so the key is mandatory for retrieval to work at all.
    if (!value.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY is required: embeddings are generated by Gemini for every provider',
      });
    }

    const cloudinary = [
      value.CLOUDINARY_CLOUD_NAME,
      value.CLOUDINARY_API_KEY,
      value.CLOUDINARY_API_SECRET,
    ];
    if (cloudinary.some(Boolean) && !cloudinary.every(Boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLOUDINARY_CLOUD_NAME'],
        message:
          'Cloudinary is partially configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together, or none of them.',
      });
    }

    const google = [value.GOOGLE_CLIENT_ID, value.GOOGLE_CLIENT_SECRET];
    if (google.some(Boolean) && !google.every(Boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_ID'],
        message:
          'Google OAuth is partially configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither.',
      });
    }

    if (value.EMAIL_TRANSPORT === 'smtp') {
      const missing = (['EMAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] as const).filter(
        (key) => !value[key],
      );
      for (const key of missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when EMAIL_TRANSPORT=smtp`,
        });
      }
    }

    if (value.NODE_ENV === 'production') {
      if (!value.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message:
            'REDIS_URL is required in production: in-process counters reset on deploy and are not shared between instances, so token budgets and the spend ceiling would not be enforceable',
        });
      }

      if (value.EMAIL_TRANSPORT !== 'smtp') {
        // The log transport does not deliver anything. Allowing it in
        // production would silently discard every password-reset email.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_TRANSPORT'],
          message: 'EMAIL_TRANSPORT must be "smtp" in production; "log" does not deliver mail',
        });
      }

      if (value.ENCRYPTION_KEY === value.JWT_SECRET || value.ENCRYPTION_KEY === value.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message: 'ENCRYPTION_KEY must be distinct from the JWT secrets',
        });
      }

      if (value.JWT_SECRET === value.JWT_REFRESH_SECRET) {
        // Sharing one key means a refresh token verifies as an access token.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must differ from JWT_SECRET',
        });
      }

      const insecureOrigin = value.CORS_ORIGINS.find((origin) => origin.startsWith('http://'));
      if (insecureOrigin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: `CORS_ORIGINS must use https in production (got ${insecureOrigin})`,
        });
      }

      if (!value.APP_URL.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_URL'],
          message: 'APP_URL must use https in production',
        });
      }
    }

    if (value.MONGODB_MIN_POOL_SIZE > value.MONGODB_MAX_POOL_SIZE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONGODB_MIN_POOL_SIZE'],
        message: 'MONGODB_MIN_POOL_SIZE cannot exceed MONGODB_MAX_POOL_SIZE',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Treats a blank value as absent.
 *
 * .env.example ships optional settings with empty values (`REDIS_URL=`), and
 * dotenv reads those as empty strings rather than leaving them unset. Without
 * this, `.optional()` never applies and every optional field is validated as
 * the empty string — so following the example file verbatim stops the server
 * from booting. Doing it once here keeps the rule out of every field.
 */
function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string> {
  const cleaned: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') {
      cleaned[key] = value.trim();
    }
  }

  return cleaned;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(withoutBlanks(process.env));

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    process.stderr.write(
      [
        '',
        'VitalAI cannot start: the environment is invalid.',
        '',
        issues,
        '',
        'Copy .env.example to server/.env and fill in every value.',
        'Generate secrets with: openssl rand -hex 32',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Google OAuth is optional; routes check this before registering the strategy. */
export const googleOAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const googleCallbackUrl = `${env.API_URL}/api/auth/google/callback`;

/** Cloudinary is optional; uploads degrade to "analysis without a stored image". */
export const cloudinaryEnabled = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);
