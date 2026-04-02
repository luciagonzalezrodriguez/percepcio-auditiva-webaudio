//Definició de constants
const idleSection1 = document.getElementById('idleSection1');
const idleSection2 = document.getElementById('idleSection2');
const goToIdle2Btn = document.getElementById('goToIdle2Btn');
const evaluatingSection = document.getElementById('evaluatingSection');
const startBtn = document.getElementById('startBtn');
const listenBtn = document.getElementById('listenBtn');
const repeatBtn = document.getElementById('repeatBtn');
const nextBtn = document.getElementById('nextBtn');
const bufferSize = 2048; 
const voiceBtns = document.querySelectorAll('.voice-btn');
const backBtn = document.getElementById('backBtn');

const NOTE_NAMES_UI = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAMES_VEX = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];

let smoothedPitchFreq = 0;
const smoothingFactor = 0.08;

let allowedNums=[3,4,5];
let pastScores = [];
let MIN_FREQ;
let MAX_FREQ;
let selectedVoice = null;
let audioCtx;
let activeOscillators = [];
let activeGainNodes = [];
let analyser;
let dataArray;
let source;
let isListening = false;
let animationId;
let stream;
let micGain;
let currentChordMidi = [];
let sungChordNotes = [];
let successTimer = null; 
let isProcessingNext = false; // Evita que es disparin 2 reptes a la vegada
let currentlySustainedMidi = null;
let currentWrongMidi = []; 
let wrongNoteTimer = null;
let pendingWrongMidi = null; 


const allNumBtns = document.querySelectorAll('.num-btn');

allNumBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        allNumBtns.forEach(b => b.classList.remove('selected'));
        
        const clickedNum = e.target.dataset.num;
        
        const matchingBtns = document.querySelectorAll(`.num-btn[data-num="${clickedNum}"]`);
        
        matchingBtns.forEach(b => b.classList.toggle('selected'));

        validarOpciones();
    });
});

const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

openSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';

     generateChallenge(); 
});

voiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        
        voiceBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        MIN_FREQ = parseFloat(btn.dataset.min);
        MAX_FREQ = parseFloat(btn.dataset.max);
        
        selectedVoice = btn.textContent;
        goToIdle2Btn.disabled = false;
        
        console.log(`Tessitura seleccionada: ${selectedVoice} (${MIN_FREQ}-${MAX_FREQ} Hz)`);
    });
});

goToIdle2Btn.addEventListener('click', () => {
    idleSection1.style.display = 'none';
    idleSection2.style.display = 'block';
});

function validarOpciones() {
    const activeNums = document.querySelectorAll('.num-btn.selected');

    allowedNums = Array.from(activeNums).map(b => parseInt(b.dataset.num));

    if (allowedNums.length === 0) {
        startBtn.disabled = true;
    } else {
        startBtn.disabled = false;
    }
}

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
        idleSection2.style.display = 'none';
        evaluatingSection.style.display = 'flex';
        document.body.classList.add('evaluating-mode');

        generateChallenge();
    },300);
        } catch (err) {
            console.error("Error per accedir al micro:", err);
            alert("S'ha d'accedir al micròfon per poder fer l'exercisi.");
    }
});

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

listenBtn.addEventListener('click', async () => {
    if (!isListening) {
        micGain.gain.value = 1;
        listenBtn.textContent = "Aturar micròfon";
        listenBtn.style.backgroundColor = "#ca483a"; // Vermell per indicar activitat
        listenBtn.style.color = "#fff";
        isListening = true;
        update();
        console.log(audioCtx.state, audioCtx.sampleRate);
    } else {
        stopMic();
    }
});

repeatBtn.addEventListener('click', () => {
    stopMic();
    playReferenceNote(false);
});

