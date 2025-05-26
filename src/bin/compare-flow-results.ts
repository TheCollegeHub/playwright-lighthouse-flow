#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const open = promisify(exec);

interface Audit {
    id: string;
    title: string;
    score: number | null;
    scoreDisplayMode: string;
    displayValue?: string;
    numericValue?: number;
    numericUnit?: string;
    [key: string]: any;
}
interface AuditRef {
    id: string;
    group?: string;
    acronym?: string;
    title?: string;
}
interface CategoryGroup {
    title: string;
    description?: string;
}
interface Category {
    id: string;
    title: string;
    score: number;
    auditRefs: AuditRef[];
}
interface LighthouseReport {
    lighthouseVersion: string;
    audits: Record<string, Audit>;
    categories: Record<string, Category>;
    categoryGroups?: Record<string, CategoryGroup>;
}
interface CategoryDiff {
    before: number;
    after: number;
    diff: number;
    percent: string;
    trend: string;
    title: string;
}

function compareNumbers(before: number, after: number, isScore = false) {
    const diff = after - before;
    const percent = before !== 0 ? ((diff / before) * 100).toFixed(1) : '0';
    let trend: 'better' | 'worse' | 'equal';
    if (diff === 0) trend = 'equal';
    else if (isScore ? diff > 0 : diff < 0) trend = 'better';
    else trend = 'worse';
    return { before, after, diff, percent, trend };
}

function scoreColor(score: number) {
    if (score === null || score === undefined) return '#b0b0b0';
    if (score >= 0.9) return '#0cce6b';
    if (score >= 0.5) return '#ffa400';
    return '#ff4e42';
}
function trendIcon(trend: string) {
    if (trend === 'better') return '▲'; // green up arrow
    if (trend === 'worse') return '🔻'; // red down arrow
    return '⚪'; // gray circle
}
function trendColor(trend: string) {
    if (trend === 'better') return '#0cce6b';
    if (trend === 'worse') return '#ff4e42';
    return '#b0b0b0';
}
function trendBg(trend: string) {
    if (trend === 'better') return '#e8f5e9';
    if (trend === 'worse') return '#ffebee';
    return '#f1f3f4';
}

function groupAuditRefsByGroup(auditRefs: AuditRef[]) {
    const groups: Record<string, AuditRef[]> = {};
    for (const ref of auditRefs) {
        const group = ref.group || 'Other';
        if (!groups[group]) groups[group] = [];
        groups[group].push(ref);
    }
    return groups;
}

function getFriendlyGroupName(groupId: string, lhr: LighthouseReport) {
    if (lhr.categoryGroups && lhr.categoryGroups[groupId]) {
        const title = lhr.categoryGroups[groupId].title?.trim();
        if (groupId.toLowerCase() === 'hidden' && (!title || title === '')) {
            return 'Insights';
        }
        return title || groupId;
    }
    const fallback: Record<string, string> = {
        metrics: 'Metrics',
        diagnostics: 'Diagnostics',
        hidden: 'Insights',
        Other: 'Other'
    };
    if (groupId.toLowerCase() === 'hidden') return 'Insights';
    return fallback[groupId] || groupId;
}

function renderLegend() {
    return `
  <div class="legend">
    <div class="legend-title">Legend:</div>
    <div class="legend-item">
      <span style="color:#0cce6b; font-size:1.3em;">▲</span> 
      <span>Improved</span>
    </div>
    <div class="legend-item">
      <span style="color:#ff4e42; font-size:1.3em;">🔻</span> 
      <span>Worsened</span>
    </div>
    <div class="legend-item">
      <span style="color:#b0b0b0; font-size:1.3em;">⚪</span> 
      <span>No change</span>
    </div>
  </div>`;
}

function renderCategoryHeader(categories: Category[], categoryDiffs: Record<string, CategoryDiff>) {
    return `<div class="cat-summary">
    ${categories
        .map((cat) => {
            const diff = categoryDiffs[cat.id];
            return `
      <div class="cat-summary-card" style="border-bottom:4px solid ${scoreColor(cat.score)}">
        <div class="cat-summary-title">${cat.title}</div>
        <div class="cat-summary-score" style="color:${scoreColor(cat.score)}">${(cat.score * 100).toFixed(0)}</div>
        ${diff ? `<div class="cat-summary-diff" style="color:${trendColor(diff.trend)}">${trendIcon(diff.trend)} ${diff.percent}%</div>` : ''}
      </div>
      `;
        })
        .join('')}
  </div>`;
}

