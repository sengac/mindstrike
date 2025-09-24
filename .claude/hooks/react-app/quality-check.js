#!/usr/bin/env node
/* global console, process */
/**
 * React App Quality Check Hook
 * Optimized for React applications with sensible defaults
 *
 * EXIT CODES:
 *   0 - Success (all checks passed)
 *   1 - General error (missing dependencies, etc.)
 *   2 - Quality issues found - ALL must be fixed (blocking)
 */

import { promises as fs } from 'fs';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if dependencies are installed
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!existsSync(nodeModulesPath)) {
  console.error('Installing hook dependencies...');
  try {
    execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
  } catch {
    console.error(
      'Failed to install hook dependencies. Please run: cd .claude/hooks/react-app && npm install'
    );
    process.exit(1);
  }
}

// Now import glob after ensuring it's installed
const { globSync } = await import('glob');

/**
 * Find project root by looking for package.json
 * @param {string} startPath - Starting directory path
 * @returns {string} Project root directory
 */
function findProjectRoot(startPath) {
  let currentPath = startPath;
  while (currentPath !== '/') {
    if (existsSync(path.join(currentPath, 'package.json'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  return process.cwd();
}

const projectRoot = findProjectRoot(__dirname);

/**
 * Intelligent TypeScript Config Cache with checksum validation
 * Handles multiple tsconfig files and maps files to appropriate configs
 */
class TypeScriptConfigCache {
  /**
   * Creates a new TypeScript config cache instance.
   * Loads existing cache or initializes empty cache.
   */
  constructor() {
    // Store cache in the hook's directory for isolation
    this.cacheFile = path.join(__dirname, 'tsconfig-cache.json');
    this.cache = { hashes: {}, mappings: {} };
    this.loadCache();
  }

  /**
   * Get config hash for cache validation
   * @param {string} configPath - Path to tsconfig file
   * @returns {string} SHA256 hash of config content
   */
  getConfigHash(configPath) {
    try {
      const content = readFileSync(configPath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  }

  /**
   * Find all tsconfig files in project
   * @returns {string[]} Array of tsconfig file paths
   */
  findTsConfigFiles() {
    try {
      // Use glob to find all tsconfig files
      return globSync('tsconfig*.json', { cwd: projectRoot }).map(file =>
        path.join(projectRoot, file)
      );
    } catch {
      // Fallback: manually check common config files
      const configs = [];
      const commonConfigs = [
        'tsconfig.json',
        'tsconfig.webview.json',
        'tsconfig.test.json',
        'tsconfig.node.json',
        'tsconfig.app.json',
        'tsconfig.lib.json',
      ];

      for (const config of commonConfigs) {
        const configPath = path.join(projectRoot, config);
        if (existsSync(configPath)) {
          configs.push(configPath);
        }
      }
      return configs;
    }
  }

  /**
   * Check if cache is valid by comparing config hashes
   * @returns {boolean} True if cache is valid
   */
  isValid() {
    const configFiles = this.findTsConfigFiles();

    // Check if we have the same number of configs
    if (Object.keys(this.cache.hashes).length !== configFiles.length) {
      return false;
    }

    // Check each config hash
    for (const configPath of configFiles) {
      const currentHash = this.getConfigHash(configPath);
      if (currentHash !== this.cache.hashes[configPath]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rebuild cache by parsing all configs and creating file mappings
   */
  rebuild() {
    this.cache = { hashes: {}, mappings: {} };

    // Process configs in priority order (most specific first)
    const configPriority = [
      'tsconfig.webview.json', // Most specific
      'tsconfig.test.json', // Test-specific
      'tsconfig.json', // Base config
    ];

    configPriority.forEach(configName => {
      const configPath = path.join(projectRoot, configName);
      if (!existsSync(configPath)) {
        return;
      }

      // Store hash for validation
      this.cache.hashes[configPath] = this.getConfigHash(configPath);

      try {
        const configContent = readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);

        // Build file pattern mappings
        if (config.include) {
          config.include.forEach(pattern => {
            // Only set if not already mapped by a more specific config
            if (!this.cache.mappings[pattern]) {
              this.cache.mappings[pattern] = {
                configPath,
                excludes: config.exclude || [],
              };
            }
          });
        }
      } catch {
        // Skip invalid configs
      }
    });

    this.saveCache();
  }

  /**
   * Load cache from disk
   */
  loadCache() {
    try {
      const cacheContent = readFileSync(this.cacheFile, 'utf8');
      this.cache = JSON.parse(cacheContent);
    } catch {
      // Cache doesn't exist or is invalid, will rebuild
      this.cache = { hashes: {}, mappings: {} };
    }
  }

  /**
   * Save cache to disk with file locking
   */
  saveCache() {
    const lockFile = `${this.cacheFile}.lock`;
    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Try to create lock file exclusively
        writeFileSync(lockFile, process.pid.toString(), { flag: 'wx' });

        try {
          // Save cache directly in hook directory (directory already exists)
          writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
        } finally {
          // Always remove lock file
          try {
            unlinkSync(lockFile);
          } catch {
            // Ignore unlock errors
          }
        }
        return; // Success
      } catch (e) {
        if (e.code === 'EEXIST' && retries < maxRetries - 1) {
          // Lock file exists, wait and retry
          retries++;
          // Simple backoff
          const delay = Math.min(50 * Math.pow(2, retries), 500);
          const start = Date.now();
          while (Date.now() - start < delay) {
            // Busy wait
          }
        } else {
          // Other error or max retries reached
          log.debug(`Cache save error: ${e.message}`);
          return;
        }
      }
    }
  }

  /**
   * Get appropriate tsconfig for a file
   * @param {string} filePath - File path to check
   * @returns {string} Path to appropriate tsconfig file
   */
  getTsConfigForFile(filePath) {
    // Ensure cache is valid
    if (!this.isValid()) {
      this.rebuild();
    }

    const relativePath = path.relative(projectRoot, filePath);

    // Check cached mappings first - these are from actual tsconfig includes
    // Sort patterns by specificity to match most specific first
    const sortedMappings = Object.entries(this.cache.mappings).sort(
      ([a], [b]) => {
        // More specific patterns first
        const aSpecificity = a.split('/').length + (a.includes('**') ? 0 : 10);
        const bSpecificity = b.split('/').length + (b.includes('**') ? 0 : 10);
        return bSpecificity - aSpecificity;
      }
    );

    for (const [pattern, mapping] of sortedMappings) {
      // Handle both old format (string) and new format (object with excludes)
      const configPath =
        typeof mapping === 'string' ? mapping : mapping.configPath;
      const excludes = typeof mapping === 'string' ? [] : mapping.excludes;

      if (this.matchesPattern(relativePath, pattern)) {
        // Check if file is excluded
        let isExcluded = false;
        for (const exclude of excludes) {
          if (this.matchesPattern(relativePath, exclude)) {
            isExcluded = true;
            break;
          }
        }

        if (!isExcluded) {
          return configPath;
        }
      }
    }

    // Fast heuristics for common cases not in cache
    // Webview files
    if (
      relativePath.includes('src/webview/') ||
      relativePath.includes('/webview/')
    ) {
      const webviewConfig = path.join(projectRoot, 'tsconfig.webview.json');
      if (existsSync(webviewConfig)) {
        return webviewConfig;
      }
    }

    // Test files
    if (
      relativePath.includes('/test/') ||
      relativePath.includes('.test.') ||
      relativePath.includes('.spec.')
    ) {
      const testConfig = path.join(projectRoot, 'tsconfig.test.json');
      if (existsSync(testConfig)) {
        return testConfig;
      }
    }

    // Default fallback
    return path.join(projectRoot, 'tsconfig.json');
  }

  /**
   * Simple pattern matching for file paths
   * @param {string} filePath - File path to test
   * @param {string} pattern - Glob-like pattern
   * @returns {boolean} True if file matches pattern
   */
  matchesPattern(filePath, pattern) {
    // Simple pattern matching - convert glob to regex
    // Handle the common patterns specially
    if (pattern.endsWith('/**/*')) {
      // For patterns like src/webview/**/* or src/protocol/**/*
      // Match any file under that directory
      const baseDir = pattern.slice(0, -5); // Remove /**/*
      return filePath.startsWith(baseDir);
    }

    // For other patterns, use regex conversion
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*\*/g, '🌟') // Temporary placeholder for **
      .replace(/\*/g, '[^/]*') // * matches anything except /
      .replace(/🌟/g, '.*') // ** matches anything including /
      .replace(/\?/g, '.'); // ? matches single character

    const regex = new RegExp(`^${regexPattern}$`);
    const result = regex.test(filePath);

    return result;
  }
}

// Global config cache instance
const tsConfigCache = new TypeScriptConfigCache();

// ANSI color codes
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[0;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  reset: '\x1b[0m',
};

/**
 * Load configuration from JSON file with environment variable overrides
 * @returns {Object} Configuration object
 */
function loadConfig() {
  let fileConfig = {};

  // Try to load hook-config.json
  try {
    const configPath = path.join(__dirname, 'hook-config.json');
    if (existsSync(configPath)) {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    }
  } catch {
    // Config file not found or invalid, use defaults
  }

  // Build config with file settings as base, env vars as overrides
  return {
    // TypeScript settings
    typescriptEnabled:
      process.env.CLAUDE_HOOKS_TYPESCRIPT_ENABLED !== undefined
        ? process.env.CLAUDE_HOOKS_TYPESCRIPT_ENABLED !== 'false'
        : (fileConfig.typescript?.enabled ?? true),

    showDependencyErrors:
      process.env.CLAUDE_HOOKS_SHOW_DEPENDENCY_ERRORS !== undefined
        ? process.env.CLAUDE_HOOKS_SHOW_DEPENDENCY_ERRORS === 'true'
        : (fileConfig.typescript?.showDependencyErrors ?? false),

    // ESLint settings
    eslintEnabled:
      process.env.CLAUDE_HOOKS_ESLINT_ENABLED !== undefined
        ? process.env.CLAUDE_HOOKS_ESLINT_ENABLED !== 'false'
        : (fileConfig.eslint?.enabled ?? true),

    eslintAutofix:
      process.env.CLAUDE_HOOKS_ESLINT_AUTOFIX !== undefined
        ? process.env.CLAUDE_HOOKS_ESLINT_AUTOFIX === 'true'
        : (fileConfig.eslint?.autofix ?? false),

    // Prettier settings
    prettierEnabled:
      process.env.CLAUDE_HOOKS_PRETTIER_ENABLED !== undefined
        ? process.env.CLAUDE_HOOKS_PRETTIER_ENABLED !== 'false'
        : (fileConfig.prettier?.enabled ?? true),

    prettierAutofix:
      process.env.CLAUDE_HOOKS_PRETTIER_AUTOFIX !== undefined
        ? process.env.CLAUDE_HOOKS_PRETTIER_AUTOFIX === 'true'
        : (fileConfig.prettier?.autofix ?? false),

    // General settings
    autofixSilent:
      process.env.CLAUDE_HOOKS_AUTOFIX_SILENT !== undefined
        ? process.env.CLAUDE_HOOKS_AUTOFIX_SILENT === 'true'
        : (fileConfig.general?.autofixSilent ?? false),

    debug:
      process.env.CLAUDE_HOOKS_DEBUG !== undefined
        ? process.env.CLAUDE_HOOKS_DEBUG === 'true'
        : (fileConfig.general?.debug ?? false),

    // Ignore patterns
    ignorePatterns: fileConfig.ignore?.patterns || [],

    // Store the full config for rule access
    _fileConfig: fileConfig,
  };
}

/**
 * Hook Configuration
 *
 * Configuration is loaded from (in order of precedence):
 * 1. Environment variables (highest priority)
 * 2. .claude/hooks/config.json file
 * 3. Built-in defaults
 */
const config = loadConfig();

// Logging functions - define before using
const log = {
  info: msg => console.error(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  error: msg => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  success: msg => console.error(`${colors.green}[OK]${colors.reset} ${msg}`),
  warning: msg => console.error(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  debug: msg => {
    if (config.debug) {
      console.error(`${colors.cyan}[DEBUG]${colors.reset} ${msg}`);
    }
  },
};

// Note: errors and autofixes are tracked per QualityChecker instance

// Try to load modules, but make them optional
let ESLint, prettier, ts;

/**
 * Quality checker for a single file.
 * Runs TypeScript, ESLint, and Prettier checks with optional auto-fixing.
 */
class QualityChecker {
  /**
   * Creates a new QualityChecker instance.
   * @param {string} filePath - Path to file to check
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.fileType = this.detectFileType(filePath);
    this.errors = [];
    this.autofixes = [];
  }

  /**
   * Detect file type from path
   * @param {string} filePath - File path
   * @returns {string} File type
   */
  detectFileType(filePath) {
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)) {
      return 'test';
    }
    if (/\/store\/|\/slices\/|\/reducers\//.test(filePath)) {
      return 'redux';
    }
    if (/\/components\/.*\.(tsx|jsx)$/.test(filePath)) {
      return 'component';
    }
    if (/\.(ts|tsx)$/.test(filePath)) {
      return 'typescript';
    }
    if (/\.(js|jsx)$/.test(filePath)) {
      return 'javascript';
    }
    return 'unknown';
  }

  /**
   * Run all quality checks
   * @returns {Promise<{errors: string[], autofixes: string[]}>} Check results
   */
  async checkAll() {
    // This should never happen now since we filter out non-source files earlier,
    // but keeping for consistency with shell version
    if (this.fileType === 'unknown') {
      log.info('Unknown file type, skipping detailed checks');
      return { errors: [], autofixes: [] };
    }

    // Run all checks in parallel for speed
    const checkPromises = [];

    if (config.typescriptEnabled) {
      checkPromises.push(this.checkTypeScript());
    }

    if (config.eslintEnabled) {
      checkPromises.push(this.checkESLint());
    }

    if (config.prettierEnabled) {
      checkPromises.push(this.checkPrettier());
    }

    checkPromises.push(this.checkCommonIssues());

    await Promise.all(checkPromises);

    // Check for related tests (not critical, so separate)
    await this.suggestRelatedTests();

    return {
      errors: this.errors,
      autofixes: this.autofixes,
    };
  }

  /**
   * Get file dependencies by parsing imports
   * @param {string} filePath - File to analyze
   * @returns {string[]} Array of file paths including dependencies
   */
  getFileDependencies(filePath) {
    const dependencies = new Set([filePath]);

    try {
      const content = readFileSync(filePath, 'utf8');
      const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Only include relative imports (project files)
        if (importPath.startsWith('.')) {
          const resolvedPath = this.resolveImportPath(filePath, importPath);
          if (resolvedPath && existsSync(resolvedPath)) {
            dependencies.add(resolvedPath);
          }
        }
      }
    } catch (e) {
      // If we can't parse imports, just use the original file
      log.debug(`Could not parse imports for ${filePath}: ${e.message}`);
    }

    return Array.from(dependencies);
  }

  /**
   * Resolve relative import path to absolute path
   * @param {string} fromFile - File doing the import
   * @param {string} importPath - Relative import path
   * @returns {string|null} Absolute file path or null if not found
   */
  resolveImportPath(fromFile, importPath) {
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, importPath);

    // Try common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    // Try index files
    for (const ext of extensions) {
      const indexPath = path.join(resolved, 'index' + ext);
      if (existsSync(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  /**
   * Check TypeScript compilation
   * @returns {Promise<void>}
   */
  async checkTypeScript() {
    if (!config.typescriptEnabled || !ts) {
      return;
    }

    // Skip TypeScript checking for JavaScript files in hook directories
    if (
      this.filePath.endsWith('.js') &&
      this.filePath.includes('.claude/hooks/')
    ) {
      log.debug('Skipping TypeScript check for JavaScript hook file');
      return;
    }

    log.info('Running TypeScript compilation check...');

    try {
      // Get intelligent config for this file
      const configPath = tsConfigCache.getTsConfigForFile(this.filePath);

      if (!existsSync(configPath)) {
        log.debug(`No TypeScript config found: ${configPath}`);
        return;
      }

      log.debug(
        `Using TypeScript config: ${path.basename(configPath)} for ${path.relative(projectRoot, this.filePath)}`
      );

      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
      );

      // Only check the edited file, not its dependencies
      // Dependencies will be type-checked with their own appropriate configs
      log.debug(`TypeScript checking edited file only`);

      // Create program with just the edited file
      const program = ts.createProgram([this.filePath], parsedConfig.options);
      const diagnostics = ts.getPreEmitDiagnostics(program);

      // Group diagnostics by file
      const diagnosticsByFile = new Map();
      diagnostics.forEach(d => {
        if (d.file) {
          const fileName = d.file.fileName;
          if (!diagnosticsByFile.has(fileName)) {
            diagnosticsByFile.set(fileName, []);
          }
          diagnosticsByFile.get(fileName).push(d);
        }
      });

      // Report edited file first
      const editedFileDiagnostics = diagnosticsByFile.get(this.filePath) || [];
      if (editedFileDiagnostics.length > 0) {
        this.errors.push(
          `TypeScript errors in edited file (using ${path.basename(configPath)})`
        );
        editedFileDiagnostics.forEach(diagnostic => {
          const message = ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            '\n'
          );
          const { line, character } =
            diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          console.error(
            `  ❌ ${diagnostic.file.fileName}:${line + 1}:${character + 1} - ${message}`
          );
        });
      }

      // Report dependencies separately (as warnings, not errors) - only if enabled
      if (config.showDependencyErrors) {
        let hasDepErrors = false;
        diagnosticsByFile.forEach((diags, fileName) => {
          if (fileName !== this.filePath) {
            if (!hasDepErrors) {
              console.error(
                '\n[DEPENDENCY ERRORS] Files imported by your edited file:'
              );
              hasDepErrors = true;
            }
            console.error(`  ⚠️ ${fileName}:`);
            diags.forEach(diagnostic => {
              const message = ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                '\n'
              );
              const { line, character } =
                diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
              console.error(
                `     Line ${line + 1}:${character + 1} - ${message}`
              );
            });
          }
        });
      }

      if (diagnostics.length === 0) {
        log.success('TypeScript compilation passed');
      }
    } catch (error) {
      log.debug(`TypeScript check error: ${error.message}`);
    }
  }

  /**
   * Check ESLint rules
   * @returns {Promise<void>}
   */
  async checkESLint() {
    if (!config.eslintEnabled || !ESLint) {
      return;
    }

    log.info('Running ESLint...');

    try {
      const eslint = new ESLint({
        fix: config.eslintAutofix,
        cwd: projectRoot,
      });

      const results = await eslint.lintFiles([this.filePath]);
      const result = results[0];

      if (result.errorCount > 0 || result.warningCount > 0) {
        if (config.eslintAutofix) {
          log.warning('ESLint issues found, attempting auto-fix...');

          // Write the fixed output
          if (result.output) {
            await fs.writeFile(this.filePath, result.output);

            // Re-lint to see if issues remain
            const resultsAfterFix = await eslint.lintFiles([this.filePath]);
            const resultAfterFix = resultsAfterFix[0];

            if (
              resultAfterFix.errorCount === 0 &&
              resultAfterFix.warningCount === 0
            ) {
              log.success('ESLint auto-fixed all issues!');
              if (config.autofixSilent) {
                this.autofixes.push(
                  'ESLint auto-fixed formatting/style issues'
                );
              } else {
                this.errors.push(
                  'ESLint issues were auto-fixed - verify the changes'
                );
              }
            } else {
              this.errors.push(
                `ESLint found issues that couldn't be auto-fixed in ${this.filePath}`
              );
              const formatter = await eslint.loadFormatter('stylish');
              const output = formatter.format(resultsAfterFix);
              console.error(output);
            }
          } else {
            this.errors.push(`ESLint found issues in ${this.filePath}`);
            const formatter = await eslint.loadFormatter('stylish');
            const output = formatter.format(results);
            console.error(output);
          }
        } else {
          this.errors.push(`ESLint found issues in ${this.filePath}`);
          const formatter = await eslint.loadFormatter('stylish');
          const output = formatter.format(results);
          console.error(output);
        }
      } else {
        log.success('ESLint passed');
      }
    } catch (error) {
      log.debug(`ESLint check error: ${error.message}`);
    }
  }

  /**
   * Check Prettier formatting
   * @returns {Promise<void>}
   */
  async checkPrettier() {
    if (!config.prettierEnabled || !prettier) {
      return;
    }

    log.info('Running Prettier check...');

    try {
      const fileContent = await fs.readFile(this.filePath, 'utf8');
      const prettierConfig = await prettier.resolveConfig(this.filePath);

      const isFormatted = await prettier.check(fileContent, {
        ...prettierConfig,
        filepath: this.filePath,
      });

      if (!isFormatted) {
        if (config.prettierAutofix) {
          log.warning('Prettier formatting issues found, auto-fixing...');

          const formatted = await prettier.format(fileContent, {
            ...prettierConfig,
            filepath: this.filePath,
          });

          await fs.writeFile(this.filePath, formatted);
          log.success('Prettier auto-formatted the file!');

          if (config.autofixSilent) {
            this.autofixes.push('Prettier auto-formatted the file');
          } else {
            this.errors.push(
              'Prettier formatting was auto-fixed - verify the changes'
            );
          }
        } else {
          this.errors.push(`Prettier formatting issues in ${this.filePath}`);
          console.error('Run prettier --write to fix');
        }
      } else {
        log.success('Prettier formatting correct');
      }
    } catch (error) {
      log.debug(`Prettier check error: ${error.message}`);
    }
  }

  /**
   * Check for common code issues
   * @returns {Promise<void>}
   */
  async checkCommonIssues() {
    log.info('Checking for common issues...');

    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const lines = content.split('\n');
      let foundIssues = false;

      // Check for CommonJS in all JS/TS files (must be ESM)
      // Check if file has ESM compatibility setup for __dirname/__filename
      const hasESMCompatibility = content.includes(
        'fileURLToPath(import.meta.url)'
      );

      const commonJSPatterns = [
        { pattern: /\brequire\s*\(/, name: 'require()' },
        { pattern: /module\.exports\s*=/, name: 'module.exports' },
        { pattern: /exports\.\w+\s*=/, name: 'exports.property' },
      ];

      // Only check for __dirname/__filename if ESM compatibility is not set up
      if (!hasESMCompatibility) {
        commonJSPatterns.push(
          {
            pattern: /__dirname(?!\s*=)/,
            name: '__dirname (use import.meta.url)',
          },
          {
            pattern: /__filename(?!\s*=)/,
            name: '__filename (use import.meta.url)',
          }
        );
      }

      lines.forEach((line, index) => {
        // Skip comments and lines that are part of ESM compatibility setup
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
          return;
        }

        // Skip the ESM compatibility declarations themselves
        if (
          trimmedLine.includes('= fileURLToPath(import.meta.url)') ||
          trimmedLine.includes('= dirname(__filename)')
        ) {
          return;
        }

        // Skip pattern definitions and regex literals
        if (trimmedLine.includes('pattern:') || trimmedLine.includes('name:')) {
          return;
        }

        commonJSPatterns.forEach(({ pattern, name }) => {
          if (pattern.test(line)) {
            this.errors.push(
              `Found CommonJS syntax '${name}' in ${this.filePath} - All files must use ES modules syntax only`
            );
            console.error(`  Line ${index + 1}: ${line.trim()}`);
            foundIssues = true;
          }
        });
      });

      // Check for 'any' type usage in TypeScript files
      const asAnyRule = config._fileConfig.rules?.asAny || {};
      if (
        (this.fileType === 'typescript' ||
          this.fileType === 'component' ||
          (this.fileType === 'test' && /\.(ts|tsx)$/.test(this.filePath))) &&
        asAnyRule.enabled !== false
      ) {
        lines.forEach((line, index) => {
          // Skip comments
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
            return;
          }

          // Check for various uses of 'any' and 'as unknown as'
          const anyPatterns = [
            { pattern: /\bas\s+any\b/, description: "'as any' type assertion" },
            { pattern: /:\s*any\b/, description: "': any' type annotation" },
            { pattern: /\bany\[\]/, description: "'any[]' array type" },
            {
              pattern: /\bArray<any>/,
              description: "'Array<any>' generic type",
            },
            {
              pattern: /\bPromise<any>/,
              description: "'Promise<any>' generic type",
            },
            {
              pattern: /\bRecord<[^,]+,\s*any>/,
              description: "'Record<K, any>' type",
            },
            { pattern: /<any[,>]/, description: "generic 'any' type" },
            {
              pattern: /\bas\s+unknown\s+as\b/,
              description: "'as unknown as' double assertion",
            },
          ];

          for (const { pattern, description } of anyPatterns) {
            if (pattern.test(line)) {
              const severity = asAnyRule.severity || 'error';
              const message =
                asAnyRule.message ||
                'Avoid using "any" type - use specific types, unknown, or generics instead';

              if (severity === 'error') {
                this.errors.push(
                  `Found ${description} in ${this.filePath} - ${message}`
                );
                console.error(`  Line ${index + 1}: ${line.trim()}`);
                foundIssues = true;
              } else {
                // Warning level - just warn, don't block
                log.warning(`${description} at line ${index + 1}: ${message}`);
              }
              break; // Only report once per line
            }
          }
        });
      }

      // Check for 'as unknown as' in TypeScript files
      if (
        this.fileType === 'typescript' ||
        this.fileType === 'component' ||
        (this.fileType === 'test' && /\.(ts|tsx)$/.test(this.filePath))
      ) {
        lines.forEach((line, index) => {
          if (line.includes('as unknown as')) {
            this.errors.push(
              `Found 'as unknown as' usage in ${this.filePath} - Use proper types instead of double type assertions`
            );
            console.error(`  Line ${index + 1}: ${line.trim()}`);
            foundIssues = true;
          }
        });
      }

      // Check for console statements based on React app rules
      const consoleRule = config._fileConfig.rules?.console || {};
      let allowConsole = false;

      // Check if console is allowed in this file
      if (consoleRule.enabled === false) {
        allowConsole = true;
      } else {
        // Check allowed paths
        const allowedPaths = consoleRule.allowIn?.paths || [];
        if (allowedPaths.some(path => this.filePath.includes(path))) {
          allowConsole = true;
        }

        // Check allowed file types
        const allowedFileTypes = consoleRule.allowIn?.fileTypes || [];
        if (allowedFileTypes.includes(this.fileType)) {
          allowConsole = true;
        }

        // Check allowed patterns
        const allowedPatterns = consoleRule.allowIn?.patterns || [];
        const fileName = path.basename(this.filePath);
        if (
          allowedPatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(fileName);
          })
        ) {
          allowConsole = true;
        }
      }

      // For React apps, console is generally allowed but shows as info
      if (!allowConsole && consoleRule.enabled !== false) {
        lines.forEach((line, index) => {
          if (/console\./.test(line)) {
            const severity = consoleRule.severity || 'info';
            const message =
              consoleRule.message || 'Consider using a logging library';

            if (severity === 'error') {
              this.errors.push(
                `Found console statements in ${this.filePath} - ${message}`
              );
              console.error(`  Line ${index + 1}: ${line.trim()}`);
              foundIssues = true;
            } else {
              // Info level - just warn, don't block
              log.warning(`Console usage at line ${index + 1}: ${message}`);
            }
          }
        });
      }

      // Check for TODO/FIXME comments
      lines.forEach((line, index) => {
        if (/TODO|FIXME/.test(line)) {
          log.warning(`Found TODO/FIXME comment at line ${index + 1}`);
        }
      });

      // Check for ESLint disable comments
      const eslintDisableRule = config._fileConfig.rules?.eslintDisable || {};
      if (
        eslintDisableRule.enabled !== false &&
        !this.filePath.endsWith('quality-check.js')
      ) {
        // Skip checking the quality-check.js file itself to avoid recursive issues
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();

          // Skip lines that are part of pattern definitions in code
          if (
            trimmedLine.includes('eslintDisablePatterns') ||
            trimmedLine.includes('eslintDisableStrings') ||
            (trimmedLine.includes('pattern:') &&
              trimmedLine.includes('eslint')) ||
            (trimmedLine.startsWith("'eslint-") &&
              trimmedLine.endsWith("',")) ||
            (trimmedLine.startsWith('"eslint-') && trimmedLine.endsWith('",'))
          ) {
            return;
          }

          // Check for actual ESLint disable usage
          const eslintDisableStrings = [
            'eslint-disable-next-line',
            'eslint-disable-line',
            'eslint-disable',
            'eslint-enable',
          ];

          for (const disableString of eslintDisableStrings) {
            if (line.includes(disableString)) {
              const severity = eslintDisableRule.severity || 'error';
              const message =
                eslintDisableRule.message ||
                'ESLint disable comments found - Fix the underlying issue instead of disabling the linter. Only use ESLint disable comments when absolutely necessary (e.g., in config files for specific, well-documented exceptions).';

              if (severity === 'error') {
                this.errors.push(
                  `Found ESLint disable comment in ${this.filePath} - ${message}`
                );
                console.error(`  Line ${index + 1}: ${line.trim()}`);
                foundIssues = true;
              } else {
                // Warning level - just warn, don't block
                log.warning(
                  `ESLint disable comment at line ${index + 1}: ${message}`
                );
              }
              break; // Only report once per line
            }
          }
        });
      }

      // Check for underscore prefix workaround for unused vars
      const underscorePrefixRule =
        config._fileConfig.rules?.underscorePrefix || {};
      if (underscorePrefixRule.enabled !== false) {
        // Common patterns where underscores are used to bypass no-unused-vars
        const underscorePatterns = [
          // Variable declarations with underscore prefix
          {
            pattern: /\b(?:const|let|var)\s+_\w+\s*[=:]/,
            description: 'underscore-prefixed variable',
          },
          // Function parameters with underscore prefix (including TypeScript type annotations)
          {
            pattern: /\(\s*_\w+\s*[:),]/,
            description: 'underscore-prefixed parameter',
          },
          {
            pattern: /,\s*_\w+\s*[:),]/,
            description: 'underscore-prefixed parameter',
          },
          // Arrow function parameters
          {
            pattern: /_\w+\s*=>/,
            description: 'underscore-prefixed arrow function parameter',
          },
          // Destructuring with underscore prefix
          {
            pattern: /{\s*_\w+\s*[,:}]/,
            description: 'underscore-prefixed destructuring',
          },
          {
            pattern: /\[\s*_\w+\s*[,\]]/,
            description: 'underscore-prefixed array destructuring',
          },
          // Catch clause parameters
          {
            pattern: /catch\s*\(\s*_\w+/,
            description: 'underscore-prefixed catch parameter',
          },
        ];

        lines.forEach((line, index) => {
          // Skip comments
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
            return;
          }

          // Skip legitimate underscore usage
          if (
            // Private methods/properties
            trimmedLine.includes('private _') ||
            trimmedLine.includes('this._') ||
            // ESM compatibility for __dirname and __filename
            trimmedLine.includes('__dirname') ||
            trimmedLine.includes('__filename') ||
            // Lodash or similar utility library usage
            trimmedLine.includes('import _') ||
            trimmedLine.includes('= _.')
          ) {
            return;
          }

          for (const { pattern, description } of underscorePatterns) {
            if (pattern.test(line)) {
              const severity = underscorePrefixRule.severity || 'error';
              const message =
                underscorePrefixRule.message ||
                "Remove unused variables instead of prefixing with underscore. If the parameter is required by an interface/callback, use a descriptive name or comment why it's unused.";

              if (severity === 'error') {
                this.errors.push(
                  `Found ${description} in ${this.filePath} - ${message}`
                );
                console.error(`  Line ${index + 1}: ${line.trim()}`);
                foundIssues = true;
              } else {
                // Warning level - just warn, don't block
                log.warning(`${description} at line ${index + 1}: ${message}`);
              }
              break; // Only report once per line
            }
          }
        });
      }

      // Check for void operator workaround
      const voidOperatorRule = config._fileConfig.rules?.voidOperator || {};
      if (
        voidOperatorRule.enabled !== false &&
        !this.filePath.endsWith('quality-check.js')
      ) {
        // Skip checking the quality-check.js file itself to avoid recursive issues
        // Common patterns where void is used to suppress no-unused-expressions
        const voidPatterns = [
          // void expressions
          {
            pattern: /\bvoid\s+[^;]+/,
            description: 'void operator usage',
          },
          // void with function calls
          {
            pattern: /\bvoid\s*\(/,
            description: 'void operator with parentheses',
          },
          // void 0 pattern
          {
            pattern: /\bvoid\s+0\b/,
            description: 'void 0 usage',
          },
        ];

        lines.forEach((line, index) => {
          // Skip comments
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
            return;
          }

          // Skip legitimate void usage (e.g., in type definitions)
          if (
            // TypeScript void return type
            trimmedLine.includes(': void') ||
            trimmedLine.includes('<void>') ||
            trimmedLine.includes('Promise<void>') ||
            // Function return type
            trimmedLine.includes('=> void') ||
            (trimmedLine.includes('function') && trimmedLine.includes('void'))
          ) {
            return;
          }

          for (const { pattern, description } of voidPatterns) {
            if (pattern.test(line)) {
              const severity = voidOperatorRule.severity || 'error';
              const message =
                voidOperatorRule.message ||
                "Don't use void operator to suppress no-unused-expressions. Fix the underlying issue or use proper patterns.";

              if (severity === 'error') {
                this.errors.push(
                  `Found ${description} in ${this.filePath} - ${message}`
                );
                console.error(`  Line ${index + 1}: ${line.trim()}`);
                foundIssues = true;
              } else {
                // Warning level - just warn, don't block
                log.warning(`${description} at line ${index + 1}: ${message}`);
              }
              break; // Only report once per line
            }
          }
        });
      }

      if (!foundIssues) {
        log.success('No common issues found');
      }
    } catch (error) {
      log.debug(`Common issues check error: ${error.message}`);
    }
  }

  /**
   * Suggest related test files
   * @returns {Promise<void>}
   */
  async suggestRelatedTests() {
    // Skip for test files
    if (this.fileType === 'test') {
      return;
    }

    const baseName = this.filePath.replace(/\.[^.]+$/, '');
    const testExtensions = ['test.ts', 'test.tsx', 'spec.ts', 'spec.tsx'];
    let hasTests = false;

    for (const ext of testExtensions) {
      try {
        await fs.access(`${baseName}.${ext}`);
        hasTests = true;
        log.warning(`💡 Related test found: ${path.basename(baseName)}.${ext}`);
        log.warning('   Consider running the tests to ensure nothing broke');
        break;
      } catch {
        // File doesn't exist, continue
      }
    }

    if (!hasTests) {
      // Check __tests__ directory
      const dir = path.dirname(this.filePath);
      const fileName = path.basename(this.filePath);
      const baseFileName = fileName.replace(/\.[^.]+$/, '');

      for (const ext of testExtensions) {
        try {
          await fs.access(
            path.join(dir, '__tests__', `${baseFileName}.${ext}`)
          );
          hasTests = true;
          log.warning(
            `💡 Related test found: __tests__/${baseFileName}.${ext}`
          );
          log.warning('   Consider running the tests to ensure nothing broke');
          break;
        } catch {
          // File doesn't exist, continue
        }
      }
    }

    if (!hasTests) {
      log.warning(`💡 No test file found for ${path.basename(this.filePath)}`);
      log.warning('   Consider adding tests for better code quality');
    }

    // Special reminders for specific file types
    if (/\/state\/slices\//.test(this.filePath)) {
      log.warning('💡 Redux state file! Consider testing state updates');
    } else if (/\/components\//.test(this.filePath)) {
      log.warning('💡 Component file! Consider testing UI behavior');
    } else if (/\/services\//.test(this.filePath)) {
      log.warning('💡 Service file! Consider testing business logic');
    }
  }
}