nextBtn.addEventListener('click', () => {
    stopMic();
    stopReferenceNote();
    if (currentChordMidi && currentChordMidi.length > 0 && sungChordNotes.length < currentChordMidi.length) {
        const pointsPerNote = 100 / currentChordMidi.length;
        const correctPoints = sungChordNotes.length * pointsPerNote;
        const penaltyPoints = currentWrongMidi.length * 10;
        
        let skippedScore = correctPoints - penaltyPoints;
        if (skippedScore < 0) skippedScore = 0; // Evitem notes negatives
        
        pastScores.push(skippedScore);
        updateScoreUI();
    }
    generateChallenge();
});

noteBtn.addEventListener('click', () =>{
    stopMic();
    playReferenceNote(true);

})

function generateChallenge() {

    const minMidiVoice = freqToMidi(MIN_FREQ);
    const maxMidiVoice = freqToMidi(MAX_FREQ);
    const chordNum = allowedNums[Math.floor(Math.random() * allowedNums.length)];
    currentChordMidi = [];
    currentWrongMidi= [];
    while (currentChordMidi.length < chordNum ) {
        const randomMidi = Math.floor(Math.random() * (maxMidiVoice - minMidiVoice + 1)) + minMidiVoice;
        
        if (!currentChordMidi.includes(randomMidi)) {
            currentChordMidi.push(randomMidi);
        }
    }
    currentChordMidi.sort((a, b) => a - b);
    sungChordNotes = [];

    console.log("Acord generat:", currentChordMidi.map(midiToNoteString));

   drawScore(sungChordNotes);
    playReferenceNote(false); 
}

function stopMic() {
    isListening = false;
    if (micGain) micGain.gain.value = 0;
    listenBtn.textContent = "Cantar ara";
    listenBtn.style.backgroundColor = ""; // Treiem el vermell
    listenBtn.style.color="";
    if (animationId) cancelAnimationFrame(animationId);
}

function playReferenceNote(isArpeggiated = false) {
  
    audioCtx.resume().then(() => {
    stopReferenceNote();
    const baseStartTime = audioCtx.currentTime +0.05;
    const staggerAmount = 0.6; // Segons entre nota y nota
        
        const totalStaggerTime = isArpeggiated ? (currentChordMidi.length - 1) * staggerAmount : 0;
        
        const pedalLiftTime = baseStartTime + totalStaggerTime + 1.2; 
        const globalStopTime = pedalLiftTime + 0.6;
    
    currentChordMidi.forEach((midi, index) =>{
        const freq = midiToFreq(midi);
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const panner = audioCtx.createStereoPanner();
        oscillator.type = 'sine'; 
        oscillator.frequency.value = freq;
    

        const maxVolume = 0.15;
        let panValue = 0;
            if (currentChordMidi.length > 1) {
                panValue = -1 + (index * (2 / (currentChordMidi.length - 1)));
            }
        panner.pan.value = panValue;        
        const startTime = isArpeggiated ? baseStartTime + (index *staggerAmount): baseStartTime;
        
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(maxVolume, startTime + 0.1); 
            gainNode.gain.linearRampToValueAtTime(maxVolume, pedalLiftTime);
            gainNode.gain.linearRampToValueAtTime(0.001, globalStopTime);

   
        oscillator.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(audioCtx.destination);
        oscillator.start(startTime);
        oscillator.stop(globalStopTime + 0.1);

        oscillator.onended = () => {
            oscillator.disconnect();
            gainNode.disconnect();
        };
    })
    });
}

