# Design: Interactive CLI Mode

## Architecture Overview

The design maintains the existing `CSharpProjectCloner` class as the core engine while adding a new interactive layer that sits between user input and the cloner.

```
┌─────────────────────────────────────────────────────┐
│                    cloner.ts                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  main()                                             │
│    │                                                │
│    ├──► detectMode()                                │
│    │      └─► args.length > 0 ? 'cli' : 'interactive'│
│    │                                                │
│    ├──► CLI Mode Path                               │
│    │      └─► parseCliArgs()                        │
│    │            └─► CloneOptions                    │
│    │                                                │
│    └──► Interactive Mode Path                       │
│         └─► collectInteractiveInputs()              │
│               ├─► promptSourcePath()                │
│               ├─► detectSolutionInfo()              │
│               ├─► promptNamespaces()                │
│               ├─► promptTargetPath()                │
│               ├─► promptOptions()                   │
│               ├─► showSummary()                     │
│               └─► confirmProceed()                  │
│                     └─► CloneOptions                │
│                                                     │
│  CSharpProjectCloner                                │
│    └─► clone(options: CloneOptions)                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Module Structure

### New Functions

#### `detectMode(): 'cli' | 'interactive'`
Determines which mode to run based on command-line arguments.

```typescript
function detectMode(): 'cli' | 'interactive' {
  const args = process.argv.slice(2);
  
  // If --help or any positional args, use CLI mode
  if (args.length > 0 && !args.includes('--interactive')) {
    return 'cli';
  }
  
  return 'interactive';
}
```

#### `collectInteractiveInputs(): Promise<CloneOptions>`
Main orchestrator for interactive mode. Calls individual prompt functions in sequence.

**Flow:**
1. Welcome message
2. Prompt for source path → validate exists + has .sln
3. Auto-detect solution name and namespace
4. Prompt for new namespace → validate format
5. Prompt for target path → validate/warn
6. Prompt for clone mode (full/template)
7. Prompt for force overwrite if needed
8. Display summary
9. Confirm to proceed
10. Return CloneOptions

#### `promptSourcePath(): Promise<string>`
Prompts for source directory path with validation.

**Validation:**
- Path must exist
- Must be a directory
- Must contain at least one `.sln` file

**Returns:** Absolute path to source directory

#### `detectSolutionInfo(sourcePath: string): SolutionInfo`
Scans source directory for solution file and extracts metadata.

**Returns:**
```typescript
interface SolutionInfo {
  solutionName: string;
  solutionPath: string;
  detectedNamespace: string | null;
  projectCount: number;
}
```

**Logic:**
1. Find `.sln` file in source directory
2. Parse solution to count projects
3. Attempt to detect namespace from first `.csproj` or solution name
4. Return metadata for display and defaults

#### `promptNamespaces(defaultOld: string): Promise<{old: string, new: string}>`
Prompts for old and new namespaces with validation.

**Old Namespace:**
- Pre-filled with detected value
- Allow override if detection was wrong
- Validate: non-empty, valid C# namespace format

**New Namespace:**
- No default (must be unique)
- Validate: 
  - Valid C# namespace format (`/^[A-Za-z_][A-Za-z0-9_.]*$/`)
  - Different from old namespace
  - No reserved C# keywords

#### `promptTargetPath(suggestedDefault: string): Promise<string>`
Prompts for target directory path.

**Default:** `./[new-namespace]` or `./[new-solution-name]`

**Validation:**
- Parent directory must exist or be creatable
- If target exists and not empty → prompt for confirmation
- Return absolute path

#### `promptOptions(): Promise<{template: boolean, force: boolean}>`
Prompts for additional options.

**Template Mode:**
- Select prompt: "Clone mode?"
  - "Full copy (preserve all business logic)"
  - "Template (remove business logic for clean start)"
- If template selected → show info about what gets purged

**Force Mode:**
- Only prompted if target directory exists and is not empty
- Confirm prompt: "Target directory is not empty. Overwrite?"

#### `showSummary(options: CloneOptions): void`
Displays a formatted summary of all choices before execution.

```
┌─────────────────────────────────────────┐
│ 📋 CLONE SUMMARY                        │
├─────────────────────────────────────────┤
│ Source:     ./SSG1-BION-NAS-Platform    │
│ Target:     ./MyNewProject              │
│ Namespace:  Bion.NAS → MyCompany        │
│ Solution:   Bion.NAS → MyCompany        │
│ Projects:   12 will be cloned           │
│ Mode:       Template (logic removed)    │
│ Force:      Yes (overwrite enabled)     │
└─────────────────────────────────────────┘
```

#### `confirmProceed(): Promise<boolean>`
Final confirmation before cloning starts.

Simple yes/no prompt. Returns true to proceed, false to cancel.

### Modified Functions

#### `main()`
Updated to support mode detection and routing.

**Before:**
```typescript
async function main() {
  const args = process.argv.slice(2);
  // Parse args immediately
  // ...
}
```

**After:**
```typescript
async function main() {
  const mode = detectMode();
  
  let options: CloneOptions;
  
  if (mode === 'cli') {
    options = parseCliArgs();
  } else {
    options = await collectInteractiveInputs();
  }
  
  const cloner = new CSharpProjectCloner(options);
  await cloner.clone();
}
```

### Validation Utilities

Shared validation functions used by both CLI and interactive modes.

#### `validateNamespaceFormat(namespace: string): boolean | string`
Checks if string is a valid C# namespace.

**Rules:**
- Must start with letter or underscore
- Can contain letters, numbers, dots, underscores
- Cannot be empty
- Cannot be only dots
- No reserved keywords (namespace, class, using, etc.)

**Returns:** `true` if valid, error message string if invalid

#### `validatePathExists(path: string): boolean | string`
Checks if path exists and is accessible.

**Returns:** `true` if valid, error message if invalid

#### `validateSolutionDirectory(path: string): boolean | string`
Checks if directory contains a solution file.

**Returns:** `true` if valid, error message if no .sln found

## Interactive Flow Details

### Step 1: Source Path
```
? Enter source directory path: _______

