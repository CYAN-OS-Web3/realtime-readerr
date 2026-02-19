// renderer.js - Logic Giao diện và Xử lý Âm thanh Streaming (Hybrid)
// Đã fix lỗi Mic Level và Ánh xạ Ngôn ngữ. Đã tích hợp logic nhận Audio Buffer cho Azure TTS.

const { ipcRenderer } = require('electron');

// ----------------------------------------------------------------------
// 1. BẢN ĐỒ ÁNH XẠ MÃ NGÔN NGỮ NGẮN SANG STT CODE ĐẦY ĐỦ (36 NGÔN NGỮ)
// ----------------------------------------------------------------------
const STT_LANGUAGE_MAP = {
    'vi': 'vi-VN', 'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE', 
    'it': 'it-IT', 'pt': 'pt-PT', 'ru': 'ru-RU', 'ja': 'ja-JP', 'ko': 'ko-KR', 
    'zh': 'zh-CN', 'ar': 'ar-EG', 'hi': 'hi-IN', 'id': 'id-ID', 'th': 'th-TH', 
    'tr': 'tr-TR', 'pl': 'pl-PL', 'nl': 'nl-NL', 'sv': 'sv-SE', 'da': 'da-DK', 
    'fi': 'fi-FI', 'he': 'he-IL', 'hu': 'hu-HU', 'no': 'no-NO', 'sk': 'sk-SK', 
    'cs': 'cs-CZ', 'ro': 'ro-RO', 'el': 'el-GR', 'ms': 'ms-MY', 'uk': 'uk-UA',
    'bg': 'bg-BG', 'hr': 'hr-HR', 'lt': 'lt-LT', 'lv': 'lv-LV', 'sr': 'sr-RS', 'et': 'et-EE'
};

// --- BIẾN TOÀN CỤC CHO ÂM THANH ---
let audioContext = null;
let mediaStream = null;
let source = null;
let processor = null;
let gainNode = null;
let audioPlayer = new Audio(); // Trình phát audio cho TTS
let currentDraftTranscript = '';

// =========================================================
// 2. Hàm chuyển đổi Float32 sang Int16 (Định dạng Google STT yêu cầu)
// =========================================================

function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7FFF; // Chuyển Float32 [-1, 1] sang Int16 [-32767, 32767]
    }
    return Buffer.from(buf.buffer);
}

// =========================================================
// 3. Hàm Bắt đầu và Dừng Audio Capture
// =========================================================

async function startAudioCapture(sensitivity) {
    if (mediaStream) return; // Đã chạy

    try {
        // Yêu cầu quyền truy cập microphone
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        source = audioContext.createMediaStreamSource(mediaStream);
        
        // Tạo Gain Node để điều chỉnh độ nhạy
        gainNode = audioContext.createGain();
        const gainValue = 1 - (sensitivity / 100);
        gainNode.gain.setValueAtTime(gainValue, audioContext.currentTime);

        // Tạo ScriptProcessorNode (deprecated, nhưng dùng tạm)
        // Kích thước buffer 4096, 1 kênh đầu vào, 1 kênh đầu ra
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(gainNode);
        gainNode.connect(processor);
        processor.connect(audioContext.destination);

        // Lấy config để gửi đến main.js
        const languageCode = document.getElementById('language').value;
        const targetLanguage = document.getElementById('target-language').value;
        const ttsEngine = document.getElementById('tts-engine-select').value;
        
        const sttCode = STT_LANGUAGE_MAP[languageCode] || 'vi-VN'; // Mặc định là tiếng Việt
        
        // Gửi lệnh khởi tạo STT Stream qua IPC
        ipcRenderer.send('start-translation', { 
            sourceLang: sttCode, 
            targetLang: targetLanguage,
            ttsEngine: ttsEngine
        });
        
        appendLog(`Microphone connected and streaming started. STT Code: ${sttCode}`, 'info');

        // Logic gửi audio data và tính Mic Level
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const raw = convertFloat32ToInt16(inputData);
            
            // 1. TÍNH TOÁN RMS (Mức Âm Lượng)
            let sumOfSquares = 0;
            for (let i = 0; i < inputData.length; i++) {
                sumOfSquares += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sumOfSquares / inputData.length);
            
            // 2. CẬP NHẬT THANH MIC LEVEL
            const micLevelBar = document.getElementById('mic-level-bar');
            // Chuyển RMS (0.0 đến 1.0) thành phần trăm (0% đến 100%)
            // Nhân với 150 để tạo ra phản hồi trực quan tốt hơn
            const level = Math.min(100, Math.round(rms * 150)); 
            micLevelBar.style.width = `${level}%`;
            
            // 3. GỬI AUDIO DATA CHO MAIN PROCESS
            ipcRenderer.send('audio-chunk', raw); 
        };


        // Cập nhật giao diện
        document.getElementById('start-btn').style.display = 'none'; 
        document.getElementById('stop-btn').style.display = 'block'; 
        document.getElementById('connection-status').textContent = 'CONNECTING...';

    } catch (error) {
        appendLog(`Lỗi truy cập Mic: ${error.message}. Kiểm tra driver Mic và quyền truy cập.`, 'error');
        console.error("Mic Access Error:", error);
        stopAudioCapture(); 
    }
}