/**
 * Parse JSON input from stdin
 * @returns {Promise<Object>} Parsed JSON object
 */
async function parseJsonInput() {
  let inputData = '';

  // Read from stdin
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  if (!inputData.trim()) {
    log.warning(
      'No JSON input provided. This hook expects JSON input from Claude Code.'
    );
    log.info(
      'For testing, provide JSON like: echo \'{"tool_name":"Edit","tool_input":{"file_path":"/path/to/file.ts"}}\' | node hook.js'
    );
    console.error(
      `\n${colors.yellow}👉 Hook executed but no input to process.${colors.reset}`
    );
    process.exit(0);
  }

  try {
    return JSON.parse(inputData);
  } catch (error) {
    log.error(`Failed to parse JSON input: ${error.message}`);
    log.debug(`Input was: ${inputData}`);
    process.exit(1);
  }
}

/**
 * Extract file path from tool input
 * @param {Object} input - Tool input object
 * @returns {string|null} File path or null
 */
function extractFilePath(input) {
  const { tool_input } = input;
  if (!tool_input) {
    return null;
  }

  return (
    tool_input.file_path || tool_input.path || tool_input.notebook_path || null
  );
}

/**
 * Check if file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file is a source file
 * @param {string} filePath - Path to check
 * @returns {boolean} True if source file
 */
