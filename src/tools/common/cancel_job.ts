/**
 * Tool for canceling jobs via Gutsy AI Pro integration
 */

import { z } from 'zod';

import log from '@apify/log';

import { GutsyClient } from '../../integrations/gutsy/client.js';
import type { InternalToolArgs, ToolEntry, ToolInputSchema } from '../../types.js';
import { compileSchema } from '../../utils/ajv.js';
import { buildMCPResponse } from '../../utils/mcp.js';

/**
 * Zod schema for cancel-job tool arguments
 */
const cancelJobArgs = z.object({
    jobId: z.string()
        .min(1)
        .describe('The ID of the job (CAD or mesh) to cancel'),
});

export const cancelJobTool: ToolEntry = Object.freeze({
    type: 'internal',
    name: 'cancel-job',
    description: 'Cancel a CAD or mesh generation job in Gutsy AI Pro service',
    inputSchema: z.toJSONSchema(cancelJobArgs) as ToolInputSchema,
    ajvValidate: compileSchema(z.toJSONSchema(cancelJobArgs)),
    call: async (toolArgs: InternalToolArgs) => {
        let jobId: string | undefined;

        try {
            const parsed = cancelJobArgs.parse(toolArgs);
            jobId = parsed.jobId;

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

            const result = await client.cancelJob(jobId);

            log.info('Cancelled job', { jobId, status: result.status });

            return buildMCPResponse({
                texts: [
                    `Job cancellation request processed`,
                    `Job ID: ${result.jobId}`,
                    `Status: ${result.status}`,
                ],
                structuredContent: {
                    jobId: result.jobId,
                    status: result.status,
                },
            });
        } catch (error) {
            const errorJobId = jobId || 'unknown job';
            log.error('Failed to cancel job', { error, jobId: errorJobId });
            return buildMCPResponse({
                texts: [`Error: ${error instanceof Error ? error.message : 'Failed to cancel job'}`],
                isError: true,
            });
        }
    },
} as const);