function stopReferenceNote(){
    activeOscillators.forEach(oscillator =>{
        try {oscillator.stop(); oscillator.disconnect();} catch(e){}
    });
    activeGainNodes.forEach(gain =>{
        try { gainNode.disconnect();} catch(e){}
    });
    activeOscillators =[];
    activeGainNodes = [];
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

function freqToMidi(freq) {
    if (!freq || freq <= 0) return -1;
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToNoteString(midi) {
    if (midi < 0) return "---";
    const noteName = NOTE_NAMES_UI[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${noteName}${octave}`;
}

// Tradueix MIDI per a VexFlow 
function midiToVexFlowString(midi) {
    if (midi < 0) return "";
    const noteName = NOTE_NAMES_VEX[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${noteName}/${octave}`;
}

//Funcionament de l'exercici/Validació

function update() {
    if (!isListening) return;
    animationId = requestAnimationFrame(update);
    
    if (analyser) {
        analyser.getFloatTimeDomainData(dataArray);
        const pitchFreq = yinDetector(dataArray, audioCtx.sampleRate);
        
        let rms = 0;
        for (let i = 0; i < dataArray.length; i++) {
            rms += dataArray[i] * dataArray[i];
        }
        rms = Math.sqrt(rms / dataArray.length);

        const isSilence = (pitchFreq === -1 || pitchFreq < 70 || rms < 0.05);

        if (!isSilence) {
            if (smoothedPitchFreq === 0) {
                smoothedPitchFreq = pitchFreq;
            } else {
                smoothedPitchFreq = smoothedPitchFreq + (pitchFreq - smoothedPitchFreq) * smoothingFactor;
            }            
            const sungMidi = freqToMidi(smoothedPitchFreq);
            console.log(sungMidi);
            const isTargetNote = currentChordMidi.includes(sungMidi) && !sungChordNotes.includes(sungMidi);
            const isAlreadyFound = currentChordMidi.includes(sungMidi) && sungChordNotes.includes(sungMidi);

            if (isTargetNote) {
                if (wrongNoteTimer) { clearTimeout(wrongNoteTimer); wrongNoteTimer = null; pendingWrongMidi = null; }
                const targetFreq = midiToFreq(sungMidi);
                const centsDiff = 1200 * Math.log2(smoothedPitchFreq / targetFreq);
            
                if (Math.abs(centsDiff) < 25) {
                    
                    if (currentlySustainedMidi !== sungMidi) {
                        cancelarTemporizador(); // Limpiamos por si venía deslizando la voz desde otra nota
                        currentlySustainedMidi = sungMidi;
                        
                        successTimer = setTimeout(() => {
                            sungChordNotes.push(sungMidi);
                            console.log(`Nota encertada: ${midiToNoteString(sungMidi)}! Portes ${sungChordNotes.length} de ${currentChordMidi.length}.`);
                            
                            sungChordNotes.sort((a, b) => a - b);
                            drawScore(sungChordNotes);
                            
                            cancelarTemporizador();
                            
                            if (sungChordNotes.length === currentChordMidi.length) {
                                console.log("Acord completat!");
                                let chordScore = 100 - (currentWrongMidi.length * 10);
                                if (chordScore < 0) chordScore = 0; 
                                
                                pastScores.push(chordScore); 
                                updateScoreUI(); 
                                isProcessingNext = true;
                                setTimeout(() => {
                                    nextChallenge();
                                }, 1000);
                            }
                        }, 700);

                    }
                } else {
                    cancelarTemporizador();
                }
            } else if(isAlreadyFound) {
                cancelarTemporizador();
            }else {
                if (successTimer) { clearTimeout(successTimer); successTimer = null; currentlySustainedMidi = null; }
            if (pendingWrongMidi !== sungMidi) {
                    pendingWrongMidi = sungMidi;
                    if (wrongNoteTimer) {
                        clearTimeout(wrongNoteTimer);
                    }
                    wrongNoteTimer = setTimeout(() => {
                        if (!currentWrongMidi.includes(pendingWrongMidi)) {
                            currentWrongMidi.push(pendingWrongMidi);
                            drawScore(sungChordNotes);
                        }
                    }, 700);
                }
            
            }   
    }else{
        //Silenci
       cancelarTemporizador();
       smoothedPitchFreq = 0; 
    }
}}

function cancelarTemporizador() {
    if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
        currentlySustainedMidi = null; 
    }
    if (wrongNoteTimer) {
        clearTimeout(wrongNoteTimer);
        wrongNoteTimer = null;
        pendingWrongMidi = null;
    }
}

function nextChallenge() {
    isProcessingNext = true;

    if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
    }

    setTimeout(() => {
        stopMic();
        sungChordNotes = [];
        isProcessingNext = false;

        generateChallenge(); 

        drawScore(sungChordNotes); 
    }, 500);
    document.body.classList.add('flash-success');
    setTimeout(() => document.body.classList.remove('flash-success'), 500); 
}



//Dibuixar el pentagrama
const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = Vex.Flow;

function drawScore(notesArray) {
   const container = document.getElementById('sheetMusic');
    container.innerHTML = ""; 

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(300, 150);
    const context = renderer.getContext();

    const stave = new Stave(10, 20, 280);
    
    let clef = 'treble';
    let isTenor = false;

    if (selectedVoice) {
        const veu = selectedVoice.toLowerCase(); 
        
        if (veu.includes('soprano') || veu.includes('contralt')) {
            clef = 'treble';
            stave.addClef(clef).setContext(context).draw();
            
        } else if (veu.includes('tenor')) {
            clef = 'treble';
            isTenor = true;
            stave.addClef(clef, 'default', '8vb').setContext(context).draw();
            
        } else if (veu.includes('baix')) {
            clef = 'bass';
            stave.addClef(clef).setContext(context).draw();
        }
    }
    
    let notesToDraw = notesArray ? [...notesArray] : [];
    if (currentWrongMidi && currentWrongMidi.length > 0) {
        notesToDraw = notesToDraw.concat(currentWrongMidi);
    }
    notesToDraw.sort((a,b)=>a-b);
    if (notesToDraw.length === 0) {
        return;
    }

    const displayNotes = notesToDraw.map(midi => {
        return isTenor ? midi + 12 : midi; 
    });

    const keysArray = displayNotes.map(midi => midiToVexFlowString(midi));

    const chordNote = new StaveNote({ 
        keys: keysArray, 
        duration: "w", 
        clef: clef 
    });
    
    keysArray.forEach((key, index) => {
        if (key.includes('#')) {
            chordNote.addModifier(new Accidental("#"), index);
        }
        
        const originalMidi = notesToDraw[index]; 
        
        if (currentWrongMidi.includes(originalMidi)) {
            chordNote.setKeyStyle(index, { fillStyle: "#ca483a", strokeStyle: "#ca483a" })
                     .setLedgerLineStyle({strokeStyle:"#ca483a"}); 
        } else {
            chordNote.setKeyStyle(index, { fillStyle: "#629056", strokeStyle: "#629056" })
                     .setLedgerLineStyle({strokeStyle:"#629056"}); 
        }
    });

    const voice = new Voice({ num_beats: 4, beat_value: 4 });
    voice.addTickables([chordNote]); 
    
    const formatter = new Formatter().joinVoices([voice]);
    formatter.format([voice], 100);

    const availableSpace = stave.getNoteEndX() - stave.getNoteStartX();
    const startX = stave.getNoteStartX() + (availableSpace - 100) / 2;
    stave.setNoteStartX(startX);
    
    voice.draw(context, stave);
}
//Actualització de l'score
function updateScoreUI() {
    if (pastScores.length === 0) {
        document.getElementById('hits').textContent = "0%";
        return;
    }

    let totalSum = pastScores.reduce((a, b) => a + b, 0);
    let globalAverage = totalSum / pastScores.length;

    document.getElementById('hits').textContent = Math.round(globalAverage) + "%";

}

//Botons de navegació
backBtn.addEventListener('click', () => {
    stopMic();

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    stopReferenceNote();
     startBtn.disabled = true;
     voiceBtns.forEach(btn => btn.classList.remove('selected'));

    window.location.href = "index.html";
});


