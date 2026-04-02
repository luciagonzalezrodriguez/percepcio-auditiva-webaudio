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
const INTERVALS = [
    {name: "Segona Menor", semitones: 1, steps: 1},
    {name: "Segona Major", semitones: 2, steps: 1},
    {name: "Tercera Menor", semitones: 3, steps: 2},
    {name: "Tercera Major", semitones: 4, steps: 2},
    {name: "Quarta Justa", semitones: 5, steps: 3},
    {name: "Tríton", semitones: 6, steps: 3}, 
    {name: "Quinta Justa", semitones: 7, steps: 4},
    {name: "Sexta Menor", semitones: 8, steps: 5},
    {name: "Sexta Major", semitones: 9, steps: 5},
    {name: "Setena Menor", semitones: 10, steps: 6},
    {name: "Setena Major", semitones: 11, steps: 6},
    {name: "Octava", semitones: 12, steps: 7}
];

// Constants del Motor Musical Diatònic
const NOTES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const NATURAL_MIDI = [0, 2, 4, 5, 7, 9, 11]; 
const MIDI_TO_LETTER = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

let allowedDirections = [1, -1]; 
let allowedIntervalIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // Per defecte, tots activats
let smoothedPitchFreq = 0; 
const smoothingFactor = 0.15; 
let totalAttempts = 0;
let totalHits = 0;
let MIN_FREQ;
let MAX_FREQ;
let selectedVoice = null;
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

let currentTonicMidi= null;
let currentTargetMidi=null;
let currentTonicObj = null;
let currentTargetObj = null;
let successTimer = null; 
let isProcessingNext = false;

// Sincronitzar els botons del IdleSection i del EvaluatingSection per definir l'exercici
const allIntBtns = document.querySelectorAll('.int-btn');

allIntBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        
        const clickedIndex = e.target.dataset.index;
        
        const matchingBtns = document.querySelectorAll(`.int-btn[data-index="${clickedIndex}"]`);
        matchingBtns.forEach(b => b.classList.toggle('selected'));
        validarOpciones();
    });
});


const allDirBtns = document.querySelectorAll('.dir-btn');

allDirBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const clickedDir = e.target.dataset.dir;
        const matchingBtns = document.querySelectorAll(`.dir-btn[data-dir="${clickedDir}"]`);
        
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
    const activeDirs = document.querySelectorAll('.dir-btn.selected');
    const activeInts = document.querySelectorAll('.int-btn.selected');

    allowedDirections = Array.from(activeDirs).map(b => parseInt(b.dataset.dir));

    allowedIntervalIndices = Array.from(activeInts).map(b => parseInt(b.dataset.index));
    if (allowedDirections.length === 0 || allowedIntervalIndices.length === 0) {
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
        //await audioCtx.resume();
        generateChallenge();
    },300);
        } catch (err) {
            console.error("Error per accedir al micro:", err);
            alert("S'ha d'accedir al micròfon per poder fer l'exercisi.");
    }
});

//Desplegable de recomanacions
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

//Botons de l'exercici

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
    generateChallenge();
});

