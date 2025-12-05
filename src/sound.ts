const soundCache = new Map<string, AudioBuffer>();
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

const soundAssets: string[] = [
    './sounds/boiling-water-loop.mp3',
    './sounds/chop.mp3',
    './sounds/deepfry-loop.mp3',
    './sounds/invalid-combination.mp3',
    './sounds/testsound.mp3' 
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

function playSound(audioBuffer: AudioBuffer, volume: number = 1.0): void {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    source.buffer = audioBuffer;
    gainNode.gain.value = volume;

    source.connect(gainNode)
    gainNode.connect(audioContext.destination);
    source.start(0);
}

export async function playSoundLoopForDuration(url: string, durationMs: number, volume: number = 1.0): Promise<void> {
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
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const currentTime = audioContext.currentTime;
    source.start(currentTime);
    
    const fadeTime = 0.2;
    const stopTime = currentTime + (durationMs / 1000);

    gainNode.gain.setValueAtTime(volume, stopTime - fadeTime); 
    gainNode.gain.linearRampToValueAtTime(0, stopTime); 

    source.stop(stopTime);
}

export async function loadAndPlaySound(url: string, volume: number = 1.0): Promise<void> {
    let audioBuffer = soundCache.get(url);
    if (!audioBuffer) {
        audioBuffer = await loadSound(url);
        soundCache.set(url, audioBuffer);
    }
    playSound(audioBuffer, volume);
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