function renderDiffAudit(ref: AuditRef, beforeAudit: Audit, afterAudit: Audit, diff: any) {
    if (afterAudit.score === null || afterAudit.score === 1) return '';

    let beforeDisplay =
        beforeAudit.displayValue || (typeof beforeAudit.numericValue === 'number' ? `${(beforeAudit.numericValue / 1000).toFixed(1)} s` : '');
    let afterDisplay =
        afterAudit.displayValue || (typeof afterAudit.numericValue === 'number' ? `${(afterAudit.numericValue / 1000).toFixed(1)} s` : '');

    let diffValue = '';
    let trend = diff ? diff.trend : 'equal';

    if (typeof beforeAudit.numericValue === 'number' && typeof afterAudit.numericValue === 'number') {
        const unit = afterAudit.numericUnit === 'millisecond' ? 'ms' : afterAudit.numericUnit || '';
        const rawDiff = afterAudit.numericValue - beforeAudit.numericValue;
        const sign = rawDiff > 0 ? '+' : '';

        trend = compareNumbers(beforeAudit.numericValue, afterAudit.numericValue, false).trend;
        diffValue = `<span class="audit-diff" style="color:${trendColor(trend)};">${sign}${Math.round(rawDiff)} ${unit}</span>`;
    } else if (diff) {
        diffValue = `<span class="audit-diff" style="color:${trendColor(trend)};">${diff.trend === 'equal' ? '' : `${diff.percent}%`}</span>`;
    }

    return `
    <li class="audit-li" style="background:${trendBg(trend)};">
      <span class="audit-icon" style="color:${trendColor(trend)};">${trendIcon(trend)}</span>
      <span class="audit-title">${afterAudit.title}</span>
      <span class="audit-value audit-before">${beforeDisplay}</span>
      <span class="audit-arrow">→</span>
      <span class="audit-value audit-after">${afterDisplay}</span>
      ${diffValue}
      <span class="audit-score" style="color:${scoreColor(afterAudit.score!)};">
        ${afterAudit.score !== null && afterAudit.score !== undefined ? (afterAudit.score * 100).toFixed(0) : ''}
      </span>
    </li>
  `;
}

function renderCategory(
    category: Category,
    lhrBefore: LighthouseReport,
    lhrAfter: LighthouseReport,
    auditDiffs: Record<string, any>,
    categoryDiffs: Record<string, CategoryDiff>
) {
    const color = scoreColor(category.score);
    const catDiff = categoryDiffs[category.id];
    const groups = groupAuditRefsByGroup(category.auditRefs);

    const groupHtml = Object.entries(groups)
        .map(([groupId, refs]) => {
            const failedRefs = refs.filter((ref) => {
                const afterAudit = lhrAfter.audits[ref.id];
                return afterAudit && afterAudit.score !== null && afterAudit.score < 1;
            });
            if (!failedRefs.length) return '';

            const auditsListHtml = `
      <ul class="audit-list">
        <li class="audit-li audit-header">
          <span class="audit-icon"></span>
          <span class="audit-title">Audit</span>
          <span class="audit-value audit-before">Before Value</span>
          <span class="audit-arrow"></span>
          <span class="audit-value audit-after">After Value</span>
          <span class="audit-diff">Difference (%)</span>
          <span class="audit-score">Score</span>
        </li>
        ${failedRefs
            .map((ref) => {
                const beforeAudit = lhrBefore.audits[ref.id];
                const afterAudit = lhrAfter.audits[ref.id];
                const diff = auditDiffs[ref.id];
                if (!beforeAudit || !afterAudit) return '';
                return renderDiffAudit(ref, beforeAudit, afterAudit, diff);
            })
            .join('')}
      </ul>
    `;

            return `
      <div class="audit-section">
        <h3>${getFriendlyGroupName(groupId, lhrAfter)} <span class="count">(${failedRefs.length})</span></h3>
        ${auditsListHtml}
      </div>
    `;
        })
        .join('');

    if (!groupHtml.trim()) return '';

    return `
  <section class="category" style="border-left: 12px solid ${color}; margin-bottom: 2rem;">
    <h2>
      ${category.title}
      <span class="cat-score" style="color:${color}; margin-left: 1em;">${(category.score * 100).toFixed(0)}</span>
      ${
          catDiff
              ? `<span class="cat-score-diff" style="color:${trendColor(catDiff.trend)};margin-left:1em;">
        ${trendIcon(catDiff.trend)} ${catDiff.percent}%
      </span>`
              : ''
      }
    </h2>
    ${groupHtml}
  </section>
  `;
}

