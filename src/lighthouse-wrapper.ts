import type { Config, FlowResult, UserFlow } from 'lighthouse';

let _startFlow: typeof import('lighthouse').startFlow;

async function loadLighthouse() {
    if (!_startFlow) {
        const lighthouse = await import('lighthouse');
        _startFlow = lighthouse.startFlow;
    }
}

export async function startFlow(...args: Parameters<typeof import('lighthouse').startFlow>) {
    await loadLighthouse();
    return _startFlow(...args);
}

export type { Config, FlowResult, UserFlow };