function stopAudioCapture() {
    ipcRenderer.send('stop-streaming');

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    if (source) {
        source.disconnect();
        source = null;
    }
    if (gainNode) {
        gainNode.disconnect();
        gainNode = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    // Đảm bảo nút quay lại trạng thái ban đầu
    document.getElementById('start-btn').style.display = 'block'; 
    document.getElementById('stop-btn').style.display = 'none'; 
    document.getElementById('connection-status').textContent = 'DISCONNECTED';
    document.getElementById('source-text').textContent = currentDraftTranscript; // Giữ lại bản nháp cuối
    document.getElementById('mic-level-bar').style.width = '0%'; // Reset Mic Level
    
    appendLog('Microphone streaming stopped.', 'error');
}


// =========================================================
// 4. Hàm Xử lý Log và Giao diện
// =========================================================

function appendLog(message, type = 'info') {
    const logOutput = document.getElementById('log-output');
    const now = new Date();
    const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    let colorClass = 'info-text';

    if (type === 'error') {
        colorClass = 'error-text';
    } else if (type === 'success') {
        colorClass = 'success-text';
    } else if (type === 'info') {
        colorClass = 'info-text';
    }

    const logEntry = `<div class="${colorClass}">[${timestamp}] <strong>${type.toUpperCase()}</strong> > ${message}</div>`;
    
    logOutput.innerHTML += logEntry;
    logOutput.scrollTop = logOutput.scrollHeight; // Tự động cuộn xuống dưới
}

function updateTargetLanguageDisplay() {
    const select = document.getElementById('target-language');
    const selectedOption = select.options[select.selectedIndex];
    const displayEl = document.getElementById('translated-text');
    displayEl.setAttribute('data-lang', selectedOption.textContent);

    const ttsEngineSelect = document.getElementById('tts-engine-select');
    document.getElementById('tts-service-display').textContent = ttsEngineSelect.options[ttsEngineSelect.selectedIndex].textContent;
}

// Hàm cuộn đến tùy chọn được chọn (Giúp UI gọn gàng)
function scrollToSelectedOption(selectElement) {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    if (!selectedOption) return; 
    
    setTimeout(() => {
         selectedOption.scrollIntoView({ 
             behavior: 'smooth', 
             block: 'nearest'    
         });
    }, 0); 
}


// =========================================================
// 5. Xử lý TTS Audio
// =========================================================

function playTtsAudio(audioBuffer) {
    const blob = new Blob([audioBuffer], { type: 'audio/mp3' }); 
    const url = URL.createObjectURL(blob);
    
    audioPlayer.src = url;
    audioPlayer.play().catch(e => {
        appendLog(`Lỗi phát TTS: ${e.message}. Đảm bảo đã click vào cửa sổ ứng dụng.`, 'error');
    });

    audioPlayer.onended = () => {
        URL.revokeObjectURL(url); // Giải phóng bộ nhớ
    };
}


// =========================================================
// 6. Listener cho IPC và DOM
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const sensitivityInput = document.getElementById('sensitivity');
    const overlayBtn = document.getElementById('toggle-overlay-btn');
    
    // --- KHỞI TẠO VÀ SỰ KIỆN NÚT ---
    
    startBtn.addEventListener('click', () => {
        const sensitivity = parseInt(sensitivityInput.value, 10);
        startAudioCapture(sensitivity);
    });

    stopBtn.addEventListener('click', stopAudioCapture);

    // Xử lý sự kiện thay đổi độ nhạy
    sensitivityInput.addEventListener('input', () => {
        const sensitivity = parseInt(sensitivityInput.value, 10);
        
        // SỬA LỖI TẠI ĐÂY: Chỉ điều chỉnh Gain khi audioContext đã được tạo
        if (gainNode && audioContext) { 
            const gainValue = 1 - (sensitivity / 100);
            
            // Dòng này đã được bảo vệ khỏi lỗi 'Cannot read properties of null'
            gainNode.gain.setValueAtTime(gainValue, audioContext.currentTime); 
            
            document.getElementById('sensitivity-value').textContent = sensitivity;
        } else {
             document.getElementById('sensitivity-value').textContent = sensitivity;
        }
    });
    
    // Xử lý sự kiện thay đổi TTS Engine
    document.getElementById('tts-engine-select').addEventListener('change', updateTargetLanguageDisplay);

    // --- IPC LISTENERS (Từ main.js) ---

    // Nhận bản nháp và bản chính thức từ Google STT
    ipcRenderer.on('stt-transcript', (event, data) => {
        if (!data.isFinal) {
            document.getElementById('source-text').textContent = data.transcript + '...';
            currentDraftTranscript = data.transcript + '...';
        } else {
            // Hiển thị bản nháp cuối (nếu không có bản dịch nào xuất hiện)
            document.getElementById('source-text').textContent = data.transcript; 
        }
    });

    // Nhận kết quả dịch thuật cuối cùng
    ipcRenderer.on('translation-result', (event, translatedText) => {
        document.getElementById('translated-text').textContent = translatedText;
        currentDraftTranscript = ''; // Reset
    });
    
    // Nhận audio buffer từ Main Process (TTS ElevenLabs/Azure)
    ipcRenderer.on('tts-audio-ready', (event, audioBuffer) => {
        playTtsAudio(audioBuffer);
    });
    
    // Nhận Log Message
    ipcRenderer.on('log-message', (event, message, type) => {
        appendLog(message, type);
    });

    // Cập nhật trạng thái kết nối
    ipcRenderer.on('update-connection-status', (event, status) => {
        const statusEl = document.getElementById('connection-status');
        statusEl.textContent = status;
        statusEl.className = status === 'CONNECTED' ? 'success-text' : 'error-text';
    });

    // Cập nhật Chunk Count
    ipcRenderer.on('update-chunk-count', (event, count) => {
        document.getElementById('chunk-count').textContent = count;
    });


    // --- KHỞI TẠO UI BAN ĐẦU ---
    
    const languageSelect = document.getElementById('language');
    const targetLanguageSelect = document.getElementById('target-language');
    const ttsEngineSelect = document.getElementById('tts-engine-select');

    // 1. Thực hiện cuộn khi ứng dụng khởi động (để hiển thị giá trị mặc định)
    scrollToSelectedOption(languageSelect);
    scrollToSelectedOption(targetLanguageSelect);
    scrollToSelectedOption(ttsEngineSelect);

    // 2. Thêm sự kiện cuộn lại khi người dùng thay đổi lựa chọn
    languageSelect.addEventListener('change', () => scrollToSelectedOption(languageSelect));
    targetLanguageSelect.addEventListener('change', () => scrollToSelectedOption(targetLanguageSelect));
    ttsEngineSelect.addEventListener('change', () => scrollToSelectedOption(ttsEngineSelect));
    
    updateTargetLanguageDisplay();
    appendLog('Control Hub Ready. Check API Keys in main.js', 'info');
});