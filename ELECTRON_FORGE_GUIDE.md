# Electron Forge Setup Guide

## 🚀 Chuyển đổi sang Electron Forge

Dự án đã được chuyển đổi từ electron-builder sang **Electron Forge** để quản lý dev/build tốt hơn, tránh xung đột stream và cấu hình toàn cục.

## 📋 Cấu trúc mới

```
realtime-speech-translation/
├── main.js                 # Main process (Electron)
├── preload.js              # Preload script
├── forge.config.js         # Electron Forge config
├── renderer/               # React app (Vite)
│   ├── src/
│   ├── vite.config.js
│   ├── package.json
│   └── dist/               # Build output
├── backend-vercel/         # Backend API
└── package.json            # Root package.json
```

## 🔧 Các lệnh chính

### Dev Mode
```bash
# Chạy Electron Forge dev (auto-reload)
npm run dev

# Hoặc chạy riêng
npm run start
```

### Build Renderer
```bash
# Build React app (Vite)
npm run build:renderer
```

### Package & Build Installer
```bash
# Build cho tất cả platforms
npm run package

# Build chỉ cho Windows
npm run package:win
```

### Doctor Scripts (Debug)
```bash
# Check env + auto-retry dev
npm run doctor:remote:auto

# Quick check (skip smoke test)
npm run doctor:remote:auto:quick
```

## 🎯 VS Code Debug Configurations

Mở **Run and Debug** (Ctrl+Shift+D) và chọn:

1. **Electron Forge Dev** - Chạy dev mode với auto-reload
2. **Electron Forge Start** - Chạy app một lần
3. **Build Renderer Only** - Build React app
4. **Build Electron App (Forge)** - Package app
5. **Build Windows Installer** - Tạo installer .exe

## 📁 Forge Config (forge.config.js)

### Makers (Installers)
- **Squirrel** (Windows) - NSIS installer
- **Zip** (macOS)
- **Deb** (Linux)
- **RPM** (Linux)

### Plugins
- **auto-unpack-natives** - Tự động unpack native modules
- **fuses** - Security hardening

### Hooks
- **generateAssets** - Tự động build renderer trước khi package

## 🔐 Signing (Optional)

Để sign Windows installer, set environment variables:
```bash
set WINDOWS_CERTIFICATE_FILE=path/to/cert.pfx
set WINDOWS_CERTIFICATE_PASSWORD=password
npm run package:win
```

## 🐛 Troubleshooting

### Dev mode không start
```bash
# Kill process cũ
taskkill /F /IM electron.exe

# Chạy lại
npm run dev
```

### Renderer không load
- Check port 5173 có bị dùng không
- Xem console (F12) có lỗi gì
- Rebuild renderer: `npm run build:renderer`

### Build lỗi
```bash
# Clean cache
rm -r node_modules/.cache
npm install

# Rebuild
npm run package
```

## 📦 Output

Build output sẽ ở:
```
out/
├── Cyan ULTRA-LOW LATENCY AI TRANSLATOR Setup 1.0.0.exe  # Installer
├── Cyan ULTRA-LOW LATENCY AI TRANSLATOR-1.0.0.exe        # Portable
└── ...
```

## ✅ Lợi ích của Electron Forge

- ✅ Tự động quản lý dev/build lifecycle
- ✅ Tránh xung đột stream từ cấu hình toàn cục
- ✅ Hỗ trợ multi-platform (Windows, Mac, Linux)
- ✅ Auto-reload khi code thay đổi
- ✅ Tích hợp sẵn security hardening
- ✅ Dễ dàng signing & notarization

## 🎓 Tài liệu

- [Electron Forge Docs](https://www.electronforge.io/)
- [Vite Config](https://vitejs.dev/config/)
- [Electron Security](https://www.electronjs.org/docs/tutorial/security)
