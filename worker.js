/**
 * worker.js
 * The background thread for executing user code.
 */

self.onmessage = function(e) {
    const { code } = e.data;
    
    try {
        // Clear previous state
        self.postMessage({ type: 'STATUS', status: 'Running...' });

        // Execute the instrumented code
        // We use eval() here because the code is already instrumented and running in a worker.
        eval(code);

        self.postMessage({ type: 'STATUS', status: 'Execution Complete' });
        self.postMessage({ type: 'DONE' });
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: err.message });
    }
};