function generateStepHTML(
    stepName: string,
    lhrBefore: LighthouseReport,
    lhrAfter: LighthouseReport,
    auditDiffs: Record<string, any>,
    categoryDiffs: Record<string, CategoryDiff>
) {
    const categories = Object.values(lhrAfter.categories);
    const catsWithProblems = categories.filter((cat) => {
        const groups = groupAuditRefsByGroup(cat.auditRefs);
        return Object.values(groups).some((refs) =>
            refs.some((ref) => {
                const afterAudit = lhrAfter.audits[ref.id];
                return afterAudit && afterAudit.score !== null && afterAudit.score < 1;
            })
        );
    });
    return `
  <html>
  <head>
    <title>${stepName} - Problem Audits</title>
    <meta charset="utf-8"/>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
      body { font-family: 'Roboto', Arial, sans-serif; background: #f5f7fa; color: #202124; margin: 0; padding: 2rem;}
      h1 { font-weight: 400; margin-bottom: 1.5rem; }
      .cat-summary { display: flex; gap: 1.5rem; margin-bottom: 2rem; }
      .cat-summary-card { background: #fff; border-radius: 8px 8px 0 0; box-shadow: 0 1px 3px rgb(60 64 67 / 0.13); padding: 1rem 1.5rem; min-width: 140px; flex: 1 1 140px; display: flex; flex-direction: column; align-items: center; border-bottom: 4px solid #0cce6b;}
      .cat-summary-title { font-size: 1.1rem; font-weight: 500; margin-bottom: 0.5rem;}
      .cat-summary-score { font-size: 1.5rem; font-weight: bold;}
      .cat-summary-diff { font-size: 1.05rem; margin-top: 0.2em;}
      .category { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgb(60 64 67 / 0.13); margin-bottom: 2.5rem; padding: 1.2rem 2rem 1.2rem 1.5rem;}
      .category h2 { font-size: 1.3rem; font-weight: 600; margin-bottom: 0.8rem; display: flex; align-items: center; gap: 1.2em;}
      .cat-score { font-size: 1.3em; font-weight: bold;}
      .cat-score-diff { font-size: 1.1em; font-weight: bold;}
      .audit-section { margin-bottom: 1.2em;}
      .audit-section h3 { font-size: 1.05em; margin-bottom: 0.3em; margin-top: 0.7em; color: #174ea6; }
      .timeline-link { display: inline-block; margin-bottom: 2em;}
      .audit-list { list-style:none; padding-left:0; margin-top:0.2em; }
      .audit-li { display: flex; align-items: center; gap: 0.7em; padding: 0.3em 0.7em; border-radius: 4px; margin: 0.2em 0; }
      .audit-header { font-weight: bold; background: #e8eaed; border-bottom: 1px solid #ccc; }
      .audit-icon { width: 2em; text-align: center; }
      .audit-title { flex: 1 1 auto; }
      .audit-value { min-width: 7em; text-align: right; display: inline-block; }
      .audit-before { }
      .audit-after { }
      .audit-arrow { width: 2em; text-align: center; }
      .audit-diff { min-width: 6em; text-align: right; display: inline-block; font-weight: bold; }
      .audit-score { min-width: 4em; text-align: right; margin-left: 1em; font-weight: bold; }
      .legend { display: flex; align-items: center; background: #fff; padding: 1em; border-radius: 8px; margin-bottom: 1em; box-shadow: 0 1px 3px rgb(60 64 67 / 0.13); }
      .legend-title { font-weight: bold; margin-right: 1em; }
      .legend-item { display: flex; align-items: center; margin-right: 2em; }
      .legend-item span { margin-right: 0.5em; }
    </style>
  </head>
  <body>
    <a href="index.html" class="timeline-link">&larr; Back to Summary</a>
    <h1>${stepName} — Problem audits only (score &lt; 100)</h1>
    ${renderLegend()}
    ${renderCategoryHeader(categories, categoryDiffs)}
    ${catsWithProblems.map((cat) => renderCategory(cat, lhrBefore, lhrAfter, auditDiffs, categoryDiffs)).join('')}
  </body>
  </html>
  `;
}

