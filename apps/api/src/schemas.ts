import { z, type ZodSchema } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const idSchema = z.object({ id: z.string().uuid() });

// Fastify compiles route schemas with AJV (JSON Schema draft 7), not an
// OpenAPI 3.0 validator. The OpenAPI target uses boolean exclusive bounds,
// which AJV rejects at startup for contracts containing positive numbers.
// Swagger derives its documentation from these runtime route schemas.
export function authBody(schema: ZodSchema<unknown>): { body: object } {
  return { body: zodToJsonSchema<'jsonSchema7'>(schema, { target: 'jsonSchema7' }) };
}
