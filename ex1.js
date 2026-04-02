//Definició de constants
const idleSection = document.getElementById('idleSection');
const evaluatingSection = document.getElementById('evaluatingSection');
const startBtn = document.getElementById('startBtn');
const listenBtn = document.getElementById('listenBtn');
const repeatBtn = document.getElementById('repeatBtn');
const nextBtn = document.getElementById('nextBtn');
const bufferSize = 2048; 
const smoothingFactor = 0.08; // Controla la lentitud (0.01 molt lent, 0.2 més ràpid)
const targetFreqDisplay = document.getElementById('targetFreqVal');
const detectedFreqDisplay = document.getElementById('detectedFreqVal');
const voiceBtns = document.querySelectorAll('.voice-btn');
const backBtn = document.getElementById('backBtn');

let totalAttempts = 0;
let totalHits = 0;
let targetFrequency = 0;
let MIN_FREQ; // Frecuencia mínima en Hz
let MAX_FREQ; // Frecuencia máxima en Hz
let selectedVoice = null;
let smoothedPitch = 0;
let audioCtx;
let oscillator;
let gainNode;
let analyser;
let dataArray;
let source;
let isListening = false;
let animationId;
let stream;
let micGain;
let currentCents = 0; 
let successTimer = null; 
let isProcessingNext = false; 


//Flux de l'aplicació

voiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        voiceBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        MIN_FREQ = parseFloat(btn.dataset.min);
        MAX_FREQ = parseFloat(btn.dataset.max);
        
        selectedVoice = btn.textContent;
        startBtn.disabled = false;
        
        console.log(`Tessitura seleccionada: ${selectedVoice} (${MIN_FREQ}-${MAX_FREQ} Hz)`);
    });
});

startBtn.addEventListener('click', async() => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    try {
            stream = await navigator.mediaDevices.getUserMedia({ 
            audio:true,echoCancellation:false,noiseSuppression: false, autoGainControl: false
          });

        source = audioCtx.createMediaStreamSource(stream);
        micGain = audioCtx.createGain();
        micGain.gain.value = 0;
        
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = bufferSize;
        
        source.connect(micGain);
        micGain.connect(analyser);
        
        dataArray = new Float32Array(bufferSize);
    setTimeout(() => {
        idleSection.style.display = 'none';
        evaluatingSection.style.display = 'flex';
        document.body.classList.add('evaluating-mode');

        setupGraphics();
        newChallenge();
    },300);
        } catch (err) {
            console.error("Error per accedir al micro:", err);
            alert("S'ha d'accedir al micròfon per poder fer l'exercisi.");
    }
});

//Desplegable recomanacions
const tipsBtn = document.getElementById('tipsBtn');
const tipsDropdown = document.getElementById('tipsDropdown');

tipsBtn.addEventListener('click', (event) => {
    event.stopPropagation(); 
    tipsDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
    if (!tipsDropdown.classList.contains('hidden')) {
        if (!tipsDropdown.contains(event.target) && event.target !== tipsBtn) {
            tipsDropdown.classList.add('hidden');
        }
    }
});

//Botons possibilitats de l'exercici

listenBtn.addEventListener('click', async () => {
    if (!isListening) {
        micGain.gain.value = 1;
        listenBtn.textContent = "Aturar micròfon";
        listenBtn.style.backgroundColor = "#ca483a";
        listenBtn.style.color = "#fff";
        isListening = true;
        update();
        console.log(audioCtx.state, audioCtx.sampleRate);
    } else {
        stopMic();
    }
});

repeatBtn.addEventListener('click', () => {
    if (oscillator) {
        try { oscillator.disconnect(); } catch(e) {}
    }
    if (gainNode) {
        try { gainNode.disconnect(); } catch(e) {}
    }
    playReferenceNote();
});

nextBtn.addEventListener('click', () => {
    stopMic();
    if (oscillator) {
        try { oscillator.disconnect(); } catch(e) {}
    }
    if (gainNode) {
        try { gainNode.disconnect(); } catch(e) {}
    }
    newChallenge();
});

function newChallenge() {
    totalAttempts++; 
    updateScoreUI();
    targetFrequency = Math.random() * (MAX_FREQ - MIN_FREQ) + MIN_FREQ;
    targetFreqDisplay.textContent = targetFrequency.toFixed(2); //Actualitza el text HTML
    console.log(`Objectiu: ${targetFrequency.toFixed(2)} Hz`);
    setupGraphics();
    playReferenceNote();
}
//Motor d'àudio