function generateTimelineHTML(steps: { name: string; categoryDiffs: Record<string, CategoryDiff> }[]) {
    const allCategories = Array.from(new Set(steps.flatMap((step) => Object.keys(step.categoryDiffs))));
    const headerRow = [
        `<th style="min-width:120px;">Step</th>`,
        ...allCategories.map((cat) => `<th>${steps[0].categoryDiffs[cat]?.title || cat}</th>`)
    ].join('');
    const rows = steps
        .map(
            (step, i) => `<tr>
      <td style="text-align:center;">
        <a href="step-${i + 1}.html" class="step-link"><span class="step-number">${i + 1}</span> ${step.name || `Step ${i}`}</a>
      </td>
      ${allCategories
          .map((cat) => {
              const val = step.categoryDiffs[cat];
              if (!val) return `<td>-</td>`;
              const before = (val.before * 100).toFixed(0);
              const after = (val.after * 100).toFixed(0);
              const diff = val.percent;
              const icon = trendIcon(val.trend);
              const color = trendColor(val.trend);
              const bg = scoreColor(val.after);
              return `<td style="text-align:center; vertical-align:middle;">
          <a href="step-${i}.html" class="cat-cell" style="border-left: 8px solid ${bg};">
            <span style="color:${scoreColor(val.before)}">${before}</span>
            <span style="font-size:1.2em;vertical-align:middle;">→</span>
            <span style="color:${scoreColor(val.after)}">${after}</span>
            <br>
            <span style="color:${color};font-weight:bold;">${icon} ${diff}%</span>
          </a>
        </td>`;
          })
          .join('')}
    </tr>`
        )
        .join('\n');

    return `
  <html>
  <head>
    <title>Lighthouse Comparison Summary</title>
    <meta charset="utf-8"/>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
      body { font-family: 'Roboto', Arial, sans-serif; background: #f5f7fa; color: #202124; padding: 2rem; }
      h1 { font-weight: 400; }
      table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgb(60 64 67 / 0.13); }
      th, td { padding: 1rem; border-bottom: 1px solid #e0e0e0; text-align: center; }
      th { background: #f8fafc; }
      a { color: #1a73e8; text-decoration: none; }
      a:hover { text-decoration: underline; }
      tr:last-child td { border-bottom: none; }
      .cat-cell {
        display: inline-block;
        background: #f8fafc;
        border-radius: 6px;
        padding: 0.5em 0.7em;
        margin: 0.1em 0;
        text-decoration: none;
        transition: box-shadow 0.2s;
        min-width: 70px;
      }
      .cat-cell:hover {
        box-shadow: 0 0 0 3px #e0e0e0;
        background: #f1f3f4;
      }
      .step-link {
        display: inline-block;
        background: #fff;
        border-radius: 50px;
        padding: 0.5em 1em;
        border: 2px solid #1a73e8;
        color: #1a73e8;
        font-weight: bold;
        transition: background 0.2s, color 0.2s;
      }
      .step-link:hover {
        background: #1a73e8;
        color: #fff;
      }
      .step-number {
        display: inline-block;
        font-weight: bold;
        background: #1a73e8;
        color: #fff;
        border-radius: 50%;
        width: 1.6em;
        height: 1.6em;
        line-height: 1.6em;
        text-align: center;
        margin-right: 0.5em;
        font-size: 1.1em;
      }
      .legend {
        display: flex;
        align-items: center;
        background: #fff;
        padding: 1em;
        border-radius: 8px;
        margin-bottom: 1em;
        box-shadow: 0 1px 3px rgb(60 64 67 / 0.13);
      }
      .legend-title {
        font-weight: bold;
        margin-right: 1em;
      }
      .legend-item {
        display: flex;
        align-items: center;
        margin-right: 2em;
      }
      .legend-item span {
        margin-right: 0.5em;
      }
    </style>
  </head>
  <body>
    <h1>Lighthouse Comparison Summary</h1>
    ${renderLegend()}
    <table>
      <thead>
        <tr>${headerRow}</tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="color:#5f6368">Click on a step to see problem audits only.</p>
  </body>
  </html>
  `;
}

