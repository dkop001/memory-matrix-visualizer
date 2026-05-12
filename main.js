
let editor;
let visualizer;
let snapshots = [];
let worker;

function log(msg) {
    console.log(msg);
    const debugEl = document.getElementById('debug-log');
    if (debugEl) {
        const div = document.createElement('div');
        div.innerText = `> ${msg}`;
        debugEl.appendChild(div);
        debugEl.scrollTop = debugEl.scrollHeight;
    }
}

// Show debug log on triple click of status bar
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('status-bar').addEventListener('click', (e) => {
        if (e.detail === 3) {
            document.getElementById('debug-log').style.display = 'block';
            log('Debug log enabled');
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    initEditor();
    initVisualizer();
    setupEventListeners();
    checkBabelStatus();
});

function checkBabelStatus() {
    log('Starting Babel readiness check...');
    const statusText = document.getElementById('status-text');
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(() => {
        // Check global window.Babel
        let babel = window.Babel || (typeof Babel !== 'undefined' ? Babel : null);
        
        // If not found, check if it was loaded as an AMD module by accident
        if (!babel && window.require && window.require.specified && window.require.specified('babel')) {
            log('Notice: Babel detected as AMD module. Attempting to extract...');
            try { babel = window.require('babel'); } catch(e) {}
        }

        if (babel) {
            window.Babel = babel; // Ensure it's on window for other scripts
            log('Babel detected successfully');
            statusText.innerHTML = '<span style="color: #00f2ff">System Ready</span>';
            clearInterval(interval);
        } else {
            attempts++;
            if (attempts % 10 === 0) log(`Check attempt ${attempts}/${maxAttempts}...`);
            statusText.innerText = `Initializing Babel (${attempts}/${maxAttempts})...`;
            
            if (attempts >= maxAttempts) {
                log('CRITICAL: Babel failed to load after 30s');
                statusText.innerHTML = 'Babel failed. <button onclick="location.reload()" style="background: none; border: 1px solid #ff4d4d; color: #ff4d4d; cursor: pointer; padding: 2px 5px; font-size: 0.6rem; margin-left: 5px;">RELOAD</button>';
                clearInterval(interval);
            }
        }
    }, 500);
}

function initEditor() {
    const waitForMonaco = setInterval(() => {
        if (typeof require !== 'undefined' && typeof monaco === 'undefined') {
            require(['vs/editor/editor.main'], function () {
                createEditor();
                clearInterval(waitForMonaco);
            });
        } else if (typeof monaco !== 'undefined') {
            createEditor();
            clearInterval(waitForMonaco);
        }
    }, 100);
}

function createEditor() {
    if (editor) return;
    editor = monaco.editor.create(document.getElementById('monaco-container'), {
            value: [
                'function fibonacci(n) {',
                '    let a = 0;',
                '    let b = 1;',
                '    for (let i = 0; i < n; i++) {',
                '        let temp = a;',
                '        a = b;',
                '        b = temp + b;',
                '    }',
                '    return a;',
                '}',
                '',
                'fibonacci(5);'
            ].join('\n'),
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: true,
            fontFamily: 'JetBrains Mono',
            fontSize: 14,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            roundedSelection: false,
            readOnly: false,
            cursorStyle: 'line',
        });
}

function initVisualizer() {
    const waitForThree = setInterval(() => {
        if (typeof THREE !== 'undefined' && THREE.OrbitControls) {
            visualizer = new Visualizer('three-container');
            clearInterval(waitForThree);
        }
    }, 100);
}

function setupEventListeners() {
    const runBtn = document.getElementById('run-btn');
    const stopBtn = document.getElementById('stop-btn');
    const resetBtn = document.getElementById('reset-btn');
    const slider = document.getElementById('timeline-slider');

    runBtn.addEventListener('click', () => {
        runCode();
    });

    stopBtn.addEventListener('click', () => {
        if (worker) {
            worker.terminate();
            document.getElementById('status-text').innerText = 'Execution Terminated';
            document.getElementById('worker-status').innerText = 'Worker: Stopped';
        }
    });

    resetBtn.addEventListener('click', () => {
        resetExecution();
    });

    slider.addEventListener('input', (e) => {
        scrubToStep(parseInt(e.target.value));
    });
}

function runCode() {
    const code = editor.getValue();
    const statusText = document.getElementById('status-text');
    
    try {
        const babel = window.Babel || (typeof Babel !== 'undefined' ? Babel : null);
        if (!babel) {
            statusText.innerText = 'Babel not ready. Please wait...';
            return;
        }

        statusText.innerText = 'Instrumenting...';
        const instrumented = instrumentCode(code);
        
        resetExecution();
        
        statusText.innerText = 'Running Worker...';
        
        // Fetch the worker.js content and create a Blob to avoid CORS issues
        fetch('worker.js')
            .then(response => response.text())
            .then(workerCode => {
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                worker = new Worker(URL.createObjectURL(blob));
                
                worker.onmessage = (e) => {
                    const { type, snapshot, status, error } = e.data;
                    
                    if (type === 'SNAPSHOT') {
                        snapshots.push(snapshot);
                        updateTimelineUI();
                    } else if (type === 'STATUS') {
                        statusText.innerText = status;
                    } else if (type === 'ERROR') {
                        statusText.innerText = 'Error: ' + error;
                        console.error(error);
                    } else if (type === 'DONE') {
                        statusText.innerText = 'Execution Complete';
                        document.getElementById('worker-status').innerText = 'Worker: Idle';
                    }
                };

                worker.postMessage({ code: instrumented });
                document.getElementById('worker-status').innerText = 'Worker: Active';
            })
            .catch(err => {
                statusText.innerText = 'Worker Load Failed: ' + err.message;
            });

    } catch (err) {
        statusText.innerText = 'Failed: ' + err.message;
    }
}

let isPlaying = false;
let playInterval;

function updateTimelineUI() {
    const slider = document.getElementById('timeline-slider');
    const totalSteps = document.getElementById('total-steps');
    
    slider.max = snapshots.length - 1;
    totalSteps.innerText = `/ ${snapshots.length}`;

    // Auto-advance if we are at the end and a new snapshot comes in
    if (!isPlaying && slider.value == slider.max - 1) {
        slider.value = slider.max;
        scrubToStep(snapshots.length - 1);
    }
}

function scrubToStep(index) {
    if (!snapshots[index]) return;
    
    const stepInfo = document.getElementById('current-step');
    const actionText = document.getElementById('action-text');
    
    stepInfo.innerText = `Step: ${index + 1}`;
    actionText.innerText = snapshots[index].action;
    
    // Highlight line in editor
    highlightLine(snapshots[index].line);
    
    // Update the 3D View: Reconstruct if jumping, apply delta if sequential
    const currentSliderValue = parseInt(document.getElementById('timeline-slider').value);
    if (index === currentSliderValue) {
        visualizer.applySnapshot(snapshots[index], true);
    } else {
        visualizer.reconstruct(snapshots, index);
    }
}

function highlightLine(line) {
    if (!editor) return;
    const decorations = editor.createDecorationsCollection([
        {
            range: new monaco.Range(line, 1, line, 1),
            options: {
                isWholeLine: true,
                className: 'line-highlight',
                marginClassName: 'line-highlight-margin'
            }
        }
    ]);
    // Clear old decorations after a bit or on next highlight
    setTimeout(() => decorations.clear(), 500);
}

function resetExecution() {
    if (worker) worker.terminate();
    snapshots = [];
    visualizer.reset();
    
    const slider = document.getElementById('timeline-slider');
    slider.value = 0;
    slider.max = 0;
    
    document.getElementById('current-step').innerText = 'Step: 0';
    document.getElementById('total-steps').innerText = '/ 0';
    document.getElementById('action-text').innerText = 'Ready...';
    document.getElementById('status-text').innerText = 'System Idle';
}