function isSourceFile(filePath) {
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

/**
 * Print summary of errors and autofixes
 * @param {string[]} errors - List of errors
 * @param {string[]} autofixes - List of autofixes
 */
function printSummary(errors, autofixes) {
  // Show auto-fixes if any
  if (autofixes.length > 0) {
    console.error(`\n${colors.blue}═══ Auto-fixes Applied ═══${colors.reset}`);
    autofixes.forEach(fix => {
      console.error(`${colors.green}✨${colors.reset} ${fix}`);
    });
    console.error(
      `${colors.green}Automatically fixed ${autofixes.length} issue(s) for you!${colors.reset}`
    );
  }

  // Show errors if any
  if (errors.length > 0) {
    console.error(
      `\n${colors.blue}═══ Quality Check Summary ═══${colors.reset}`
    );
    errors.forEach(error => {
      console.error(`${colors.red}❌${colors.reset} ${error}`);
    });

    console.error(
      `\n${colors.red}Found ${errors.length} issue(s) that MUST be fixed!${colors.reset}`
    );
    console.error(
      `${colors.red}════════════════════════════════════════════${colors.reset}`
    );
    console.error(`${colors.red}❌ ALL ISSUES ARE BLOCKING ❌${colors.reset}`);
    console.error(
      `${colors.red}════════════════════════════════════════════${colors.reset}`
    );
    console.error(
      `${colors.red}Fix EVERYTHING above until all checks are ✅ GREEN${colors.reset}`
    );
  }
}

/**
 * Main entry point
 * @returns {Promise<void>}
 */
async function main() {
  // Show header with version
  const hookVersion = config._fileConfig.version || '1.0.0';
  console.error('');
  console.error(`⚛️  React App Quality Check v${hookVersion} - Starting...`);
  console.error('────────────────────────────────────────────');

  // Debug: show loaded configuration
  log.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);

  // Load optional modules
  try {
    const eslintModule = await import(
      path.join(projectRoot, 'node_modules', 'eslint', 'lib', 'api.js')
    );
    ESLint = eslintModule.ESLint;
  } catch {
    log.debug('ESLint not found in project - will skip ESLint checks');
  }

  try {
    prettier = await import(
      path.join(projectRoot, 'node_modules', 'prettier', 'index.cjs')
    );
    prettier = prettier.default || prettier;
  } catch {
    log.debug('Prettier not found in project - will skip Prettier checks');
  }

  try {
    ts = await import(
      path.join(
        projectRoot,
        'node_modules',
        'typescript',
        'lib',
        'typescript.js'
      )
    );
    ts = ts.default || ts;
  } catch {
    log.debug('TypeScript not found in project - will skip TypeScript checks');
  }

  // Parse input
  const input = await parseJsonInput();
  const filePath = extractFilePath(input);

  if (!filePath) {
    log.warning(
      'No file path found in JSON input. Tool might not be file-related.'
    );
    log.debug(`JSON input was: ${JSON.stringify(input)}`);
    console.error(
      `\n${colors.yellow}👉 No file to check - tool may not be file-related.${colors.reset}`
    );
    process.exit(0);
  }

  // Check if file exists
  if (!(await fileExists(filePath))) {
    log.info(`File does not exist: ${filePath} (may have been deleted)`);
    console.error(
      `\n${colors.yellow}👉 File skipped - doesn't exist.${colors.reset}`
    );
    process.exit(0);
  }

  // For non-source files, exit successfully without checks (matching shell behavior)
  if (!isSourceFile(filePath)) {
    log.info(`Skipping non-source file: ${filePath}`);
    console.error(
      `\n${colors.yellow}👉 File skipped - not a source file.${colors.reset}`
    );
    console.error(
      `\n${colors.green}✅ No checks needed for ${path.basename(filePath)}${colors.reset}`
    );
    process.exit(0);
  }

  // Update header with file name
  console.error('');
  console.error(`🔍 Validating: ${path.basename(filePath)}`);
  console.error('────────────────────────────────────────────');
  log.info(`Checking: ${filePath}`);

  // Run quality checks
  const checker = new QualityChecker(filePath);
  const { errors, autofixes } = await checker.checkAll();

  // Print summary
  printSummary(errors, autofixes);

  // Separate edited file errors from other issues
  const editedFileErrors = errors.filter(
    e =>
      e.includes('edited file') ||
      e.includes('ESLint found issues') ||
      e.includes('Prettier formatting issues') ||
      e.includes('console statements') ||
      e.includes("'as any' usage") ||
      (e.includes('Found') && e.includes('any') && e.includes('type')) ||
      (e.includes('Found') &&
        e.includes('unknown as') &&
        e.includes('double assertion')) ||
      e.includes('were auto-fixed') ||
      e.includes('CommonJS syntax') ||
      e.includes('ESLint disable comment') ||
      e.includes('underscore-prefixed') ||
      e.includes('void operator')
  );

  const dependencyWarnings = errors.filter(e => !editedFileErrors.includes(e));

  // Exit with appropriate code
  if (editedFileErrors.length > 0) {
    // Critical - blocks immediately
    console.error(
      `\n${colors.red}🛑 FAILED - Fix issues in your edited file! 🛑${colors.reset}`
    );
    console.error(`${colors.cyan}💡 CLAUDE.md CHECK:${colors.reset}`);
    console.error(
      `${colors.cyan}  → What CLAUDE.md pattern would have prevented this?${colors.reset}`
    );
    console.error(
      `${colors.cyan}  → Are you following JSDoc batching strategy?${colors.reset}`
    );
    console.error(`${colors.yellow}📋 NEXT STEPS:${colors.reset}`);
    console.error(
      `${colors.yellow}  1. Fix the issues listed above${colors.reset}`
    );
    console.error(
      `${colors.yellow}  2. The hook will run again automatically${colors.reset}`
    );
    console.error(
      `${colors.yellow}  3. Continue with your original task once all checks pass${colors.reset}`
    );
    process.exit(2);
  } else if (dependencyWarnings.length > 0) {
    // Warning - shows but doesn't block
    console.error(
      `\n${colors.yellow}⚠️ WARNING - Dependency issues found${colors.reset}`
    );
    console.error(
      `${colors.yellow}These won't block your progress but should be addressed${colors.reset}`
    );
    console.error(
      `\n${colors.green}✅ Quality check passed for ${path.basename(filePath)}${colors.reset}`
    );

    if (autofixes.length > 0 && config.autofixSilent) {
      console.error(
        `\n${colors.yellow}👉 File quality verified. Auto-fixes applied. Continue with your task.${colors.reset}`
      );
    } else {
      console.error(
        `\n${colors.yellow}👉 File quality verified. Continue with your task.${colors.reset}`
      );
    }
    process.exit(0); // Don't block on dependency issues
  } else {
    console.error(
      `\n${colors.green}✅ Quality check passed for ${path.basename(filePath)}${colors.reset}`
    );

    if (autofixes.length > 0 && config.autofixSilent) {
      console.error(
        `\n${colors.yellow}👉 File quality verified. Auto-fixes applied. Continue with your task.${colors.reset}`
      );
    } else {
      console.error(
        `\n${colors.yellow}👉 File quality verified. Continue with your task.${colors.reset}`
      );
    }
    process.exit(0);
  }
}

// Handle errors
process.on('unhandledRejection', error => {
  log.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});

// Run main
main().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
