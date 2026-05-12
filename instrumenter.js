/**
 * Instrumenter.js
 * Uses Babel Standalone to inject tracers into user code.
 */

function instrumentCode(code) {
    const babel = window.Babel || (typeof Babel !== 'undefined' ? Babel : null);
    if (!babel) {
        throw new Error('Babel Standalone not loaded. Please wait a moment for the CDN to load or check your internet connection.');
    }
    try {
        const result = babel.transform(code, {
            plugins: [
                function({ types: t }) {
                    return {
                        visitor: {
                            VariableDeclaration: {
                                exit(path) {
                                    if (path.node._instrumented) return;
                                    if (path.parentPath.isBlockStatement() || path.parentPath.isProgram()) {
                                        const traces = path.node.declarations.map(decl => {
                                            if (t.isIdentifier(decl.id)) {
                                                return createTraceCall(t, path.node.loc?.start.line, `Assign ${decl.id.name}`);
                                            }
                                            return null;
                                        }).filter(Boolean);
                                        if (traces.length > 0) {
                                            path.node._instrumented = true;
                                            path.insertAfter(traces);
                                        }
                                    }
                                }
                            },
                            AssignmentExpression: {
                                exit(path) {
                                    if (path.node._instrumented) return;
                                    if (path.parentPath.isExpressionStatement()) {
                                        const line = path.node.loc?.start.line;
                                        const name = t.isIdentifier(path.node.left) ? path.node.left.name : 'expression';
                                        path.node._instrumented = true;
                                        path.parentPath.insertAfter(createTraceCall(t, line, `Update ${name}`));
                                    }
                                }
                            },
                            CallExpression: {
                                exit(path) {
                                    if (path.node._instrumented) return;
                                    if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'trace') return;
                                    if (path.parentPath.isExpressionStatement()) {
                                        const line = path.node.loc?.start.line;
                                        const name = t.isIdentifier(path.node.callee) ? path.node.callee.name : 'function';
                                        path.node._instrumented = true;
                                        path.parentPath.insertAfter(createTraceCall(t, line, `Call ${name}`));
                                    }
                                }
                            },
                            FunctionDeclaration: {
                                exit(path) {
                                    if (path.node._instrumented) return;
                                    const line = path.node.loc?.start.line;
                                    const name = path.node.id.name;
                                    path.node._instrumented = true;
                                    path.get('body').unshiftContainer('body', createTraceCall(t, line, `Enter ${name}`));
                                }
                            },
                            ReturnStatement: {
                                exit(path) {
                                    if (path.node._instrumented) return;
                                    const line = path.node.loc?.start.line;
                                    path.node._instrumented = true;
                                    path.insertBefore(createTraceCall(t, line, `Returning`));
                                }
                            }
                        }
                    };
                }
            ]
        });

        // Add the trace function definition to the start
        const tracerHeader = `
            const snapshots = [];
            function trace(line, action) {
                // Capture stack
                const err = new Error();
                const stack = err.stack.split('\\n').slice(2).map(s => s.trim());
                
                // Capture visible scope (Simplified for this project)
                // In a real impl, we'd use Proxy or walk the scope.
                // Here we'll rely on the worker to manage the state map.
                
                self.postMessage({
                    type: 'SNAPSHOT',
                    snapshot: {
                        line,
                        action,
                        timestamp: Date.now()
                    }
                });
            }
        `;

        return tracerHeader + result.code;
    } catch (err) {
        console.error("Instrumentation failed:", err);
        throw err;
    }
}

function createTraceCall(t, line, action) {
    return t.expressionStatement(
        t.callExpression(t.identifier('trace'), [
            t.numericLiteral(line || 0),
            t.stringLiteral(action || '')
        ])
    );
}