Validation (on submit):
  ✓ Path exists
  ✓ Is directory  
  ✓ Contains .sln file

If valid:
  → Auto-detect solution info
  → Continue to Step 2
  
If invalid:
  → Show error inline
  → Allow retry
```

### Step 2: Namespace Detection & Input
```
✓ Found solution: Bion.NAS.Platform.sln
  Projects: 12 detected
  Namespace: Bion.NAS.Platform (detected)

? Old namespace: Bion.NAS.Platform

? New namespace: _______

Validation:
  ✓ Valid C# format
  ✓ Different from old
  ✓ Not a reserved keyword
```

### Step 3: Target & Options
```
? Target directory path: ./MyCompany.MyProject
  (suggested from new namespace)

? Clone mode:
  ❯ Full copy (preserve all business logic)
    Template (remove business logic)

[If target exists and not empty]
⚠ Warning: Target directory exists and is not empty
? Overwrite existing files? (y/N)
```

### Step 4: Summary & Confirmation
```
┌─────────────────────────────────────────┐
│ 📋 CLONE SUMMARY                        │
├─────────────────────────────────────────┤
│ Source:     ./SSG1-BION-NAS-Platform    │
│ Target:     ./MyCompany.MyProject       │
│ Namespace:  Bion.NAS.Platform           │
│          → MyCompany.MyProject          │
│ Solution:   Bion.NAS.Platform           │
│          → MyCompany.MyProject          │
│ Projects:   12 will be cloned           │
│ Mode:       Template                    │
│                                         │
│ Template mode will remove:              │
│  • *Logic folders in BLL projects       │
│  • *Repository.cs in DAL projects       │
│  • Related DI registrations             │
└─────────────────────────────────────────┘

? Proceed with clone? (Y/n)
```

### Step 5: Execution
```
🚀 Cloning in progress...

✓ Parsed solution file
✓ Copied solution root files
✓ Copying projects... (12/12)
✓ Applying template changes...
✓ Created new solution file
✓ Running dotnet restore...

✅ Project cloning completed successfully!
📁 New project location: ./MyCompany.MyProject
```

## Error Handling

### Interactive Mode Errors

**User Cancellation:**
- User presses Ctrl+C → Graceful exit with message
- User answers "No" to final confirmation → Exit without changes

**Validation Errors:**
- Show inline with prompt
- Allow user to correct immediately
- No need to restart entire flow

**Execution Errors:**
- Same cleanup logic as CLI mode
- Display error clearly
- Suggest corrective actions where possible

### Backward Compatibility

**CLI Mode:**
- Zero changes to error handling
- All existing error messages preserved
- All existing behavior unchanged

## Dependencies

### @inquirer/prompts

Using modular imports to minimize bundle size:

```typescript
import input from '@inquirer/input';
import select from '@inquirer/select';
import confirm from '@inquirer/confirm';
```

**Prompt Types Used:**

1. **input** - Text input for paths and namespaces
   - Supports default values
   - Inline validation with custom validators
   
2. **select** - Choose from options for clone mode
   - Radio button style selection
   - Clear descriptions for each option
   
3. **confirm** - Yes/no for force overwrite and final confirmation
   - Clear default (Y/n or y/N)
   - Enter to accept default

## Testing Considerations

### Unit Tests
- `validateNamespaceFormat()` with various inputs
- `detectSolutionInfo()` with mock file systems
- Mode detection logic

### Integration Tests
- CLI mode still works with all argument combinations
- Interactive mode can be automated with stdin mocking
- Both modes produce identical CloneOptions for same inputs

### Manual Testing Scenarios
1. Happy path: Source exists, valid inputs, clean target
2. Target exists: Test force overwrite flow
3. Invalid namespace: Test validation errors
4. Missing .sln: Test error handling
5. User cancellation: Test graceful exit
6. Template mode: Verify correct purging
7. CLI backward compat: Test all existing use cases

## Performance Considerations

- **Synchronous validation**: Path checks are sync (existsSync) to provide instant feedback
- **Lazy loading**: @inquirer only imported in interactive mode
- **No caching**: Solution detection done once, results cached in memory
- **Minimal overhead**: Interactive mode adds <100ms startup time

## Future Extensibility

### Easy Additions
- Progress bars during long operations (using @inquirer/spinner)
- History/recent projects list
- Custom validation rules per project
- Export/import configuration

### Architecture Supports
- Multiple input sources (interactive, CLI, config file, API)
- Plugin-based validators
- Custom prompt themes
- Multi-step workflows with back navigation

## Security Considerations

- All paths normalized and validated before use
- No shell injection risk (using Node APIs, not shell commands)
- User input sanitized before regex operations
- No external network calls in interactive flow
