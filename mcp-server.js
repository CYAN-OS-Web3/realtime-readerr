#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError 
} = require('@modelcontextprotocol/sdk/types.js');

// Cyan SDK MCP Server
class CyanSDKMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'cyan-sdk-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'cyan_speak',
          description: 'Generate speech using Cyan SDK',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert to speech',
              },
              userId: {
                type: 'string',
                description: 'User ID for quota tracking',
              },
              language: {
                type: 'string',
                description: 'Language code (e.g., en-US, vi-VN)',
                default: 'en-US',
              },
              gender: {
                type: 'string',
                description: 'Voice gender (male/female)',
                default: 'female',
              },
              apiKey: {
                type: 'string',
                description: 'API key for authentication',
              },
              baseUrl: {
                type: 'string',
                description: 'Base URL of the API',
                default: 'https://translator-gateway.fly.dev',
              },
            },
            required: ['text', 'userId'],
          },
        },
        {
          name: 'cyan_clone_and_speak',
          description: 'Clone voice and generate speech using Cyan SDK',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert to speech',
              },
              userId: {
                type: 'string',
                description: 'User ID for quota tracking',
              },
              audioFile: {
                type: 'string',
                description: 'Path to audio file for voice cloning',
              },
              quality: {
                type: 'string',
                description: 'Audio quality (low/medium/high)',
                default: 'high',
              },
              apiKey: {
                type: 'string',
                description: 'API key for authentication',
              },
              baseUrl: {
                type: 'string',
                description: 'Base URL of the API',
                default: 'https://translator-gateway.fly.dev',
              },
            },
            required: ['text', 'userId', 'audioFile'],
          },
        },
        {
          name: 'cyan_check_quota',
          description: 'Check user quota and usage',
          inputSchema: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: 'User ID to check quota for',
              },
              apiKey: {
                type: 'string',
                description: 'API key for authentication',
              },
              baseUrl: {
                type: 'string',
                description: 'Base URL of the API',
                default: 'https://translator-gateway.fly.dev',
              },
            },
            required: ['userId'],
          },
        },
        {
          name: 'cyan_get_user_plan',
          description: 'Get user subscription plan',
          inputSchema: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: 'User ID to get plan for',
              },
              apiKey: {
                type: 'string',
                description: 'API key for authentication',
              },
              baseUrl: {
                type: 'string',
                description: 'Base URL of the API',
                default: 'https://translator-gateway.fly.dev',
              },
            },
            required: ['userId'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'cyan_speak':
            return await this.handleSpeak(args);
          case 'cyan_clone_and_speak':
            return await this.handleCloneAndSpeak(args);
          case 'cyan_check_quota':
            return await this.handleCheckQuota(args);
          case 'cyan_get_user_plan':
            return await this.handleGetUserPlan(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async handleSpeak(args) {
    const { text, userId, language = 'en-US', gender = 'female', apiKey, baseUrl = 'https://translator-gateway.fly.dev' } = args;
    
    const response = await fetch(`${baseUrl}/api/tts/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
      body: JSON.stringify({
        text,
        user_id: userId,
        language,
        gender,
      }),
    });

    if (!response.ok) {
      throw new Error(`Speak API failed: ${response.status} ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    return {
      content: [
        {
          type: 'text',
          text: `Speech generated successfully. Audio data: ${base64Audio.substring(0, 100)}... (${audioBuffer.byteLength} bytes)`,
        },
      ],
    };
  }

  async handleCloneAndSpeak(args) {
    const { text, userId, audioFile, quality = 'high', apiKey, baseUrl = 'https://translator-gateway.fly.dev' } = args;
    
    // For file handling, we'd need to read the file and create FormData
    // This is a simplified version
    const fs = require('fs');
    const FormData = require('form-data');
    
    if (!fs.existsSync(audioFile)) {
      throw new Error(`Audio file not found: ${audioFile}`);
    }
    
    const form = new FormData();
    form.append('sample', fs.createReadStream(audioFile));
    form.append('text', text);
    form.append('user_id', userId);
    form.append('quality', quality);
    
    const response = await fetch(`${baseUrl}/api/tts/clone-and-speak`, {
      method: 'POST',
      headers: {
        ...(apiKey && { 'x-api-key': apiKey }),
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Clone and speak API failed: ${response.status} ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    return {
      content: [
        {
          type: 'text',
          text: `Voice cloned and speech generated successfully. Audio data: ${base64Audio.substring(0, 100)}... (${audioBuffer.byteLength} bytes)`,
        },
      ],
    };
  }

  async handleCheckQuota(args) {
    const { userId, apiKey, baseUrl = 'https://translator-gateway.fly.dev' } = args;
    
    const response = await fetch(`${baseUrl}/api/user/quota?user_id=${encodeURIComponent(userId)}`, {
      headers: {
        ...(apiKey && { 'x-api-key': apiKey }),
      },
    });

    if (!response.ok) {
      throw new Error(`Quota check failed: ${response.status} ${response.statusText}`);
    }

    const quota = await response.json();
    
    return {
      content: [
        {
          type: 'text',
          text: `User quota information:\nPlan: ${quota.plan}\nUsage: ${quota.usage}\nLimit: ${quota.limit}\nPercentage: ${quota.percent}%`,
        },
      ],
    };
  }

  async handleGetUserPlan(args) {
    const { userId, apiKey, baseUrl = 'https://translator-gateway.fly.dev' } = args;
    
    const response = await fetch(`${baseUrl}/api/user/plan?user_id=${encodeURIComponent(userId)}`, {
      headers: {
        ...(apiKey && { 'x-api-key': apiKey }),
      },
    });

    if (!response.ok) {
      throw new Error(`Get user plan failed: ${response.status} ${response.statusText}`);
    }

    const plan = await response.json();
    
    return {
      content: [
        {
          type: 'text',
          text: `User plan information:\nPlan: ${plan.plan}\nFeatures: ${JSON.stringify(plan.features, null, 2)}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Cyan SDK MCP server running on stdio');
  }
}

// Run the server
const server = new CyanSDKMCPServer();
server.run().catch(console.error);
