# MCP Servers in Electron Apps: A Comprehensive Solution

## The Problem

When building Electron desktop applications that use Model Context Protocol (MCP) servers, a common issue arises: **`npx` is not available in the bundled Electron environment**. This means that while `npx @modelcontextprotocol/server-filesystem` works perfectly during development, it fails when the app is packaged and distributed to users.

The error typically looks like:

```
Failed to connect: spawn npx ENOENT
```

## Our Multi-Layered Solution

MindStrike implements a sophisticated solution that provides multiple fallback mechanisms to ensure MCP servers work reliably in both development and production environments.

### 1. Command Resolution System

We created a `CommandResolver` utility class that handles command detection and fallbacks:

**Location**: `server/utils/command-resolver.ts`

#### Key Features:

- **Automatic Command Detection**: Checks if commands are available in system PATH
- **Platform-Specific Fallbacks**: Searches common installation paths for Node.js/npm on Windows, macOS, and Linux
- **Bundled Server Support**: Automatically detects and uses bundled MCP servers when external commands aren't available
- **Intelligent Caching**: Caches command resolutions to avoid repeated filesystem checks
- **Detailed Diagnostics**: Provides comprehensive information about what's available and what's missing

#### Fallback Search Paths:

**macOS**:

```
/usr/local/bin/node (Homebrew)
/opt/homebrew/bin/node (Apple Silicon Homebrew)
~/.nvm/current/bin/node (NVM)
~/.volta/bin/node (Volta)
```

**Windows**:

```
C:\Program Files\nodejs\node.exe
C:\Program Files (x86)\nodejs\node.exe
%APPDATA%\npm\node.exe
%LOCALAPPDATA%\npm\node.exe
```

**Linux**:

```
/usr/local/bin/node
/usr/bin/node
~/.nvm/current/bin/node
~/.local/bin/node
```

### 2. Bundled MCP Servers

Popular MCP servers are bundled as direct dependencies in the application:

**Currently Bundled**:

- `@modelcontextprotocol/server-filesystem` - File system operations
- `@modelcontextprotocol/server-github` - GitHub API integration

When `npx` is not available, the system automatically falls back to running these servers directly with Node.js:

```javascript
// Instead of: npx @modelcontextprotocol/server-filesystem /path
// Uses: node /path/to/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js /path
```

### 3. Enhanced MCP Manager

The `MCPManager` class has been enhanced to:

- **Pre-validate Commands**: Check command availability before attempting connections
- **Provide User Guidance**: Generate helpful installation instructions when dependencies are missing
- **Real-time Notifications**: Send SSE events to the frontend when commands are missing
- **Detailed Logging**: Track which fallback methods are being used

### 4. User Guidance System

When dependencies are missing, the system provides:

#### Installation Instructions

```javascript
{
  title: 'Node.js Required',
  message: 'MCP servers require Node.js and npm to be installed...',
  actions: [
    { label: 'Download Node.js', url: 'https://nodejs.org/en/download/' },
    { label: 'Install via Homebrew (macOS)', command: 'brew install node' },
    { label: 'Install via package manager (Linux)', command: 'sudo apt install nodejs npm' }
  ]
}
```

#### Real-time Notifications

The frontend receives SSE events when commands are missing and can display appropriate guidance to users.

### 5. Diagnostic API Endpoints

New API endpoints provide detailed information about MCP server availability:

- **`GET /api/mcp/diagnostics`** - Complete system diagnostic information
- **`POST /api/mcp/refresh-cache`** - Force refresh of command cache

## Implementation Details

### Command Resolution Flow

1. **Check System PATH**: Try the command as-is (works in development)
2. **Check Bundled Servers**: If it's an `npx` MCP server call, look for bundled version
3. **Platform-Specific Fallbacks**: Search common installation paths
4. **Generate User Guidance**: If nothing works, provide installation instructions

### Example Resolution Process

```
User config: npx @modelcontextprotocol/server-filesystem /workspace

1. Try: npx --version (fails in bundled Electron)
2. Check: Is @modelcontextprotocol/server-filesystem bundled? (yes)
3. Find: Node.js executable (/usr/local/bin/node)
4. Result: node /app/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js /workspace
```

### Error Handling and Recovery

