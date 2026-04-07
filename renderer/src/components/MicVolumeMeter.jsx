import React from 'react';
import { Mic } from 'lucide-react';
import { useStore } from '../store/useStore';

export const MicVolumeMeter = () => {
    const { 
        micVolume, 
        isTranslating, 
        settings, 
        updateSettings 
    } = useStore();

    const { sensitivity } = settings;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Mic className={`w-4 h-4 ${isTranslating && micVolume > (sensitivity/2) ? 'text-cyan-400' : 'text-gray-600'}`} />
                    <span className="text-xs text-gray-400 font-medium">MICROPHONE INPUT</span>
                </div>
                {isTranslating && micVolume > (sensitivity/2) && (
                    <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-red-400">ACTIVE</span>
                    </div>
                )}
            </div>

            {/* Volume Meter */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">Volume Level</span>
                    <span className="text-xs text-cyan-400 font-mono">{micVolume}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-150 ${
                            micVolume > 80 ? 'bg-red-500' : 
                            micVolume > (sensitivity/2) ? 'bg-cyan-500' : 
                            'bg-gray-700'
                        }`}
                        style={{ width: `${micVolume}%` }}
                    />
                </div>
            </div>

            {/* Sensitivity Slider */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">Sensitivity Threshold</span>
                    <span className="text-xs text-gray-400 font-mono">{sensitivity}%</span>
                </div>
                <div className="relative">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={sensitivity}
                        onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })}
                        className="w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer"
                        style={{
                            background: `linear-gradient(to right, rgb(6 182 212) 0%, rgb(6 182 212) ${sensitivity}%, rgb(31 41 55) ${sensitivity}%, rgb(31 41 55) 100%)`
                        }}
                    />
                </div>
                <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-600">Low</span>
                    <span className="text-xs text-gray-600">High</span>
                </div>
            </div>
        </div>
    );
};
