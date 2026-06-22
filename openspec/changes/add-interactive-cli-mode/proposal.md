# Proposal: Add Interactive CLI Mode to C# Project Cloner

## Overview

Transform the C# Project Cloner from a pure command-line tool into a dual-mode application that supports both traditional CLI arguments and an interactive guided mode with validation and smart defaults.

## Problem Statement

The current cloner requires users to remember exact argument positions and provides no validation until execution. This creates friction:

- **Cognitive Load**: 4-6 positional arguments with specific order requirements
- **Error-Prone**: No validation until execution begins, potentially wasting time
- **No Discovery**: Users can't explore options or get guidance on what values are valid
- **Poor UX**: Long command lines are hard to read and prone to typos
- **No Preview**: Users can't review their choices before cloning starts

## Proposed Solution

Add an interactive mode that activates when the tool is run without arguments, while preserving full backward compatibility with the existing CLI interface.

### User Experience

**Current (CLI only)**:
```bash
bun cloner.ts ./source ./target Old.Namespace New.Namespace OldSolution NewSolution --force --template
```

**Proposed (Interactive)**:
```bash
bun cloner.ts
# Launches interactive wizard with:
# - Smart defaults based on auto-detection
# - Inline validation
# - Progress feedback
# - Confirmation preview
```

**Backward Compatible**:
```bash
# CLI mode still works exactly as before
bun cloner.ts ./source ./target Old.Namespace New.Namespace
```

## Goals

1. **Usability**: Make the tool approachable for new users and faster for experienced users
2. **Validation**: Catch errors early with inline validation at each step
3. **Discovery**: Help users understand what options are available and what they mean
4. **Backward Compatibility**: Preserve existing CLI interface for scripting/automation
5. **Smart Defaults**: Auto-detect values from the source project where possible

## Non-Goals

- Full TUI with menus and complex navigation (keeping it simple)
- Configuration files or saved presets (out of scope for now)
- GUI or web interface
- Changes to core cloning logic (only adding the interactive wrapper)

## Success Criteria

1. Interactive mode successfully collects all required inputs with validation
2. CLI mode continues to work without any changes
3. Interactive mode provides better error messages than CLI mode
4. Users can complete a clone faster with interactive mode (subjective, but measured by fewer failed attempts)
5. Zero breaking changes to existing functionality

## Implementation Phases

### Phase 1: Foundation
- Add @inquirer/prompts dependency
- Refactor main() to detect mode (args present = CLI, no args = interactive)
- Create basic interactive flow structure

### Phase 2: Interactive Prompts
- Source path prompt with validation
- Auto-detection of solution and namespace
- Target path prompt with smart defaults
- Clone mode selection (full vs template)
- Confirmation summary

### Phase 3: Enhanced Experience
- Progress indicators during cloning
- Better error messages with recovery suggestions
- Validation helpers (namespace format, path checks, etc.)

## Technical Approach

### Architecture

```
┌─────────────────────────────────────┐
│          main()                     │
│  ┌──────────────────────────────┐   │
│  │  Mode Detection              │   │
│  │  • args.length > 0 → CLI     │   │
│  │  • args.length = 0 → Interactive│ │
│  └────────┬──────────┬──────────┘   │
│           │          │               │
│           ▼          ▼               │
│    ┌──────────┐  ┌──────────────┐   │
│    │ CLI      │  │ Interactive  │   │
│    │ Parser   │  │ Collector    │   │
│    └────┬─────┘  └──────┬───────┘   │
│         │               │            │
│         └───────┬───────┘            │
│                 ▼                    │
│         ┌───────────────┐            │
│         │ CloneOptions  │            │
│         └───────┬───────┘            │
│                 ▼                    │
│    ┌────────────────────────────┐   │
│    │ CSharpProjectCloner        │   │
│    │ (unchanged business logic) │   │
│    └────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Key Components

1. **Mode Detector**: Examines process.argv to determine which mode to use
2. **Interactive Collector**: New module using @inquirer/prompts to gather inputs
3. **Validators**: Reusable validation functions for paths, namespaces, etc.
4. **CLI Parser**: Existing argument parser (unchanged)
5. **CSharpProjectCloner**: Core logic (unchanged)

## Dependencies

- **@inquirer/prompts** (v9+): Modular, well-maintained, TypeScript-native
  - Only import needed prompt types (input, select, confirm)
  - Tree-shakeable for minimal bundle size
  - Native ESM support works with Bun

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking CLI backward compatibility | High | Extensive testing of CLI mode, explicit mode detection logic |
| Dependency bloat | Low | Use modular @inquirer imports, only what's needed |
| Inconsistent validation between modes | Medium | Share validation functions between CLI and interactive modes |
| Poor error handling in prompts | Medium | Wrap all prompts in try-catch, provide graceful fallbacks |

## Open Questions

1. Should we add a `--interactive` flag to force interactive mode even with some args present?
2. Should interactive mode support editing/going back to previous prompts?
3. Should we add a "dry run" mode to preview without executing?
4. Should validation be identical in both modes, or can interactive mode be stricter?

## Future Enhancements (Out of Scope)

- Configuration file support (.clonerrc)
- Recent projects list
- Project templates/presets
- Web-based UI
- Multi-project batch cloning
