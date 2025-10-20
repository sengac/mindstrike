#!/usr/bin/env node

/**
 * MindStrike CLI - AI Agent Control Interface
 *
 * Entry point for the mindstrike command-line tool.
 * Provides programmatic control over MindStrike app for AI agents.
 */

import { Command } from 'commander';
import { selectNode } from './commands/select-node.js';
import { createNode } from './commands/create-node.js';
import { getMindmap } from './commands/get-mindmap.js';
import { sendMessage } from './commands/send-message.js';

const program = new Command();

program
  .name('mindstrike')
  .description('MindStrike CLI for AI agent control')
  .version('0.1.0');

// Select node command
program
  .command('select-node <nodeId>')
  .description('Select a mind map node and update UI')
  .option('--format <format>', 'Output format (text|json)', 'text')
  .action(async (nodeId: string, options: { format: string }) => {
    try {
      await selectNode(nodeId, options);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

// Create node command
program
  .command('create-node <label>')
  .description('Create a new mind map node')
  .option('--parent <parentId>', 'Parent node ID')
  .option('--format <format>', 'Output format (text|json)', 'text')
  .action(async (label: string, options: { parent?: string; format: string }) => {
    try {
      await createNode(label, options);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

// Get mindmap command
program
  .command('get-mindmap')
  .description('Query mind map state as JSON')
  .option('--format <format>', 'Output format (text|json)', 'json')
  .action(async (options: { format: string }) => {
    try {
      await getMindmap(options);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

// Send message command
program
  .command('send-message <message>')
  .description('Send message and stream AI response')
  .option('--format <format>', 'Output format (text|json)', 'text')
  .action(async (message: string, options: { format: string }) => {
    try {
      await sendMessage(message, options);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

program.parse();
