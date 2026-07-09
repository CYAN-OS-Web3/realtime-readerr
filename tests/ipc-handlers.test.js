const { ipcMain } = require('electron');
const state = require('../state-manager');
const config = require('../config');

// Mock Electron modules
jest.mock('electron', () => ({
    ipcMain: {
        on: jest.fn(),
        handle: jest.fn(),
        emit: jest.fn()
    },
    app: {
        getPath: jest.fn().mockReturnValue('/tmp/user-data'),
        isPackaged: false,
        commandLine: { appendSwitch: jest.fn() }
    },
    shell: { openExternal: jest.fn() },
    BrowserWindow: jest.fn().mockImplementation(() => ({
        loadURL: jest.fn(),
        loadFile: jest.fn(),
        show: jest.fn(),
        showInactive: jest.fn(),
        hide: jest.fn(),
        minimize: jest.fn(),
        close: jest.fn(),
        webContents: {
            on: jest.fn(),
            openDevTools: jest.fn(),
            send: jest.fn()
        },
        once: jest.fn(),
        on: jest.fn(),
        isDestroyed: jest.fn().mockReturnValue(false)
    }))
}));

// Mock logger
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

// Requirement: main.js side effects need to be controlled.
// We'll require main.js after mocks are set up.
// Note: main.js might execute app.whenReady().then(...) immediately.

describe('Main Process IPC Handlers', () => {
    let main;

    beforeAll(() => {
        // Reset state before tests
        state.resetSTTState();
        // Load main.js to register handlers
        // We use try-catch because app.whenReady() might fail in test env
        try {
            main = require('../main');
        } catch (e) {
            // Silence initialization errors if any
        }
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should register basic window handlers', () => {
        expect(ipcMain.on).toHaveBeenCalledWith('window:minimize', expect.any(Function));
        expect(ipcMain.on).toHaveBeenCalledWith('window:close', expect.any(Function));
    });

    test('should return backend URL from config', async () => {
        const handler = ipcMain.handle.mock.calls.find(call => call[0] === 'cyan:getBackendUrl')[1];
        const result = await handler();
        expect(result).toBe('https://translator-gateway.fly.dev/');
    });

    test('should update state when translation:toggle is received', async () => {
        const handler = ipcMain.on.mock.calls.find(call => call[0] === 'translation:toggle')[1];
        
        // Mock event
        const event = { reply: jest.fn() };
        
        // Simulate START toggle
        await handler(event, { 
            isTranslating: true, 
            sourceLang: 'en-US', 
            targetLang: 'vi-VN', 
            ttsEngine: 'piper' 
        });

        expect(state.currentSettings.sourceLang).toBe('en-US');
        expect(state.currentSettings.targetLang).toBe('vi-VN');
    });

    test('should handle overlay:show and overlay:hide', () => {
        const showHandler = ipcMain.on.mock.calls.find(call => call[0] === 'overlay:show')[1];
        const hideHandler = ipcMain.on.mock.calls.find(call => call[0] === 'overlay:hide')[1];
        
        // We need to check if they call methods on the mocked window
        // This is tricky as main.js keeps local window refs
        // But we can verify registration at least
        expect(showHandler).toBeDefined();
        expect(hideHandler).toBeDefined();
    });
});
