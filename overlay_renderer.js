// overlay_renderer.js - Logic cho cửa sổ Overlay (phụ)

const { ipcRenderer } = require('electron');

// Kênh IPC này phải khớp với kênh bạn đã sửa trong main.js
const CHANNEL_NAME = 'translation-result'; 

// Listener nhận bản dịch cuối cùng từ Main Process
ipcRenderer.on(CHANNEL_NAME, (event, translatedText) => {
    const outputElement = document.getElementById('translation-output');
    
    // 1. Cập nhật nội dung dịch thuật
    outputElement.textContent = translatedText;
    
    // 2. Tự động xóa văn bản sau 10 giây để tránh làm bẩn màn hình
    setTimeout(() => {
        outputElement.textContent = '';
        // CSS trong overlay.html đã ẩn element khi nó rỗng (empty), 
        // nên không cần phải thay đổi visibility
    }, 10000); // 10 giây
});

// Listener tùy chọn để nhận log từ Main Process
ipcRenderer.on('log-message', (event, message, type) => {
    // Không làm gì cả, vì overlay không cần hiển thị log
    console.log(`[Overlay Log] ${type}: ${message}`);
});