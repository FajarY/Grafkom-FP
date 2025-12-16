export interface SoundControl {
    source: AudioBufferSourceNode;
    gainNode: GainNode;
    stop: (fadeOutDuration?: number) => void;
}

const soundCache = new Map<string, AudioBuffer>();
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

const soundAssets: string[] = [
    './sounds/boiling-water-loop.mp3',
    './sounds/chop.mp3',
    './sounds/frying-loop.mp3',
    './sounds/invalid-combination.mp3',
    './sounds/testsound.mp3',
    './sounds/gass-loop.mp3',
    './sounds/peeling-all.mp3',
    './sounds/mix lawar.mp3',
    './sounds/grating.mp3',
    './sounds/sauce-drop.mp3',
    './sounds/pour-water.mp3',
    './sounds/pour-oil.mp3',
];

let bgmSource: AudioBufferSourceNode | null = null;
let bgmGainNode: GainNode | null = null;

export async function preloadSoundAssets(): Promise<void> {
    const promises = soundAssets.map(async (url) => {
        if (!soundCache.has(url)) {
            try {
                const audioBuffer = await loadSound(url);
                soundCache.set(url, audioBuffer);
            } catch (error) {
                console.error(`Failed to preload sound: ${url}`, error);
            }
        }
    });
    await Promise.all(promises);
}

async function loadSound(url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for url: ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
}

function playSound(
    audioBuffer: AudioBuffer,
    volume: number = 1.0,
    loop: boolean = false,
    fadeInDuration: number = 0,
    fadeOutDuration: number = 0,
    startTime: number = 0
): SoundControl {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    source.buffer = audioBuffer;
    source.loop = loop;

    const absoluteStartTime = audioContext.currentTime + startTime;

    if (fadeInDuration > 0) {
        gainNode.gain.setValueAtTime(0, absoluteStartTime);
        gainNode.gain.linearRampToValueAtTime(volume, absoluteStartTime + fadeInDuration);
    } else {
        gainNode.gain.setValueAtTime(volume, absoluteStartTime);
    }

    if (!loop && fadeOutDuration > 0) {
        const absoluteEndTime = absoluteStartTime + audioBuffer.duration;
        const fadeOutStartTime = absoluteEndTime - fadeOutDuration;
        if (fadeOutStartTime > absoluteStartTime + fadeInDuration) {
            gainNode.gain.setValueAtTime(volume, fadeOutStartTime);
            gainNode.gain.linearRampToValueAtTime(0, absoluteEndTime);
        }
    }

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(absoluteStartTime);

    return {
        source,
        gainNode,
        stop: (manualFadeOut: number = 0) => {
            const stopTime = audioContext.currentTime;

            if (manualFadeOut > 0) {
                gainNode.gain.cancelScheduledValues(stopTime);
                gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
                gainNode.gain.linearRampToValueAtTime(0, stopTime + manualFadeOut);
                source.stop(stopTime + manualFadeOut);
            } else {
                source.stop(stopTime);
            }
        }
    };
}

export async function loadAndPlaySound(
    url: string,
    volume: number = 1.0,
    fadeInDuration: number = 0,
    fadeOutDuration: number = 0,
    startTime: number = 0,
    loop: boolean = false,
): Promise<SoundControl> {
    let audioBuffer = soundCache.get(url);
    if (!audioBuffer) {
        audioBuffer = await loadSound(url);
        soundCache.set(url, audioBuffer);
    }
    return playSound(audioBuffer, volume, loop, fadeInDuration, fadeOutDuration, startTime);
}

export async function playBackgroundMusic(url: string): Promise<void> {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    let audioBuffer = soundCache.get(url);
    if (!audioBuffer) {
        audioBuffer = await loadSound(url);
        soundCache.set(url, audioBuffer);
    }

    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    source.buffer = audioBuffer;
    source.loop = true;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(0);

    bgmSource = source;
    bgmGainNode = gainNode;
}

export function setBGMVolume(value: number): void {
    if (bgmGainNode) {
        bgmGainNode.gain.value = value;
    }
}