function generateChallenge() {
    totalAttempts++; 
    updateScoreUI();
    isProcessingNext=false;
    const minMidiVoice = freqToMidi(MIN_FREQ);
    const maxMidiVoice = freqToMidi(MAX_FREQ);

    const randomIndexAllowed = allowedIntervalIndices[Math.floor(Math.random() * allowedIntervalIndices.length)];   
    const randomInterval = INTERVALS[randomIndexAllowed];
    
    console.log("Interval triat:", randomInterval.name);
    const direction = allowedDirections[Math.floor(Math.random() * allowedDirections.length)];
    const isAscending = direction === 1;

    let minAllowedTonic, maxAllowedTonic;
    if (isAscending) {

        minAllowedTonic = minMidiVoice;
        maxAllowedTonic = maxMidiVoice - randomInterval.semitones;
    } else {
        minAllowedTonic = minMidiVoice + randomInterval.semitones;
        maxAllowedTonic = maxMidiVoice;
    }   

    currentTonicMidi = Math.floor(Math.random() * (maxAllowedTonic - minAllowedTonic + 1)) + minAllowedTonic;
    currentTargetMidi = currentTonicMidi + (randomInterval.semitones*direction);

    currentTonicObj = getSpelling(currentTonicMidi);
    currentTargetObj = getSpelling(currentTargetMidi, currentTonicObj.letterIdx, randomInterval.steps, direction);

    const directionText = isAscending ? " (Ascendent)" : " (Descendent)";
    document.getElementById('currentIntervalName').textContent = randomInterval.name + directionText;
    const noteDisplay = document.getElementById('detectedNoteName');
    noteDisplay.textContent = "---";
    noteDisplay.classList.remove('perfect-pitch'); // Netegem l'èxit anterior

    console.log(`Repte: Tònica=${currentTonicObj.uiName} | Canta=${currentTargetObj.uiName}`);    
    drawScore(currentTonicObj);
    playReferenceNote();
    console.log("Nota reproduïda");
}

function stopMic() {
    isListening = false;
    if (micGain) micGain.gain.value = 0;
    listenBtn.textContent = "Cantar ara";
    listenBtn.style.backgroundColor = ""; // Treiem el vermell
    listenBtn.style.color = "";
    if (animationId) cancelAnimationFrame(animationId);
}

function playReferenceNote() {
  
    audioCtx.resume().then(() => {
    const startTime = audioCtx.currentTime +0.05;
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    oscillator.type = 'sine'; 
    oscillator.frequency.value = currentTonicObj.freq;

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.1); // Sube a 0.5 de volumen
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5); // Desvanece
   
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + 3.0);

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


function freqToMidi(freq) {
    if (!freq || freq <= 0) return -1;
    return Math.round(12 * Math.log2(freq / 440) + 69);
}


function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// Retorna un objecte amb tota la info ortogràfica de la nota
function getSpelling(midi, tonicLetterIdx = null, intervalSteps = 0, direction = 1) {
    if (midi < 0) return null;
    const pitchClass = midi % 12;

    let letterIdx;
    if (tonicLetterIdx === null) {
        letterIdx = MIDI_TO_LETTER[pitchClass]; 
    } else {
        letterIdx = (tonicLetterIdx + (intervalSteps * direction) + 7) % 7; 
    }

    let diff = pitchClass - NATURAL_MIDI[letterIdx];
    if (diff < -6) diff += 12; 
    if (diff > 6) diff -= 12;

    let accUI = "", accVex = "";
    if (diff === 1) { accUI = "#"; accVex = "#"; }
    else if (diff === -1) { accUI = "b"; accVex = "b"; }
    else if (diff === 2) { accUI = "##"; accVex = "##"; }
    else if (diff === -2) { accUI = "bb"; accVex = "bb"; }

    const octave = Math.floor((midi - diff) / 12) - 1;
    const letter = NOTES[letterIdx].toUpperCase();

    return {
        midi: midi,
        freq: midiToFreq(midi),
        letterIdx: letterIdx,
        uiName: `${letter}${accUI}${octave}`,
        vexKey: `${NOTES[letterIdx]}/${octave}`,
        vexAcc: accVex
    };
}

