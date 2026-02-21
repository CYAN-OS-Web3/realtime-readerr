#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// MCP servers to start
const servers = [
  {
    name: 'filesystem',
    command: 'node',
    args: ['./node_modules/@modelcontextprotocol/server-filesystem/dist/index.js'],
    env: { FILESYSTEM_ROOT: './' }
  },
  {
    name: 'memory',
    command: 'node',
    args: ['./node_modules/@modelcontextprotocol/server-memory/dist/index.js']
  },
  {
    name: 'cyan-sdk',
    command: 'node',
    args: ['./mcp-server.js']
  }
];

console.log('🚀 Starting MCP servers...\n');

// Start each server
servers.forEach(server => {
  console.log(`Starting ${server.name}...`);
  
  const child = spawn(server.command, server.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...server.env }
  });
  
  child.stdout.on('data', (data) => {
    console.log(`[${server.name}] ${data.toString().trim()}`);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`[${server.name}] ERROR: ${data.toString().trim()}`);
  });
  
  child.on('error', (error) => {
    console.error(`[${server.name}] Failed to start: ${error.message}`);
  });
  
  child.on('close', (code) => {
    console.log(`[${server.name}] Exited with code ${code}`);
  });
});

console.log('\n✅ MCP servers started!');
console.log('You can now use MCP tools in your IDE or client.');
