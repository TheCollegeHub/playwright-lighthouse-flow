import { test as base, BrowserContext, Page, chromium, expect } from '@playwright/test';
import getPort from 'get-port';
import path from 'path';
import os from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { Config, FlowResult, startFlow, UserFlow } from 'lighthouse';
import puppeteer from 'puppeteer';

interface LighthouseFixtures {
    authenticatedPage: Page;
    context: BrowserContext;
}

interface WorkerFixtures {
    port: number;
}

interface AuthOptions {
    login: (page: Page) => Promise<void>;
}

interface LighthouseFlowOptions {
    port: number;
    config: Config;
    route: string;
    flowName: string;
}

type Thresholds = Partial<Record<string, number>>;
  

export function createLighthouseTest(authOptions: AuthOptions) {
    return base.extend<LighthouseFixtures, WorkerFixtures>({
        port: [
            async ({}, use) => {
                const port = await getPort();
                await use(port);
            },
            { scope: 'worker' }
        ],

        context: [
            async ({ port }, use) => {
                const userDataDir = path.join(os.tmpdir(), 'pw', String(Math.random()));
                const context = await chromium.launchPersistentContext(userDataDir, {
                    args: [`--remote-debugging-port=${port}`]
                });
                await use(context);
                await context.close();
            },
            { scope: 'test' }
        ],

        authenticatedPage: [
            async ({ context, page }, use) => {
                await authOptions.login(page);
                await use(page);
            },
            { scope: 'test' }
        ]
    });
}

export const getLighthouseReportPaths = (testName: string) => {
    const timestamp = Date.now();
    const baseName = `lighthouse-${testName}-${timestamp}`;
    const reportDir = path.resolve(process.cwd(), 'lighthouse-reports');

    return {
        dir: reportDir,
        html: path.join(reportDir, `${baseName}.html`),
        json: path.join(reportDir, `${baseName}.json`)
    };
};

export const generateLighthouseReportUsingFlow = async (
    flow: UserFlow,
    paths: { dir: string; html: string; json: string }
  ) => {
    const html = await flow.generateReport();
    const flowResult = await flow.createFlowResult();
    const json = JSON.stringify(flowResult, null, 2);
  
    if (!existsSync(paths.dir)) mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.html, html);
    writeFileSync(paths.json, json);
  
    return flowResult;
  };

export async function connectToLighthouseFlow({ port, config, route, flowName }: LighthouseFlowOptions): Promise<UserFlow> {
    const browserURL = `http://localhost:${port}`;
    const pBrowser = await puppeteer.connect({ browserURL });

    const allPages = await pBrowser.pages();
    const pPage = allPages.find((page) => page.url().includes(route)) || allPages[0];

    const flow = await startFlow(pPage, {
        name: flowName,
        config
    });

    return flow;
}

export function assertLighthouseFlowResultThresholds(flowResult: FlowResult, thresholds: Thresholds) {
    for (const step of flowResult.steps) {
        const stepName = step.name || 'Unnamed step';
        console.log(`🔍 Validating Lighthouse step: "${stepName}"`);

        const categories = step.lhr.categories;

        for (const [category, threshold] of Object.entries(thresholds)) {
            if (threshold === undefined) continue;

            const categoryData = categories[category];

            if (!categoryData) {
                console.warn(`⚠️ Category "${category}" not found in step "${stepName}". Skipping.`);
                continue;
            }

            const allAuditsWeightZero = categoryData.auditRefs?.every(ref => ref.weight === 0);
            if ((categoryData.score ?? 0) === 0 && allAuditsWeightZero) {
                console.warn(`⚠️ Skipping "${category}" in step "${stepName}" — all audits have zero weight.`);
                continue;
            }

            const { score, title } = categoryData;

            expect.soft(score).not.toBeNull();

            if (score !== null) {
                const actualScore = score * 100;

                console.log(
                    actualScore >= threshold
                        ? `✅ [${stepName}] "${title}" (${category}): ${actualScore} ≥ ${threshold}`
                        : `❌ [${stepName}] "${title}" (${category}): ${actualScore} < ${threshold}`
                );

                expect.soft(actualScore, `[${stepName}] ${title} (${category})`).toBeGreaterThanOrEqual(threshold);
            }
        }
    }
}



  