//Funcionament de l'exercici
function update() {
    if (!isListening) return;
    animationId = requestAnimationFrame(update);
    
    if (analyser) {
        analyser.getFloatTimeDomainData(dataArray);
        const pitchFreq = yinDetector(dataArray, audioCtx.sampleRate);
        const noteDisplay = document.getElementById('detectedNoteName');

        if (pitchFreq !== -1 && pitchFreq > 50) {
            
            smoothedPitchFreq = smoothedPitchFreq + (pitchFreq - smoothedPitchFreq) *smoothingFactor;
            const sungMidi = freqToMidi(smoothedPitchFreq);
            let sungObj;
            if (sungMidi === currentTargetObj.midi) { 
                sungObj = currentTargetObj;
            } 
            
            else {
                sungObj = getSpelling(sungMidi);
            }
            noteDisplay.textContent = sungObj.uiName;

            const centsDiff = 1200 * Math.log2(smoothedPitchFreq/currentTargetObj.freq);

            if(Math.abs(centsDiff)<15){
                noteDisplay.classList.add('perfect-pitch');
                drawScore(currentTonicObj, currentTargetObj, true);
                if (!successTimer && !isProcessingNext) {
                    successTimer = setTimeout(() => {
                        console.log("¡Nota estabilizada por 1 segundo!");
                        nextChallenge(); 
                    }, 1000); 
                }
            } else {
                if (successTimer) {
                    clearTimeout(successTimer);
                    successTimer = null;
                    console.log("Temporizador cancelado por fluctuación");
                }
            }
        }else{
            noteDisplay.textContent = "---";
            noteDisplay.classList.remove('perfect-pitch');
        }
    }          
}

function nextChallenge() {
    if (isProcessingNext) return;
    totalHits++; 
    updateScoreUI();
    isProcessingNext = true;

    if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
    }

    const noteDisplay = document.getElementById('detectedNoteName');
    if (noteDisplay) {
        noteDisplay.style.color = "#2ecc71"; // Un verd brillant de victòria
    }

    setTimeout(() => {
        stopMic();

        generateChallenge();

        if (noteDisplay) {
            noteDisplay.style.color = ""; // Tornem al color original
            noteDisplay.classList.remove('perfect-pitch');
            noteDisplay.textContent = "---";
        }

        isProcessingNext = false;
        
        console.log("Nou repte carregat correctament.");
    }, 500);
       document.body.classList.add('flash-success');
    setTimeout(() => document.body.classList.remove('flash-success'), 500); 
}

//Dibuixar partitura
const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = Vex.Flow;

function drawScore(tonicObj, targetObj = null, showTarget = false) {
    const container = document.getElementById('sheetMusic');
    container.innerHTML = ""; 

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(300, 150);
    const context = renderer.getContext();
    const stave = new Stave(10, 20, 280);
    
    const clef = tonicObj.midi < 60 ? 'bass' : 'treble';
    stave.addClef(clef).setContext(context).draw();

    function getStemDirection(midi, clef) {
        if (clef === 'treble' && midi >= 71) return -1; 
        if (clef === 'bass' && midi >= 50) return -1;  
        return 1; 
    }
    const tonicNote = new StaveNote({ keys: [tonicObj.vexKey], duration: "q", clef: clef, stem_direction: getStemDirection(tonicObj.midi, clef) });
    if (tonicObj.vexAcc) tonicNote.addModifier(new Accidental(tonicObj.vexAcc));

    const notesToDraw = [tonicNote];

    if (showTarget && targetObj) {
        const targetNote = new StaveNote({ keys: [targetObj.vexKey], duration: "q", clef: clef, stem_direction: getStemDirection(targetObj.midi, clef) });
        if (targetObj.vexAcc) targetNote.addModifier(new Accidental(targetObj.vexAcc));
        
        targetNote.setStyle({fillStyle: "#629056", strokeStyle: "#629056"}).setLedgerLineStyle({strokeStyle:"#629056"});
        notesToDraw.push(targetNote);
    }

    const voice = new Voice({ num_beats: notesToDraw.length, beat_value: 4 });
    voice.addTickables(notesToDraw);
    const formatter = new Formatter().joinVoices([voice]);
    
    const notesWidth = notesToDraw.length * 50; 
    formatter.format([voice], notesWidth);
    const availableSpace = stave.getNoteEndX() - stave.getNoteStartX();
    const startX = stave.getNoteStartX() + (availableSpace - notesWidth) / 2;
    stave.setNoteStartX(startX);
    
    voice.draw(context, stave);
}


backBtn.addEventListener('click', () => {
    // Aturar mic
    stopMic();

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null; // Important per poder tornar a començar de zero després
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

