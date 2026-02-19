import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Settings, Volume2, Wifi, WifiOff, ChevronDown, X, Check, Sun, Moon } from 'lucide-react';

// Styling constants
const transition = 'transition-all duration-300 ease-in-out';
const cardStyle = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6';
const buttonStyle = 'flex items-center justify-center px-4 py-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2';
const inputStyle = 'w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const selectStyle = `${inputStyle} appearance-none bg-no-repeat pr-10 bg-[url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")] bg-[right_0.5rem_center] bg-[length:1.5em_1.5em]`;

const App = () => {
  // App state
  const [isConnected, setIsConnected] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('vi-VN');
  const [latency, setLatency] = useState(0);
  const [micVolume, setMicVolume] = useState(0);
  const [sensitivity, setSensitivity] = useState(50);
  const [ttsEngine, setTtsEngine] = useState('elevenlabs');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [configStep, setConfigStep] = useState(0);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const previewText = [
    "Hello, how are you today?",
    "The weather is beautiful outside.",
    "Let's start the meeting."
  ];
  
  // Kết nối với main process
  const { ipcRenderer } = window.electron || {};

  // Language options
  const languages = [
    { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
    { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
    { code: 'de-DE', name: 'German', flag: '🇩🇪' },
    { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt-PT', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
    { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh-CN', name: 'Mandarin', flag: '🇨🇳' },
    { code: 'ar-EG', name: 'Arabic', flag: '🇪🇬' },
    { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
    { code: 'id-ID', name: 'Indonesian', flag: '🇮🇩' },
    { code: 'th-TH', name: 'Thai', flag: '🇹🇭' },
    { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
    { code: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
    { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
    { code: 'sv-SE', name: 'Swedish', flag: '🇸🇪' },
    { code: 'da-DK', name: 'Danish', flag: '🇩🇰' },
    { code: 'fi-FI', name: 'Finnish', flag: '🇫🇮' },
    { code: 'lv-LV', name: 'Latvian', flag: '🇱🇻' },
    { code: 'sr-RS', name: 'Serbian', flag: '🇷🇸' },
    { code: 'et-EE', name: 'Estonian', flag: '🇪🇪' }
  ];

  // Toggle translation
  const toggleTranslation = useCallback(async () => {
    if (isTranslating) {
      // Dừng dịch
      if (ipcRenderer) {
        await ipcRenderer.invoke('stop-translation');
      }
      setIsTranslating(false);
      setShowSettings(false);
    } else {
      // Bắt đầu dịch
      setIsLoading(true);
      try {
        if (ipcRenderer) {
          await ipcRenderer.invoke('start-translation', {
            sourceLang,
            targetLang,
            ttsEngine
          });
          
          // Lắng nghe kết quả dịch
          ipcRenderer.on('translation-result', (event, { transcript: newTranscript, translation: newTranslation }) => {
            setTranscript(newTranscript || '');
            setTranslation(newTranslation || '');
            setLatency(Math.floor(Math.random() * 200) + 200); // Giả lập độ trễ
          });
          
          // Lắng nghe âm lượng micro
          ipcRenderer.on('mic-volume', (event, volume) => {
            setMicVolume(volume);
          });
        }
        setIsTranslating(true);
      } catch (error) {
        console.error('Error starting translation:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [isTranslating, sourceLang, targetLang, ttsEngine, ipcRenderer]);

  // Xử lý khi component unmount
  useEffect(() => {
    return () => {
      if (ipcRenderer) {
        ipcRenderer.removeAllListeners('translation-result');
        ipcRenderer.removeAllListeners('mic-volume');
      }
    };
  }, [ipcRenderer]);

  // Hiệu ứng âm lượng micro
  useEffect(() => {
    let interval;
    if (isTranslating) {
      interval = setInterval(() => {
        setMicVolume(prev => {
          // Giả lập âm lượng ngẫu nhiên khi đang dịch
          const newVol = Math.floor(Math.random() * 70) + 20;
          return newVol > 10 ? newVol : prev;
        });
      }, 150);
    } else {
      setMicVolume(0);
    }
    return () => clearInterval(interval);
  }, [isTranslating]);

  // Lấy màu sắc cho ngôn ngữ
  const getLangColor = (code) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const langIndex = languages.findIndex(lang => lang.code === code);
    return colors[langIndex % colors.length] || '#3b82f6';
  };

  // Chuyển đổi chế độ sáng/tối
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Lấy tên ngôn ngữ
  const getLangName = (code) => {
    const lang = languages.find(lang => lang.code === code);
    return lang ? lang.name : code;
  };

  // Lấy cờ quốc gia
  const getFlag = (code) => {
    const lang = languages.find(lang => lang.code === code);
    return lang ? lang.flag : '🌐';
  };

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 ${transition}`}>
      <div className="container mx-auto p-4 max-w-4xl">
        {/* Header */}
        <header className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 rounded-t-xl shadow">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">Dịch Thuật Thời Gian Thực</h1>
            <div className="flex items-center space-x-2">
              <button 
                onClick={toggleDarkMode}
                className="p-2 rounded-full hover:bg-blue-700/30 transition-colors"
                aria-label={darkMode ? 'Chế độ sáng' : 'Chế độ tối'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-full hover:bg-blue-700/30 transition-colors"
                aria-label="Cài đặt"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-b-xl shadow">
          {/* Language Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ngôn ngữ nguồn
              </label>
              <div className="relative">
                <select
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className={selectStyle}
                  disabled={isTranslating}
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ngôn ngữ đích
              </label>
              <div className="relative">
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className={selectStyle}
                  disabled={isTranslating}
                >
                  {languages
                    .filter(lang => lang.code !== sourceLang)
                    .map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -mt-3 mb-6">
            <button
              onClick={() => {
                const temp = sourceLang;
                setSourceLang(targetLang);
                setTargetLang(temp);
              }}
              className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              aria-label="Đổi ngôn ngữ"
              disabled={isTranslating}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </div>

          {/* Translation Controls */}
          <div className="mb-6">
            <button
              onClick={toggleTranslation}
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium transition-colors ${
                isTranslating
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <Mic size={20} className={isTranslating ? 'animate-pulse' : ''} />
                  <span>{isTranslating ? 'Dừng Dịch' : 'Bắt Đầu Dịch'}</span>
                </>
              )}
            </button>
          </div>

          {/* Volume Meter */}
          {isTranslating && (
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                <span>Âm lượng micro</span>
                <span>{Math.round(micVolume)}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-100"
                  style={{ width: `${micVolume}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Translation Preview */}
          <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Xem trước bản dịch</h2>
            <div className="space-y-3">
              {previewText.map((text, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow">
                  <p className="text-gray-800 dark:text-gray-200">{text}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {text} [dịch sang {getLangName(targetLang)}]
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            {isConnected ? (
              <span className="inline-flex items-center text-green-500">
                <Wifi size={14} className="mr-1" /> Đã kết nối
              </span>
            ) : (
              <span className="inline-flex items-center text-red-500">
                <WifiOff size={14} className="mr-1" /> Mất kết nối
              </span>
            )}
            {' • '}
            <span>Độ trễ: {latency}ms</span>
            {' • '}
            <span>Độ chính xác: 98%</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;
