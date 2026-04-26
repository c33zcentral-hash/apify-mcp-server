/**
 * Tool for creating CAD generation jobs via Gutsy AI Pro integration
 */

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import log from '@apify/log';

import { GutsyClient } from '../../integrations/gutsy/client.js';
import type { CadJobCreateRequest } from '../../integrations/gutsy/types.js';
import type { InternalToolArgs, ToolEntry, ToolInputSchema } from '../../types.js';
import { compileSchema } from '../../utils/ajv.js';
import { buildMCPResponse } from '../../utils/mcp.js';

/**
 * Zod schema for create-cad-job tool arguments
 */
const createCadJobArgs = z.object({
    prompt: z.string()
        .min(1)
        .describe('Natural language design intent for the CAD model'),
    units: z.enum(['mm', 'cm', 'in'])
        .optional()
        .default('mm')
        .describe('Units for the CAD model'),
    format: z.enum(['step', 'iges', 'x_t'])
        .optional()
        .default('step')
        .describe('Output format for the CAD file'),
    constraints: z.object({
        maxBoundingBox: z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
        }).optional()
            .describe('Maximum bounding box dimensions'),
        minWallThickness: z.number()
            .optional()
            .describe('Minimum wall thickness'),
    }).optional()
        .describe('Geometry constraints for the CAD model'),
    quality: z.enum(['draft', 'balanced', 'high'])
        .optional()
        .default('balanced')
        .describe('Quality level for the CAD generation'),
});

export const createCadJobTool: ToolEntry = Object.freeze({
    type: 'internal',
    name: 'create-cad-job',
    description: 'Create a CAD generation job using Gutsy AI Pro service',
    inputSchema: z.toJSONSchema(createCadJobArgs) as ToolInputSchema,
    ajvValidate: compileSchema(z.toJSONSchema(createCadJobArgs)),
    call: async (toolArgs: InternalToolArgs) => {
        let prompt: string | undefined;

        try {
            const parsed = createCadJobArgs.parse(toolArgs);
            prompt = parsed.prompt;
            const { units, format, constraints, quality } = parsed;

            // Get configuration from environment variables
            const baseUrl = process.env.GUTSY_AI_PRO_BASE_URL || 'http://127.0.0.1:8787/v1';
            const apiToken = process.env.GUTSY_AI_PRO_API_TOKEN;

            if (!apiToken && baseUrl.includes('gutsy-ai-pro.example.com')) {
                return buildMCPResponse({
                    texts: ['Error: GUTSY_AI_PRO_API_TOKEN is required for hosted deployments'],
                    isError: true,
                });
            }

            const client = new GutsyClient({
                baseUrl,
                apiToken,
            });

            const request: CadJobCreateRequest = {
                prompt,
                units,
                format,
                quality,
            };

            if (constraints) {
                request.constraints = constraints;
            }

            const idempotencyKey = randomUUID();
            const result = await client.createCadJob(request, idempotencyKey);

            log.info('Created CAD job', { jobId: result.jobId, prompt: prompt.substring(0, 50) });

            return buildMCPResponse({
                texts: [
                    `CAD job created successfully`,
                    `Job ID: ${result.jobId}`,
                    `Status: ${result.status}`,
                    `Created at: ${result.createdAt}`,
                    result.estimatedCompletionSeconds ? `Estimated completion: ${result.estimatedCompletionSeconds} seconds` : '',
                    `Status URL: ${result.statusUrl}`,
                    `Result URL: ${result.resultUrl}`,
                ].filter(Boolean),
                structuredContent: {
                    jobId: result.jobId,
                    status: result.status,
                    createdAt: result.createdAt,
                    estimatedCompletionSeconds: result.estimatedCompletionSeconds,
                    statusUrl: result.statusUrl,
                    resultUrl: result.resultUrl,
                },
            });
        } catch (error) {
            const errorPrompt = prompt || 'unknown prompt';
            log.error('Failed to create CAD job', { error, prompt: errorPrompt });
            return buildMCPResponse({
                texts: [`Error: ${error instanceof Error ? error.message : 'Failed to create CAD job'}`],
                isError: true,
            });
        }
    },
} as const);
