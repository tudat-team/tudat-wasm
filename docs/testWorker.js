// Web Worker for running WASM tests off the main thread
// This keeps the UI responsive while tests execute

// Global error handler for uncaught errors
self.onerror = function(message, source, lineno, colno, error) {
    const errorMsg = error?.message || message || 'Unknown global error';
    console.error('Worker global error:', { message, source, lineno, colno, error });
    self.postMessage({ type: 'error', message: `Global: ${errorMsg}` });
    return true;
};

self.onunhandledrejection = function(event) {
    const errorMsg = event.reason?.message || event.reason?.toString() || String(event.reason) || 'Unhandled rejection';
    console.error('Worker unhandled rejection:', event.reason);
    self.postMessage({ type: 'error', message: `Rejection: ${errorMsg}` });
};

let wasmModule = null;
let testCount = 0;
let passCount = 0;
let failCount = 0;

function processOutput(text) {
    if (!text || typeof text !== 'string') return;

    // Send raw output to main thread for console display
    self.postMessage({ type: 'output', text: text });

    // Parse test results
    if (text.startsWith('[PASS]')) {
        testCount++;
        passCount++;
        const testName = text.substring(7).trim();
        self.postMessage({
            type: 'result',
            passed: true,
            name: testName,
            current: testCount,
            passCount: passCount,
            failCount: failCount
        });
    } else if (text.startsWith('[FAIL]')) {
        testCount++;
        failCount++;
        const testName = text.substring(7).trim();
        self.postMessage({
            type: 'result',
            passed: false,
            name: testName,
            current: testCount,
            passCount: passCount,
            failCount: failCount
        });
    } else if (text.includes('===') && text.includes('Tests')) {
        // Category header
        self.postMessage({ type: 'category', name: text });
    } else if (text.includes('Total:')) {
        // Summary line - extract total count
        const match = text.match(/Total:\s*(\d+)/);
        if (match) {
            self.postMessage({ type: 'total', count: parseInt(match[1]) });
        }
    }
}

self.onmessage = async function(e) {
    const { type, wasmUrl } = e.data;

    if (type === 'load') {
        try {
            self.postMessage({ type: 'status', message: 'Loading WASM module...' });

            // Import the WASM module script (this defines createTudatModule)
            importScripts(wasmUrl);

            // The module is built with MODULARIZE=1, so we need to call the factory function
            // createTudatModule() returns a promise that resolves to the module
            if (typeof createTudatModule !== 'function') {
                throw new Error('createTudatModule not found - module may not be built correctly');
            }

            self.postMessage({ type: 'status', message: 'Initializing WASM runtime...' });

            // Initialize the module with our configuration
            wasmModule = await createTudatModule({
                print: function(text) {
                    processOutput(text);
                },
                printErr: function(text) {
                    processOutput(text);
                    // Also post as error for visibility
                    self.postMessage({ type: 'output', text: '[STDERR] ' + text });
                },
                onAbort: function(what) {
                    const msg = 'WASM Abort: ' + (what || 'unknown reason');
                    console.error(msg);
                    self.postMessage({ type: 'error', message: msg });
                }
            });

            self.postMessage({ type: 'status', message: 'WASM runtime initialized' });
            self.postMessage({ type: 'loaded' });
        } catch (error) {
            const errorMsg = error?.message || error?.toString() || String(error) || 'Unknown error';
            console.error('Worker load error:', error);
            self.postMessage({ type: 'error', message: errorMsg });
        }
    } else if (type === 'run') {
        if (!wasmModule) {
            self.postMessage({ type: 'error', message: 'WASM module not loaded' });
            return;
        }

        // Reset counters
        testCount = 0;
        passCount = 0;
        failCount = 0;

        self.postMessage({ type: 'started' });

        try {
            // Run the tests
            if (wasmModule.callMain) {
                wasmModule.callMain([]);
            } else if (wasmModule._main) {
                wasmModule._main();
            } else {
                self.postMessage({ type: 'error', message: 'No entry point found' });
                return;
            }

            // Small delay to ensure all output is flushed
            await new Promise(r => setTimeout(r, 100));

            self.postMessage({
                type: 'finished',
                total: testCount,
                passed: passCount,
                failed: failCount
            });
        } catch (error) {
            const errorMsg = error?.message || error?.toString() || String(error) || 'Unknown error';
            console.error('Worker run error:', error);
            self.postMessage({ type: 'error', message: errorMsg });
        }
    }
};
