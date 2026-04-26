/**
 * Tool for getting mesh job status via Gutsy AI Pro integration
 */

import { z } from 'zod';

import log from '@apify/log';

import { GutsyClient } from '../../integrations/gutsy/client.js';
import type { InternalToolArgs, ToolEntry, ToolInputSchema } from '../../types.js';
import { compileSchema } from '../../utils/ajv.js';
import { buildMCPResponse } from '../../utils/mcp.js';

/**
 * Zod schema for get-mesh-job-status tool arguments
 */
const getMeshJobStatusArgs = z.object({
    jobId: z.string()
        .min(1)
        .describe('The ID of the mesh job to get status for'),
});

export const getMeshJobStatusTool: ToolEntry = Object.freeze({
    type: 'internal',
    name: 'get-mesh-job-status',
    description: 'Get the status of a mesh generation job from Gutsy AI Pro service',
    inputSchema: z.toJSONSchema(getMeshJobStatusArgs) as ToolInputSchema,
    ajvValidate: compileSchema(z.toJSONSchema(getMeshJobStatusArgs)),
    call: async (toolArgs: InternalToolArgs) => {
        let jobId: string | undefined;

        try {
            const parsed = getMeshJobStatusArgs.parse(toolArgs);
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

            const result = await client.getMeshJobStatus(jobId);

            log.info('Retrieved mesh job status', { jobId, status: result.status });

            const statusText = `Status: ${result.status}`;
            const progressText = result.progress !== undefined ? `Progress: ${result.progress}%` : '';
            const stageText = result.stage ? `Stage: ${result.stage}` : '';
            const errorText = result.error ? `Error: ${result.error}` : '';

            return buildMCPResponse({
                texts: [
                    `Mesh job status retrieved successfully`,
                    statusText,
                    progressText,
                    stageText,
                    errorText,
                    `Created at: ${result.createdAt}`,
                    `Updated at: ${result.updatedAt}`,
                ].filter(Boolean),
                structuredContent: {
                    jobId: result.jobId,
                    status: result.status,
                    progress: result.progress,
                    stage: result.stage,
                    error: result.error,
                    createdAt: result.createdAt,
                    updatedAt: result.updatedAt,
                },
            });
        } catch (error) {
            const errorJobId = jobId || 'unknown job';
            log.error('Failed to get mesh job status', { error, jobId: errorJobId });
            return buildMCPResponse({
                texts: [`Error: ${error instanceof Error ? error.message : 'Failed to get mesh job status'}`],
                isError: true,
            });
        }
    },
} as const);
