# Cyan OS MCP Server Integration

## 📋 Overview

Dự án đã được tích hợp MCP (Model Context Protocol) để cung cấp các tools cho AI assistant tương tác với hệ thống Cyan OS.

## 🚀 Cài đặt

### 1. Dependencies đã được cài đặt
```bash
npm install @modelcontextprotocol/server-filesystem
npm install @modelcontextprotocol/server-memory
npm install @modelcontextprotocol/sdk
npm install form-data
```

### 2. MCP Servers có sẵn

#### a. Filesystem Server
- Truy cập files trong dự án
- Đọc/ghi files
- Quản lý directory structure

#### b. Memory Server
- Lưu trữ context và memories
- Quản lý conversation history

#### c. Cyan SDK Server (Tùy chỉnh)
- Tương tác với Cyan OS API
- Generate speech (TTS)
- Voice cloning
- Check user quota
- Get user plan

## 🛠️ Sử dụng

### Start MCP Servers
```bash
# Start tất cả MCP servers
npm run mcp:start

# Start chỉ Cyan SDK server
npm run mcp:cyan
```

### Configuration
File config: `mcp-config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["./node_modules/@modelcontextprotocol/server-filesystem/dist/index.js"],
      "env": {
        "FILESYSTEM_ROOT": "./"
      }
    },
    "memory": {
      "command": "node",
      "args": ["./node_modules/@modelcontextprotocol/server-memory/dist/index.js"]
    },
    "cyan-sdk": {
      "command": "node",
      "args": ["./mcp-server.js"]
    }
  }
}
```

## 📚 Available Tools

### Cyan SDK Tools

#### 1. `cyan_speak`
Generate speech using Cyan SDK
```javascript
{
  "text": "Hello world",
  "userId": "user123",
  "language": "en-US",
  "gender": "female",
  "apiKey": "your-api-key",
  "baseUrl": "https://translator-gateway.fly.dev/"
}
```

#### 2. `cyan_clone_and_speak`
Clone voice and generate speech
```javascript
{
  "text": "Hello world",
  "userId": "user123",
  "audioFile": "./sample.mp3",
  "quality": "high",
  "apiKey": "your-api-key"
}
```

#### 3. `cyan_check_quota`
Check user quota and usage
```javascript
{
  "userId": "user123",
  "apiKey": "your-api-key"
}
```

#### 4. `cyan_get_user_plan`
Get user subscription plan
```javascript
{
  "userId": "user123",
  "apiKey": "your-api-key"
}
```

### Filesystem Tools
- `read_file`: Đọc file
- `write_to_file`: Ghi file
- `list_directory`: Liệt kê directory
- `search_files`: Tìm kiếm files

### Memory Tools
- `create_memory`: Tạo memory mới
- `search_memories`: Tìm kiếm memories
- `update_memory`: Cập nhật memory

## 🔧 Troubleshooting

### Common Issues

1. **Server không start được**
   - Kiểm tra Node.js version (>= 16)
   - Kiểm tra dependencies đã được cài đặt chưa

2. **Permission errors**
   - Chạy với quyền admin nếu cần
   - Kiểm tra file permissions

3. **API errors**
   - Kiểm tra API key
   - Kiểm tra network connection

### Debug Mode
```bash
DEBUG=mcp:* npm run mcp:start
```

## 📝 Development

### Thêm tool mới
1. Mở file `mcp-server.js`
2. Thêm tool vào `setupToolHandlers()`
3. Implement handler function

### Custom MCP server
Tạo file mới và thêm vào `mcp-config.json`

## 🤝 Integration với IDE

### Windsurf/Cursor
1. Cài đặt MCP extension
2. Configure path đến `mcp-config.json`
3. Restart IDE

### VS Code
1. Cài đặt MCP extension
2. Add to settings.json:
```json
{
  "mcp.servers": {
    "cyan-sdk": {
      "command": "node",
      "args": ["./mcp-server.js"],
      "cwd": "./path/to/project"
    }
  }
}
```

## 📞 Support

Nếu gặp vấn đề:
1. Check logs trong console
2. Verify API credentials
3. Check network connectivity
4. Create issue trong repository
