#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import * as util from 'util';

// Promisify exec for easier async/await usage
const execPromise = util.promisify(exec);

// Define paths (use absolute paths for reliability)
const pythonExecutablePath = "C:\\Users\\Joris\\Documents\\Cline\\MCP\\python-ai-tools\\.venv\\Scripts\\python.exe";
const pythonScriptPath = "C:\\Users\\Joris\\Documents\\Cline\\MCP\\python-ai-tools\\call_perplexity.py";

/**
 * Create an MCP server with capabilities for tools.
 */
const server = new Server(
  {
    name: "perplexity-mcp",
    version: "0.1.0",
    description: "MCP Server to call the Perplexity API using a Python script."
  },
  {
    capabilities: {
      tools: {},
      // Remove resources and prompts capabilities from the template
    },
  }
);

/**
 * Handler that lists available tools.
 * Exposes a single "call_perplexity" tool.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "call_perplexity",
        description: "Calls the Perplexity API using a Python script.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The prompt to send to the Perplexity API."
            }
          },
          required: ["prompt"]
        }
      }
    ]
  };
});

/**
 * Handler for the call_perplexity tool.
 * Executes the Python script with the provided prompt.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "call_perplexity") {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }

  const prompt = request.params.arguments?.prompt;
  if (typeof prompt !== 'string' || !prompt) {
      throw new McpError(ErrorCode.InvalidParams, "Missing or invalid 'prompt' argument.");
  }

  // Escape double quotes within the prompt for safe command line execution
  const escapedPrompt = prompt.replace(/"/g, '\\"');
  const command = `"${pythonExecutablePath}" "${pythonScriptPath}" "${escapedPrompt}"`;

  try {
    console.error(`Executing command: ${command}`); // Log the command being executed
    // Execute the python script
    // The PERPLEXITY_API_KEY is expected to be set in the environment where this MCP server runs (via cline_mcp_settings.json)
    // Set PYTHONIOENCODING=utf-8 to handle potential unicode characters in the output
    const { stdout, stderr } = await execPromise(command, {
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    if (stderr) {
      // Check if stderr contains a Python error trace or just warnings/info
      if (stderr.includes("Error:")) { // Simple check for the word "Error"
         console.error(`Python script error: ${stderr}`);
         throw new McpError(ErrorCode.InternalError, `Python script execution failed: ${stderr}`);
      } else {
         console.warn(`Python script stderr (non-fatal): ${stderr}`);
      }
    }

    console.log(`Python script stdout: ${stdout}`);

    // Return the output from the python script
    return {
      content: [{
        type: "text",
        text: stdout.trim() // Trim whitespace from the output
      }]
    };

  } catch (error: any) {
    console.error(`Error executing Python script: ${error}`);
    // Include stdout/stderr from the caught error if available
    const errorMessage = error.stderr || error.stdout || error.message || 'Unknown execution error';
    throw new McpError(ErrorCode.InternalError, `Failed to execute Python script: ${errorMessage}`);
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  server.onerror = (error) => console.error("[MCP Error]", error); // Add basic error logging
  process.on('SIGINT', async () => { // Graceful shutdown
      await server.close();
      process.exit(0);
  });
  await server.connect(transport);
  console.error('Perplexity MCP server running on stdio'); // Log to stderr so it doesn't interfere with stdout communication
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