function stopMic() {
    isListening = false;
    if (micGain) micGain.gain.value = 0;
    listenBtn.textContent = "Cantar ara";
    listenBtn.style.backgroundColor = ""; // Treiem el vermell
    listenBtn.style.color="";
    if (animationId) cancelAnimationFrame(animationId);
    setupGraphics(); // Neteja l'agulla
}

function playReferenceNote() {

    audioCtx.resume().then(() => {
    const startTime = audioCtx.currentTime +0.05;
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    oscillator.type = 'sine'; 
    oscillator.frequency.value = targetFrequency;

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1); // Sube a 0.5 de volumen
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5); // Desvanece

   
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + 1.5);

    oscillator.onended = () => {
            oscillator.disconnect();
            gainNode.disconnect();
        };
    });
}

//Algoritme YIN, detecció de pitch
function yinDetector(buffer, sampleRate) {
    const size = buffer.length / 2;
    const yinBuffer = new Float32Array(size);

    for (let tau = 0; tau < size; tau++) {
        for (let i = 0; i < size; i++) {
            let delta = buffer[i] - buffer[i + tau];
            yinBuffer[tau] += delta * delta;
        }
    }

    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < size; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] *= tau / runningSum;
    }

    let tauFound = -1;
    for (let tau = 1; tau < size; tau++) {
        if (yinBuffer[tau] < 0.15) {
            while (tau + 1 < size && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauFound = tau;
            break;
        }
    }

    return (tauFound === -1) ? -1 : sampleRate / tauFound;
}

//Funcionament validació dades
function update() {
    if (!isListening) return;
    animationId = requestAnimationFrame(update);
    
    if (analyser) {
        analyser.getFloatTimeDomainData(dataArray);
        const pitch = yinDetector(dataArray, audioCtx.sampleRate);
    setupGraphics(); 
    if (pitch !== -1 && pitch > 50) { 
        const targetCents = 1200 * Math.log2(pitch / targetFrequency);
        if (Math.abs(targetCents - currentCents) > 200) {
                targetCents = currentCents; 
            }
        currentCents = currentCents + (targetCents - currentCents) *smoothingFactor;
        const visualFreq = targetFrequency * Math.pow(2, currentCents / 1200);
        detectedFreqDisplay.textContent = visualFreq.toFixed(2);
        const needlePosition = Math.max(-50, Math.min(50, currentCents));
        drawNeedle(needlePosition);
        if (Math.abs(currentCents) < 10) {
            detectedFreqDisplay.style.color = "#71ad73";
            
            if (!successTimer && !isProcessingNext) {
                successTimer = setTimeout(() => {
                    console.log("¡Nota estabilizada por 1 segundo!");
                    nextChallenge(); 
                }, 1000); 
            }
        } else {
            detectedFreqDisplay.style.color = "#e58f7c";
            if (successTimer) {
                clearTimeout(successTimer);
                successTimer = null;
            }
        }

    }else{
        detectedFreqDisplay.textContent = "---";
        detectedFreqDisplay.style.color = "";
        if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
        }
    }
     }}

function nextChallenge() {
    if (isProcessingNext) return;
    totalHits++; 
    updateScoreUI();
    isProcessingNext = true;

    if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
    }
    setTimeout(() => {
        stopMic();
        newChallenge();

        detectedFreqDisplay.style.color = "";
        detectedFreqDisplay.textContent = "---";
        currentCents = 0;
        
        isProcessingNext = false;
        console.log("Nou repte de freqüència a punt.");
    }, 500);
    document.body.classList.add('flash-success');
    setTimeout(() => document.body.classList.remove('flash-success'), 500);

}
//Gràfics
function setupGraphics() {
    const canvas = document.getElementById('tunerCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#b2eab2'; 
    ctx.fillRect(160, 0, 80, height);

    ctx.strokeStyle = '#dddddd';
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(300, height); ctx.stroke();

    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    ctx.setLineDash([]); 
}

function drawNeedle(cents) {
    const canvas = document.getElementById('tunerCanvas');
    const ctx = canvas.getContext('2d');
    const x = (cents + 50) * (canvas.width / 100);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
}

//Botons de navegació
backBtn.addEventListener('click', () => {
    stopMic(); 

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    if (oscillator) {
        try {
            oscillator.stop();
            oscillator.disconnect();
        } catch(e){}
    }

     startBtn.disabled = true;
     voiceBtns.forEach(btn => btn.classList.remove('selected'));

    window.location.href = "index.html";
});

//Actualitzar score
function updateScoreUI() {
    document.getElementById('hits').textContent = totalHits;
    document.getElementById('attempts').textContent = totalAttempts;
}

