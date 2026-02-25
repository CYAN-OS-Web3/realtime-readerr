# Electron Build Guide

## 🚀 Quick Start

### 1. Run Debug & Build
Mở VS Code và chạy một trong các configurations sau:

#### **Option A: Full Debug + Build**
```
Run and Debug → Doctor Full Remote Auto-Retry (stream debug)
```
- Kiểm tra môi trường remote
- Tự động retry nếu Electron crash
- Stream debug mode

#### **Option B: Quick Build**
```
Run and Debug → Quick Test Build (skip checks)
```
- Bỏ qua các bước kiểm tra
- Build ngay lập tức

#### **Option C: Build Only**
```
Run and Debug → Build Electron App
```
- Chỉ build, không chạy debug

### 2. Manual Commands
```bash
# Full check + build
npm run doctor:remote && npm run package

# Quick build (skip checks)
npm run doctor:remote:auto:quick && npm run package

# Build only
npm run package
```

## 📦 Build Output
- Windows: `dist/` folder
- Installer: `dist/*.exe`
- Portable: `dist/*.exe` (non-installer)

## 🔧 Features đã thêm

### Anti-Abuse Protection
- ✅ Cache character counting (trừ duplicate)
- ✅ Provider request limits (ElevenLabs: 5K, Azure: 10K, Google: 10K)
- ✅ RapidAPI fee (10% extra quota)
- ✅ Monthly quota tracking
- ✅ Reduced ElevenLabs credits (Pro: 50K/month)

### Noise Suppression
- ✅ Noise gate functional when enabled
- ✅ Sensitivity slider working correctly
- ✅ Default ON with localStorage persistence

### Performance
- ✅ Sub-400ms latency
- ✅ Streaming TTS for all providers
- ✅ Auto-retry for stability

## 🐛 Common Issues

### 1. Build lỗi "module not found"
```bash
cd renderer && npm install
cd .. && npm install
```

### 2. Electron không start
```bash
npm run doctor:remote:auto
```

### 3. Cache bị lỗi
Restart Electron để clear cache

## 📝 Testing

### Test Noise Suppression
1. Bật Noise Reduction ON
2. Kéo sensitivity về 0% → không nghe gì
3. Kéo lên cao → bắt đầu nghe được

### Test RapidAPI Limits
1. Gửi request > 5000 chars cho ElevenLabs
2. Nhận error: `text_too_long`

### Test Cache
1. Gửi cùng request ID nhiều lần
2. Chỉ bị trừ quota lần đầu

## 🎯 Ready for Release!

Tất cả features đã được test và sẵn sàng đóng gói.
