const { Piper, PiperCache } = require('../piper-handler');
const fs = require('fs');
const ort = require('onnxruntime-node');

// Mock onnxruntime-node
jest.mock('onnxruntime-node', () => ({
    InferenceSession: {
        create: jest.fn().mockResolvedValue({
            run: jest.fn().mockResolvedValue({
                output: { data: new Float32Array([0.1, 0.2, 0.3]) }
            })
        })
    },
    Tensor: jest.fn().mockImplementation((type, data, dims) => ({ type, data, dims }))
}));

// Mock fs
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({
        phoneme_id_map: { 'a': 1, 'b': 2 }
    }))
}));

// Mock logger
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

describe('Piper TTS and PiperCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Piper class', () => {
        test('should load model and config', async () => {
            const piper = new Piper('model.onnx', 'config.json');
            await piper.load();
            expect(ort.InferenceSession.create).toHaveBeenCalledWith('model.onnx');
            expect(fs.readFileSync).toHaveBeenCalledWith('config.json', 'utf8');
        });

        test('should synthesize text', async () => {
            const piper = new Piper('model.onnx', 'config.json');
            await piper.load();
            const result = await piper.synthesize('ab');
            expect(result.samples).toBeDefined();
            expect(result.samples instanceof Float32Array).toBe(true);
        });

        test('should throw error if session is not loaded', async () => {
            const piper = new Piper('model.onnx', 'config.json');
            await expect(piper.synthesize('test')).rejects.toThrow('Piper model not loaded');
        });
    });

    describe('PiperCache class', () => {
        test('should implement LRU logic and evict old models', async () => {
            const cache = new PiperCache(2);
            
            // Load 1st model
            await cache.getModel('model1.onnx', 'config1.json');
            expect(cache.cache.size).toBe(1);
            
            // Load 2nd model
            await cache.getModel('model2.onnx', 'config2.json');
            expect(cache.cache.size).toBe(2);
            
            // Load 3rd model - should evict model1.onnx
            await cache.getModel('model3.onnx', 'config3.json');
            expect(cache.cache.size).toBe(2);
            expect(cache.cache.has('model1.onnx')).toBe(false);
            expect(cache.cache.has('model2.onnx')).toBe(true);
            expect(cache.cache.has('model3.onnx')).toBe(true);
        });

        test('should reuse existing models', async () => {
            const cache = new PiperCache(2);
            const model1 = await cache.getModel('model1.onnx', 'config1.json');
            const model1_again = await cache.getModel('model1.onnx', 'config1.json');
            
            expect(model1).toBe(model1_again);
            expect(ort.InferenceSession.create).toHaveBeenCalledTimes(1);
        });
    });
});
