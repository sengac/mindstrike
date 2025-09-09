import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import fastGlob from 'fast-glob';
import { logger } from './logger.js';

interface TodoItem {
  id: string;
  content: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class ToolSystem {
  private workspaceRoot: string;
  private todos: TodoItem[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadTodos();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to read'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'create_file',
        description: 'Create or overwrite a file with content',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to create'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'edit_file',
        description: 'Edit a file by replacing old_str with new_str',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to edit'
            },
            old_str: {
              type: 'string',
              description: 'String to find and replace'
            },
            new_str: {
              type: 'string',
              description: 'String to replace with'
            }
          },
          required: ['path', 'old_str', 'new_str']
        }
      },
      {
        name: 'list_directory',
        description: 'List files and directories in a path',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (defaults to workspace root)'
            }
          },
          required: []
        }
      },
      {
        name: 'bash',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          properties: {
            cmd: {
              type: 'string',
              description: 'Command to execute'
            },
            cwd: {
              type: 'string',
              description: 'Working directory for the command'
            }
          },
          required: ['cmd']
        }
      },
      {
        name: 'glob',
        description: 'Find files matching a pattern',
        parameters: {
          type: 'object',
          properties: {
            filePattern: {
              type: 'string',
              description: 'Glob pattern to match files'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results'
            }
          },
          required: ['filePattern']
        }
      },
      {
        name: 'grep',
        description: 'Search for text patterns in files',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Pattern to search for'
            },
            path: {
              type: 'string',
              description: 'File or directory to search in'
            },
            caseSensitive: {
              type: 'boolean',
              description: 'Whether to search case-sensitively'
            }
          },
          required: ['pattern']
        }
      },
      {
        name: 'todo_write',
        description: 'Write or update the todo list for task management',
        parameters: {
          type: 'object',
          properties: {
            todos: {
              type: 'array',
              description: 'Array of todo items'
            }
          },
          required: ['todos']
        }
      },
      {
        name: 'todo_read',
        description: 'Read the current todo list',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'mermaid',
        description: 'Render a Mermaid diagram from code',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The Mermaid diagram code to render'
            }
          },
          required: ['code']
        }
      },
      {
        name: 'get_diagnostics',
        description: 'Get diagnostics (errors, warnings) for a file or directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file or directory to check'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'format_file',
        description: 'Format a file using standard formatters',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file to format'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'undo_edit',
        description: 'Undo the last edit made to a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file to undo edit'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            num_results: {
              type: 'number',
              description: 'Number of results to return (default: 5, max: 10)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file (requires confirmation)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file to delete'
            }
          },
          required: ['path']
        }
      }
    ];
  }

  async executeTool(name: string, parameters: Record<string, any>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'read_file':
          return await this.readFile(parameters.path);
        
        case 'create_file':
          return await this.createFile(parameters.path, parameters.content);
        
        case 'edit_file':
          return await this.editFile(parameters.path, parameters.old_str, parameters.new_str);
        
        case 'list_directory':
          return await this.listDirectory(parameters.path || '');
        
        case 'bash':
          return await this.executeBash(parameters.cmd, parameters.cwd);
        
        case 'glob':
          return await this.globFiles(parameters.filePattern, parameters.limit);
        
        case 'grep':
          return await this.grepFiles(parameters.pattern, parameters.path, parameters.caseSensitive);
        
        case 'todo_write':
          return await this.writeTodos(parameters.todos);
        
        case 'todo_read':
          return await this.readTodos();
        
        case 'mermaid':
          return await this.renderMermaid(parameters.code);
        
        case 'get_diagnostics':
          return await this.getDiagnostics(parameters.path);
        
        case 'format_file':
          return await this.formatFile(parameters.path);
        
        case 'undo_edit':
          return await this.undoEdit(parameters.path);
        
        case 'web_search':
          return await this.webSearch(parameters.query, parameters.num_results);
        
        case 'delete_file':
          return await this.deleteFile(parameters.path);
        
        default:
          return {
            success: false,
            error: `Unknown tool: ${name}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async readFile(filePath: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    logger.debug('readFile operation', { 
      workspaceRoot: this.workspaceRoot, 
      filePath, 
      fullPath 
    });
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Add line numbers like the original tool
    const lines = content.split('\n');
    const numberedContent = lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
    
    return {
      success: true,
      output: numberedContent
    };
  }

  // New method for getting raw file content (for editing)
  async readFileRaw(filePath: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return {
        success: true,
        output: content
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async createFile(filePath: string, content: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    
    return {
      success: true,
      output: `Created file: ${filePath}`
    };
  }

  private async editFile(filePath: string, oldStr: string, newStr: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    if (!content.includes(oldStr)) {
      return {
        success: false,
        error: 'String not found in file'
      };
    }
    
    const newContent = content.replace(oldStr, newStr);
    await fs.writeFile(fullPath, newContent, 'utf-8');
    
    return {
      success: true,
      output: `Edited file: ${filePath}`
    };
  }

  private async listDirectory(dirPath: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    const files = entries
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name);
    
    return {
      success: true,
      output: files.join('\n')
    };
  }

  private async executeBash(command: string, cwd?: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      const workingDir = cwd ? path.resolve(this.workspaceRoot, cwd) : this.workspaceRoot;
      
      const child = spawn('bash', ['-c', command], {
        cwd: workingDir,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout || 'Command completed successfully'
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Command failed with exit code ${code}`
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }

  private async globFiles(pattern: string, limit?: number): Promise<ToolResult> {
    const files = await fastGlob(pattern, {
      cwd: this.workspaceRoot,
      absolute: false,
      dot: true
    });
    
    const sortedFiles = files.sort();
    const limitedFiles = limit ? sortedFiles.slice(0, limit) : sortedFiles;
    
    return {
      success: true,
      output: limitedFiles.join('\n')
    };
  }

  private async grepFiles(pattern: string, searchPath?: string, caseSensitive?: boolean): Promise<ToolResult> {
    const targetPath = searchPath ? path.resolve(this.workspaceRoot, searchPath) : this.workspaceRoot;
    const flags = caseSensitive ? '-n' : '-ni';
    
    return this.executeBash(`grep -r ${flags} "${pattern}" "${targetPath}" || true`);
  }

  // Todo management methods
  private async loadTodos(): Promise<void> {
    try {
      const todoPath = path.join(this.workspaceRoot, '.poweragent-todos.json');
      const content = await fs.readFile(todoPath, 'utf-8');
      this.todos = JSON.parse(content);
    } catch (error) {
      // File doesn't exist or invalid JSON, start with empty todos
      this.todos = [];
    }
  }

  private async saveTodos(): Promise<void> {
    try {
      const todoPath = path.join(this.workspaceRoot, '.poweragent-todos.json');
      await fs.writeFile(todoPath, JSON.stringify(this.todos, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  }

  private async writeTodos(todos: TodoItem[]): Promise<ToolResult> {
    this.todos = todos;
    await this.saveTodos();
    
    return {
      success: true,
      output: `Updated ${todos.length} todo items`
    };
  }

  private async readTodos(): Promise<ToolResult> {
    await this.loadTodos();
    
    return {
      success: true,
      output: JSON.stringify(this.todos, null, 2)
    };
  }

  // Mermaid diagram rendering
  private async renderMermaid(code: string): Promise<ToolResult> {
    // For now, just return the code as we don't have a renderer
    // In a full implementation, this would generate an image or HTML
    return {
      success: true,
      output: `Mermaid diagram saved:\n\`\`\`mermaid\n${code}\n\`\`\``
    };
  }

  // Diagnostics 
  private async getDiagnostics(targetPath: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, targetPath);
    
    try {
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        // Check for common linting/type checking tools
        const results = [];
        
        // Try TypeScript
        const tscResult = await this.executeBash(`cd "${fullPath}" && npx tsc --noEmit --pretty false 2>&1 || true`);
        if (tscResult.output && !tscResult.output.includes('not found')) {
          results.push(`TypeScript:\n${tscResult.output}`);
        }
        
        // Try ESLint
        const eslintResult = await this.executeBash(`cd "${fullPath}" && npx eslint . --format compact 2>&1 || true`);
        if (eslintResult.output && !eslintResult.output.includes('not found')) {
          results.push(`ESLint:\n${eslintResult.output}`);
        }
        
        return {
          success: true,
          output: results.length > 0 ? results.join('\n\n') : 'No diagnostics found'
        };
      } else {
        // Single file diagnostics - try file-specific tools
        const ext = path.extname(fullPath);
        let result = '';
        
        if (ext === '.ts' || ext === '.tsx') {
          const tscResult = await this.executeBash(`cd "${path.dirname(fullPath)}" && npx tsc --noEmit "${fullPath}" --pretty false 2>&1 || true`);
          result = tscResult.output || '';
        }
        
        return {
          success: true,
          output: result || 'No diagnostics found'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // File formatting
  private async formatFile(filePath: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    const ext = path.extname(fullPath);
    
    try {
      let formatCommand = '';
      
      switch (ext) {
        case '.ts':
        case '.tsx':
        case '.js':
        case '.jsx':
          formatCommand = `npx prettier --write "${fullPath}"`;
          break;
        case '.json':
          formatCommand = `npx prettier --write "${fullPath}"`;
          break;
        case '.md':
          formatCommand = `npx prettier --write "${fullPath}"`;
          break;
        default:
          return {
            success: false,
            error: `No formatter available for ${ext} files`
          };
      }
      
      const result = await this.executeBash(formatCommand);
      if (result.success) {
        return {
          success: true,
          output: `Formatted ${filePath}`
        };
      } else {
        return result;
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Undo edit functionality
  private async undoEdit(filePath: string): Promise<ToolResult> {
    // This is a simplified version - in practice you'd need to track edit history
    return {
      success: false,
      error: 'Undo functionality not yet implemented - would require edit history tracking'
    };
  }

  // Web search
  private async webSearch(query: string, numResults = 5): Promise<ToolResult> {
    try {
      const { chromium } = await import('playwright-extra');
      const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
      
      chromium.use(StealthPlugin.default());
      
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Use Google Gemini for search
      await page.goto(`https://gemini.google.com/app`);

      // Random delay
      await page.waitForTimeout(Math.floor(Math.random() * 4000 + 1000));

      // Scroll to simulate user activity
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      
      // Wait for input element to appear
      await page.waitForSelector('rich-textarea', { timeout: 60000 });

      const richText = page.locator('rich-textarea');
      await richText.click();
      await richText.type(query);

      // Wait for the button to appear
      await page.waitForTimeout(1000);

      await page.locator('[aria-label="Send message"]').click();
      
      // Wait for text to finish rendering (at least 60 seconds)
      await page.waitForSelector('[data-mat-icon-name="refresh"]', { timeout: 60000 });
      
      // Extract text content from prose element children
      const results = await page.evaluate((maxResults) => {
        const proseElement = document.querySelector('message-content');
        if (!proseElement) return [];
        
        const childElements = proseElement.children;
        const extractedResults = [];
        
        for (let i = 0; i < Math.min(childElements.length, maxResults); i++) {
          const element = childElements[i];
          const textContent = element.textContent?.trim() || '';
          
          if (textContent) {
            extractedResults.push({
              title: textContent.substring(0, 100) + '...',
              url: '',
              snippet: textContent
            });
          }
        }
        
        return extractedResults;
      }, numResults);
      
      await browser.close();
      
      if (results.length === 0) {
        return {
          success: true,
          output: 'No results found'
        };
      }
      
      // Format results
      const formattedResults = results.map((result, index) => {
        let formatted = `${index + 1}. **${result.title}**`;
        if (result.url) {
          formatted += `\n   ${result.url}`;
        }
        if (result.snippet) {
          formatted += `\n   ${result.snippet}`;
        }
        return formatted;
      }).join('\n\n');
      
      return {
        success: true,
        output: formattedResults
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Web search failed: ${error.message}`
      };
    }
  }

  // File deletion
  private async deleteFile(filePath: string): Promise<ToolResult> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    
    try {
      // Check if file exists
      await fs.access(fullPath);
      
      // Delete the file
      await fs.unlink(fullPath);
      
      return {
        success: true,
        output: `Successfully deleted file: ${filePath}`
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          success: false,
          error: `File not found: ${filePath}`
        };
      } else {
        return {
          success: false,
          error: `Failed to delete file: ${error.message}`
        };
      }
    }
  }
}
