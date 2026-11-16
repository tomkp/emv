# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- CLI card commands (`info`, `select-pse`, `select-app`, `list-apps`, `read-record`, `get-data`, `verify-pin`, `dump`, `shell`) now run against the inserted card. Previously they always failed with "EMV application not available".
- `performTransaction()` sends GET PROCESSING OPTIONS with the selected application's PDOL filled in, and Generate AC with the card's CDOL1 (tag 8C). `pdolValues` and `cdolValues` are now applied.
- Application discovery lists every application in a PSE record, and falls back to the PPSE for contactless cards.
- PC/SC errors (no PC/SC service, a card that can't be connected to) are reported instead of crashing the interactive UI and `emv wait`.
- The interactive explorer sends GET PROCESSING OPTIONS with the PDOL filled in, reads records from the AFL, and reports a failed application selection.
- Status words are shown as four hex digits (`6700`, not `670`).
- The unpredictable number (9F37) comes from `crypto.randomBytes`.

### Added

- `countryCode` option for `performTransaction()`, `buildDefaultPdolData()` and `buildDefaultCdolData()`, for the terminal country code (9F1A). It defaults to the currency code, so set it for EUR and other currencies shared by several countries.
- `buildDefaultCdolData(entries, options)` builds CDOL data in the order of the card's CDOL1.
- `EmvApplication.initiateApplicationProcessing()` and `getSelectedFci()`.
- `discoverApplications()` results include the directory `source` and the PSE `records`.

### Changed

- Amounts must be whole numbers of minor units from 0 to 999999999999; others throw a `RangeError` instead of being encoded incorrectly.

## [2.0.0] - 2024-12

### Added

- Full CLI for interacting with EMV cards via command line
- Commands: `readers`, `wait`, `info`, `select-pse`, `select-app`, `list-apps`, `read-record`, `get-data`, `verify-pin`, `dump`, `shell`
- Interactive shell mode for exploratory card interaction
- JSON output format support (`--format json`)
- `findTagInBuffer()` function for Buffer-based TLV tag lookup
- `readPseApplications()` helper for reading PSE applications
- PIN verification command and CLI support
- Comprehensive documentation in README

### Changed

- `smartcard` is now a direct dependency (not peer dependency)
- Simplified installation: `npm install emv` (no need to install smartcard separately)

### Fixed

- Removed duplicate `findTag` implementation
- Consolidated CardResponse type definition

## [1.x.x] - Previous Releases

### Added

- Core `EmvApplication` class for EMV card interaction
- APDU commands: SELECT, READ RECORD, GET DATA, VERIFY PIN, GET PROCESSING OPTIONS, GENERATE AC, INTERNAL AUTHENTICATE
- TLV parsing and formatting utilities
- EMV tag dictionary with 125+ standard tags
- TypeScript support with strict type checking
