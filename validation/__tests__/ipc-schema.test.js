const { validateIPC } = require('../ipc-schema');

describe('IPC Parameter Validation', () => {
    test('validates audio-chunk correctly', () => {
        expect(validateIPC('audio-chunk', Buffer.from([1, 2, 3]))).toBe(true);
        expect(validateIPC('audio-chunk', new Uint8Array([1, 2, 3]))).toBe(true);
        expect(validateIPC('audio-chunk', { buffer: new ArrayBuffer(8) })).toBe(true);
    });

    test('validates translation:toggle correctly', () => {
        expect(validateIPC('translation:toggle', { isTranslating: true })).toBe(true);
        expect(validateIPC('translation:toggle', { isTranslating: false })).toBe(true);
        expect(validateIPC('translation:toggle', { isTranslating: 'yes' })).toBe(false);
        expect(validateIPC('translation:toggle', null)).toBe(false);
        expect(validateIPC('translation:toggle', {})).toBe(false);
    });

    test('validates language:change length constraints', () => {
        expect(validateIPC('language:change', 'en-US')).toBe(true);
        expect(validateIPC('language:change', 'vi')).toBe(true);
        expect(validateIPC('language:change', 'a')).toBe(false); // too short
        expect(validateIPC('language:change', 'this-is-a-very-long-language-code')).toBe(false); // too long
    });

    test('validates cyan:openExternal protocol', () => {
        expect(validateIPC('cyan:openExternal', 'https://google.com')).toBe(true);
        expect(validateIPC('cyan:openExternal', 'http://localhost:3000')).toBe(true);
        expect(validateIPC('cyan:openExternal', 'file:///etc/passwd')).toBe(false);
        expect(validateIPC('cyan:openExternal', 'javascript:alert(1)')).toBe(false);
    });

    test('returns true for unknown channels (default behavior)', () => {
        expect(validateIPC('unknown:channel', { some: 'data' })).toBe(true);
    });
});
