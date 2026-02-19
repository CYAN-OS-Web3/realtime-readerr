// renderer/src/index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Tạo root mới cho React 18
const container = document.getElementById('root');
const root = createRoot(container);

// Render ứng dụng
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Kết nối với main process
if (window.electronAPI) {
  window.electronAPI.handleCounter((event, value) => {
    // Xử lý sự kiện từ main process nếu cần
    console.log('Received from main process:', value);
  });
}