- **Graceful Degradation**: Individual server failures don't crash the entire system
- **User-Friendly Messages**: Clear explanations of what went wrong and how to fix it
- **Automatic Retries**: Command cache can be refreshed without restarting the app
- **Development vs Production**: Different strategies for different environments

## Benefits of This Approach

### 1. **Seamless User Experience**

- Works out of the box when Node.js is installed
- Falls back to bundled servers when external tools aren't available
- Clear guidance when dependencies are missing

### 2. **Developer-Friendly**

- No changes needed to existing MCP configurations
- Works identically in development and production
- Comprehensive debugging information available

### 3. **Robust and Reliable**

- Multiple fallback layers ensure maximum compatibility
- Platform-specific optimizations for Windows, macOS, and Linux
- Caching prevents performance issues

### 4. **Future-Proof**

- Easy to add new bundled MCP servers
- Extensible command resolution system
- Clear upgrade path as MCP ecosystem evolves

## Configuration Examples

### Basic Filesystem Server

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "[[WORKSPACE_ROOT]]"],
      "description": "File system operations - read, write, and list files"
    }
  }
}
```

### GitHub Integration

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token-here"
      },
      "description": "GitHub API integration for repository operations"
    }
  }
}
```

### Custom External Server

```json
{
  "mcpServers": {
    "custom": {
      "command": "python",
      "args": ["/path/to/custom-mcp-server.py"],
      "description": "Custom Python-based MCP server"
    }
  }
}
```

## Comparison with Other Solutions

### AnythingLLM Approach

- **Strategy**: Requires users to manually install all dependencies
- **Pros**: Simple implementation, delegates responsibility to users
- **Cons**: Poor user experience, requires technical knowledge

### Our MindStrike Approach

- **Strategy**: Multi-layered fallbacks with bundled servers
- **Pros**: Works out of the box, graceful degradation, clear guidance
- **Cons**: Larger bundle size, more complex implementation

### Claude Desktop Approach

- **Strategy**: Unknown (proprietary), but likely similar to ours
- **Pros**: Seamless user experience
- **Cons**: No visibility into implementation

## Future Enhancements

### 1. **Automatic Server Installation**

- Download and install popular MCP servers on demand
- Package manager integration (npm, pip, etc.)
- Sandboxed execution environments

### 2. **Enhanced Bundling**

- Dynamic server discovery and bundling
- Selective bundling based on user preferences
- Compressed server distributions

### 3. **Cloud Fallbacks**

- Remote MCP server execution
- Hybrid local/cloud configurations
- Load balancing and failover

### 4. **Advanced Diagnostics**

- Performance monitoring for MCP servers
- Health checks and automatic recovery
- Usage analytics and optimization suggestions

## Debugging and Troubleshooting

### Checking Command Resolution

```bash
# View cached command resolutions
curl http://localhost:3001/api/mcp/diagnostics

# Refresh command cache
curl -X POST http://localhost:3001/api/mcp/refresh-cache
```

### Common Issues and Solutions

**Issue**: "spawn npx ENOENT"

- **Solution**: Bundled server will be used automatically
- **Check**: Verify Node.js is installed if you need external servers

**Issue**: "Command 'python' not available"

- **Solution**: Install Python and ensure it's in PATH
- **Alternative**: Use Node.js-based servers instead

**Issue**: "Permission denied accessing bundled server"

- **Solution**: Check file permissions in node_modules
- **Workaround**: Reinstall npm packages

### Diagnostic Information

The `/api/mcp/diagnostics` endpoint provides:

- List of bundled servers and their availability
- Cached command resolutions
- System information (platform, Node.js version, npm version)
- Installation recommendations

## Security Considerations

### Bundled Servers

- All bundled servers are verified before inclusion
- Regular updates to address security vulnerabilities
- Sandboxed execution prevents system access beyond intended scope

### External Commands

- Command resolution respects system PATH and permissions
- No automatic installation of external dependencies
- User confirmation required for sensitive operations

### Environment Variables

- Secure handling of API keys and tokens
- Environment variable validation and sanitization
- No logging of sensitive information

## Conclusion

This comprehensive solution ensures that MCP servers work reliably in Electron applications while providing an excellent user experience. By combining multiple fallback strategies, bundled dependencies, and clear user guidance, we've created a robust system that works across different platforms and configurations.

The implementation serves as a reference for other Electron applications that need to integrate MCP servers, demonstrating that it's possible to provide a seamless experience without sacrificing functionality or reliability.
