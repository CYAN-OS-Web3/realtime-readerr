const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

class Piper {
    constructor(modelPath, configPath) {
        this.session = null;
        this.modelPath = modelPath;
        this.configPath = configPath;
        this.config = null;
    }

    async load() {
        try {
            this.session = await ort.InferenceSession.create(this.modelPath);
            this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            logger.info('Piper', `Model loaded: ${path.basename(this.modelPath)}`);
        } catch (e) {
            logger.error('Piper', `Failed to load model: ${this.modelPath}`, e);
            throw e;
        }
    }

    async dispose() {
        this.session = null;
        this.config = null;
        logger.info('Piper', `Model disposed: ${path.basename(this.modelPath)}`);
    }

    async synthesize(text, options = {}) {
        if (!this.session || !this.config) {
            throw new Error('Piper model not loaded. Call load() first.');
        }

        const inputIds = this.textToInputIds(text);
        const inputTensor = new ort.Tensor('int64', new BigInt64Array(inputIds), [1, inputIds.length]);
        const inputLengthsTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(inputIds.length)]), [1]);

        const lengthScale = options.lengthScale ?? 1.0;
        const noise = options.noise ?? 0.667;
        const noiseW = options.noiseW ?? 0.8;
        const scalesTensor = new ort.Tensor('float32', new Float32Array([noise, lengthScale, noiseW]), [3]);

        const feeds = {
            'input': inputTensor,
            'input_lengths': inputLengthsTensor,
            'scales': scalesTensor
        };

        const results = await this.session.run(feeds);
        const output = results.output || Object.values(results)[0];
        const audioSamples = output.data; 

        return { samples: new Float32Array(audioSamples) };
    }

    textToInputIds(text) {
        const charToId = {};
        if (this.config && this.config.phoneme_id_map) {
            for (const char of Object.keys(this.config.phoneme_id_map)) {
                charToId[char] = this.config.phoneme_id_map[char];
            }
        }

        const inputIds = [];
        for (const char of text.toLowerCase()) {
            if (charToId[char] !== undefined) {
                inputIds.push(BigInt(charToId[char]));
            } else if (char === ' ') {
                inputIds.push(0n);
            }
        }
        return inputIds.length > 0 ? inputIds : [0n]; 
    }
}

class PiperCache {
    constructor(maxSize = 2) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    async getModel(modelPath, configPath) {
        if (this.cache.has(modelPath)) {
            const piper = this.cache.get(modelPath);
            // Move to end (MRU)
            this.cache.delete(modelPath);
            this.cache.set(modelPath, piper);
            return piper;
        }

        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            const oldestPiper = this.cache.get(oldestKey);
            await oldestPiper.dispose();
            this.cache.delete(oldestKey);
            logger.info('PiperCache', `Evicted model to free memory: ${path.basename(oldestKey)}`);
        }

        const piper = new Piper(modelPath, configPath);
        await piper.load();
        this.cache.set(modelPath, piper);
        return piper;
    }
}

module.exports = { Piper, PiperCache };