async function main() {
    const [, , beforePath, afterPath] = process.argv;
    if (!beforePath || !afterPath) {
        console.error('❌ Usage: lighthouse-compare <before.json> <after.json>');
        process.exit(1);
    }

    const before = JSON.parse(fs.readFileSync(beforePath, 'utf-8'));
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf-8'));

    const beforeSteps = before.steps || [{ lhr: before.lhr || before }];
    const afterSteps = after.steps || [{ lhr: after.lhr || after }];

    const steps: { name: string; categoryDiffs: Record<string, CategoryDiff> }[] = [];
    const baseDir = path.resolve('lighthouse-reports');
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    const outDir = path.join(baseDir, `lh-diff-${Date.now()}`);
    fs.mkdirSync(outDir);

    for (let i = 0; i < Math.min(beforeSteps.length, afterSteps.length); i++) {
        const beforeLhr = beforeSteps[i].lhr;
        const afterLhr = afterSteps[i].lhr;
        const audits = Object.keys(afterLhr.audits);
        const auditDiffs: Record<string, any> = {};
        audits.forEach((id) => {
            const before = beforeLhr.audits[id]?.score ?? null;
            const after = afterLhr.audits[id]?.score ?? null;
            if (before != null && after != null) {
                auditDiffs[id] = { ...compareNumbers(before, after), id };
                if (typeof beforeLhr.audits[id].numericValue === 'number' && typeof afterLhr.audits[id].numericValue === 'number') {
                    const numB = beforeLhr.audits[id].numericValue;
                    const numA = afterLhr.audits[id].numericValue;
                    const diffNum = numA - numB;
                    const percentNum = numB !== 0 ? ((diffNum / numB) * 100).toFixed(1) : '0';
                    const trendNum = diffNum === 0 ? 'equal' : diffNum < 0 ? 'better' : 'worse'; // For metrics: lower is better!
                    auditDiffs[id].numeric = { before: numB, after: numA, diff: diffNum, percent: percentNum, trend: trendNum };
                }
            }
        });

        const categoryDiffs: Record<string, CategoryDiff> = {};
        Object.keys(afterLhr.categories).forEach((catId) => {
            const cat = afterLhr.categories[catId];
            const beforeScore = beforeLhr.categories[catId]?.score ?? null;
            if (beforeScore !== null && cat.score !== null) {
                categoryDiffs[catId] = {
                    ...compareNumbers(beforeScore, cat.score, true), // true for score!
                    title: cat.title
                };
            }
        });

        steps.push({ name: afterSteps[i].name || `Step ${i + 1}`, categoryDiffs });
        const stepPage = i + 1;
        const html = generateStepHTML(`Step ${stepPage}: ${afterSteps[i].name || ''}`, beforeLhr, afterLhr, auditDiffs, categoryDiffs);
        fs.writeFileSync(path.join(outDir, `step-${stepPage}.html`), html, 'utf-8');
    }

    fs.writeFileSync(path.join(outDir, 'index.html'), generateTimelineHTML(steps), 'utf-8');

    try {
        const indexPath = path.join(outDir, 'index.html');
        if (process.platform === 'darwin') await open(`open "${indexPath}"`);
        else if (process.platform === 'win32') await open(`start "" "${indexPath}"`);
        else await open(`xdg-open "${indexPath}"`);
    } catch (exception) {
        console.warn('⚠️ Could not open report automatically.');
    }

    console.log(`✅ Report generated at: ${outDir}/index.html`);
}

main().catch((err) => {
  console.error('❌ Error to compare lighouse flow results:', err);
  process.exit(1);
});
