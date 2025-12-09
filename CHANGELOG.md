# Changelog

All notable changes to this project will be documented in this file.

## v1.1.8

### Fixed
- Fixed Puppeteer connection issue where `localhost` DNS resolution could fail on some systems ([#1](https://github.com/TheCollegeHub/playwright-lighthouse-flow/issues/1))
  - Changed default browser connection URL from `http://localhost:${port}` to `http://127.0.0.1:${port}`
  - This resolves the "Failed to fetch browser webSocket URL" error that occurred on systems with DNS resolution issues

### Added
- Added optional `browserURL` parameter to `connectToLighthouseFlow` function
  - Allows users to specify a custom browser connection URL if needed
  - Provides flexibility for advanced use cases (e.g., connecting to remote browsers)

## v.1.1.7 - Previous Release

### Features
- Lighthouse Flow Mode integration with Playwright
- Support for Navigation, Timespan, and Snapshot modes
- Authenticated flows support via custom login functions
- Automated HTML and JSON report generation
- Lighthouse score assertions with `assertLighthouseFlowResultThresholds`
- Flow comparison CLI tool (`lighthouse-compare`)