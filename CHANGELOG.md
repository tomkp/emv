# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
