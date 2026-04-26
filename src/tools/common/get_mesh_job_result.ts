/**
 * Tool for getting mesh job result via Gutsy AI Pro integration
 */

import { z } from 'zod';

import log from '@apify/log';

import { GutsyClient } from '../../integrations/gutsy/client.js';
import type { InternalToolArgs, ToolEntry, ToolInputSchema } from '../../types.js';
import { compileSchema } from '../../utils/ajv.js';
import { buildMCPResponse } from '../../utils/mcp.js';

/**
 * Zod schema for get-mesh-job-result tool arguments
 */
const getMeshJobResultArgs = z.object({
    jobId: z.string()
        .min(1)
        .describe('The ID of the mesh job to get result for'),
});

export const getMeshJobResultTool: ToolEntry = Object.freeze({
    type: 'internal',
    name: 'get-mesh-job-result',
    description: 'Get the result of a mesh generation job from Gutsy AI Pro service',
    inputSchema: z.toJSONSchema(getMeshJobResultArgs) as ToolInputSchema,
    ajvValidate: compileSchema(z.toJSONSchema(getMeshJobResultArgs)),
    call: async (toolArgs: InternalToolArgs) => {
        let jobId: string | undefined;

        try {
            const parsed = getMeshJobResultArgs.parse(toolArgs);
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

            const result = await client.getMeshJobResult(jobId);

            log.info('Retrieved mesh job result', { jobId, status: result.status });

            if (result.status === 'succeeded' && result.outputs && result.outputs.length > 0) {
                const outputs = result.outputs.map((output) => `Format: ${output.format}, Size: ${output.sizeBytes} bytes, URL: ${output.downloadUrl}, Expires: ${output.expiresAt}`,
                );

                return buildMCPResponse({
                    texts: [
                        `Mesh job result retrieved successfully`,
                        `Status: ${result.status}`,
                        `Created at: ${result.createdAt}`,
                        result.completedAt ? `Completed at: ${result.completedAt}` : '',
                        'Outputs:',
                        ...outputs,
                    ].filter(Boolean),
                    structuredContent: {
                        jobId: result.jobId,
                        status: result.status,
                        createdAt: result.createdAt,
                        completedAt: result.completedAt,
                        outputs: result.outputs,
                    },
                });
            } if (result.error) {
                return buildMCPResponse({
                    texts: [
                        `Mesh job failed`,
                        `Status: ${result.status}`,
                        `Error: ${result.error}`,
                        `Created at: ${result.createdAt}`,
                    ],
                    isError: true,
                });
            }
            return buildMCPResponse({
                texts: [
                    `Mesh job status: ${result.status}`,
                    `Created at: ${result.createdAt}`,
                    result.completedAt ? `Completed at: ${result.completedAt}` : '',
                ].filter(Boolean),
                structuredContent: {
                    jobId: result.jobId,
                    status: result.status,
                    createdAt: result.createdAt,
                    completedAt: result.completedAt,
                },
            });
        } catch (error) {
            const errorJobId = jobId || 'unknown job';
            log.error('Failed to get mesh job result', { error, jobId: errorJobId });
            return buildMCPResponse({
                texts: [`Error: ${error instanceof Error ? error.message : 'Failed to get mesh job result'}`],
                isError: true,
            });
        }
    },
} as const);
