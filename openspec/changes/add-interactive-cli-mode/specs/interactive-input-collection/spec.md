# Spec: Interactive Input Collection

## Overview

The interactive input collection system guides users through providing all necessary inputs for cloning a C# project using prompts with validation and smart defaults.

## Requirements

### Functional Requirements

#### FR1: Mode Detection
- **MUST** detect whether to run in CLI or interactive mode based on presence of command-line arguments
- **MUST** use CLI mode when any positional arguments are provided
- **MUST** use interactive mode when no arguments are provided
- **MAY** support `--interactive` flag to force interactive mode even with some args present

#### FR2: Source Path Collection
- **MUST** prompt user for source directory path
- **MUST** validate that path exists before proceeding
- **MUST** validate that path is a directory
- **MUST** validate that directory contains at least one `.sln` file
- **MUST** display clear error message if validation fails
- **MUST** allow user to retry input on validation failure
- **SHOULD** support tab completion for filesystem paths (if terminal supports it)

#### FR3: Solution Information Detection
- **MUST** automatically detect solution file name from source directory
- **MUST** parse solution file to count projects
- **SHOULD** attempt to detect namespace from solution name or first project file
- **MUST** display detected information to user for confirmation
- **MUST** handle multiple `.sln` files by using the first found or prompting user to choose

#### FR4: Namespace Collection
- **MUST** prompt for old namespace with detected value as default
- **MUST** allow user to override detected namespace if incorrect
- **MUST** prompt for new namespace with no default
- **MUST** validate both namespaces using shared validation logic
- **MUST** ensure new namespace is different from old namespace
- **MUST** display validation errors inline immediately

#### FR5: Target Path Collection
- **MUST** prompt for target directory path
- **SHOULD** suggest default based on new namespace (e.g., `./NewNamespace`)
- **MUST** validate that parent directory exists or can be created
- **MUST** check if target directory exists and is not empty
- **MUST** prompt for force overwrite confirmation if target is not empty
- **MUST** support both relative and absolute paths

#### FR6: Options Collection
- **MUST** prompt user to select clone mode (full copy or template)
- **MUST** display clear description of what each mode does
- **MUST** show information about what template mode will remove:
  - *Logic folders in BLL projects
  - *Repository.cs files in DAL projects
  - Related dependency injection registrations
- **MUST** collect force overwrite preference when needed

#### FR7: Summary Display
- **MUST** display a formatted summary of all collected inputs before proceeding
- **MUST** include in summary:
  - Source path
  - Target path
  - Old namespace
  - New namespace
  - Old solution name
  - New solution name
  - Number of projects to be cloned
  - Clone mode (full/template)
  - Force overwrite status
- **SHOULD** use box-drawing characters for clear visual presentation

#### FR8: Final Confirmation
- **MUST** prompt user to confirm before starting clone operation
- **MUST** default to "Yes" to proceed
- **MUST** exit gracefully without changes if user declines
- **MUST** pass collected options to CSharpProjectCloner if confirmed

#### FR9: User Cancellation
- **MUST** handle Ctrl+C gracefully at any prompt
- **MUST** display cancellation message before exiting
- **MUST** exit with appropriate status code (e.g., 130 for SIGINT)
- **MUST NOT** leave partial state or files

#### FR10: Error Handling
- **MUST** catch and display errors from prompt library
- **MUST** provide helpful error messages with suggested corrections
- **SHOULD** suggest common fixes for typical errors
- **MUST** maintain same cleanup behavior as CLI mode if cloning fails

### Non-Functional Requirements

#### NFR1: Performance
- Interactive mode initialization **MUST** complete in <500ms
- Each prompt validation **MUST** respond in <100ms
- Solution detection **MUST** complete in <1s for typical projects
- **SHOULD** lazy-load @inquirer/prompts to avoid impact on CLI mode

#### NFR2: Usability
- All prompts **MUST** have clear, concise question text
- Validation errors **MUST** be specific and actionable
- Defaults **SHOULD** be smart and contextually appropriate
- Visual formatting **SHOULD** improve readability
- **MUST** work in standard terminal environments (no special UI requirements)

#### NFR3: Backward Compatibility
- CLI mode behavior **MUST** remain unchanged
- Existing scripts using CLI arguments **MUST** work without modification
- **MUST NOT** introduce breaking changes to CloneOptions interface
- **MUST NOT** modify CSharpProjectCloner class behavior

#### NFR4: Maintainability
- Validation logic **MUST** be shared between CLI and interactive modes
- Prompt functions **SHOULD** be modular and independently testable
- Error messages **SHOULD** be consistent across modes
- Code **SHOULD** follow existing project conventions

## User Stories

### Story 1: First-Time User
**As a** developer new to the cloner tool  
**I want** to be guided through the cloning process step-by-step  
**So that** I don't have to read documentation or remember argument syntax

**Acceptance Criteria:**
- ✓ Running `bun cloner.ts` without args starts interactive mode
- ✓ Each step explains what input is needed
- ✓ Invalid inputs show helpful error messages
- ✓ Can complete clone without consulting help text

### Story 2: Quick Clone
**As an** experienced user doing a quick clone  
**I want** smart defaults based on auto-detection  
**So that** I can clone with minimal typing

**Acceptance Criteria:**
- ✓ Solution name and namespace detected automatically
- ✓ Reasonable target path suggested
- ✓ Can accept defaults by pressing Enter
- ✓ Faster than typing full CLI command

### Story 3: Template Creation
**As a** developer creating a project template  
**I want** to understand what template mode will remove  
**So that** I can make an informed decision

**Acceptance Criteria:**
- ✓ Template mode option clearly described
- ✓ Preview shown of what will be purged
- ✓ Can see summary before confirmation
- ✓ Clear what's preserved vs. removed

### Story 4: Automation User
**As a** developer with automated scripts  
**I want** CLI mode to work exactly as before  
**So that** my existing automation doesn't break

**Acceptance Criteria:**
- ✓ Providing args bypasses interactive mode
- ✓ All existing CLI patterns work unchanged
- ✓ No new required arguments
- ✓ Same exit codes and error messages

### Story 5: Error Recovery
**As a** user who made a typo  
**I want** to correct my mistake immediately  
**So that** I don't have to restart the entire process

**Acceptance Criteria:**
- ✓ Invalid input shows error and reprompts
- ✓ Don't lose previously entered valid inputs
- ✓ Can cancel with Ctrl+C at any time
- ✓ Clear indication of what went wrong

## Edge Cases

### EC1: Multiple Solution Files
**Scenario:** Source directory contains multiple `.sln` files  
**Behavior:** Use first found alphabetically OR prompt user to select  
**Validation:** Must handle gracefully, no crashes

### EC2: Namespace Detection Fails
**Scenario:** Cannot detect namespace from solution or projects  
**Behavior:** Prompt user with no default, explain why detection failed  
**Validation:** Must not block user from proceeding

### EC3: Target Exists and Empty
**Scenario:** Target directory exists but is empty  
**Behavior:** Proceed without force prompt (empty is OK to use)  
**Validation:** Should not warn about empty directories

### EC4: Invalid Characters in Path
**Scenario:** User enters path with wildcards or invalid characters  
**Behavior:** Validation error with specific message about invalid characters  
**Validation:** Must sanitize or reject before filesystem operations

### EC5: Relative vs Absolute Paths
**Scenario:** User provides relative path (e.g., `../other-project`)  
**Behavior:** Resolve to absolute path, display absolute path in summary  
**Validation:** Must handle both path types correctly

### EC6: Network Paths (Windows)
**Scenario:** User provides UNC path (e.g., `\\server\share\project`)  
**Behavior:** Should work if path is accessible  
**Validation:** Must handle network paths same as local paths

### EC7: Long Path Names
**Scenario:** Generated path exceeds Windows MAX_PATH (260 chars)  
**Behavior:** Show error explaining path length limit  
**Validation:** Should detect and warn before attempting operations

### EC8: Insufficient Permissions
**Scenario:** User cannot write to target directory  
**Behavior:** Show clear permission error, suggest solutions  
**Validation:** Should detect early if possible

## Dependencies

### External Dependencies
- `@inquirer/prompts`: Required for interactive prompts
  - Version: ^9.0.0 or later (modular architecture)
  - Specific imports: `input`, `select`, `confirm`

### Internal Dependencies
- Existing validation logic in `CSharpProjectCloner`
- File system utilities from Node.js (`fs`, `path`)
- Existing solution parsing logic

## Testing Requirements

### Unit Tests
- [ ] `detectMode()` with various argv combinations
- [ ] Each validation function with valid and invalid inputs
- [ ] `detectSolutionInfo()` with mock file structures
- [ ] Namespace format validation edge cases
- [ ] Path validation for relative/absolute/network paths

### Integration Tests
- [ ] End-to-end interactive flow with mocked stdin
- [ ] CLI mode still produces correct CloneOptions
- [ ] Interactive mode produces identical CloneOptions as CLI for same inputs
- [ ] Error handling at each prompt stage
- [ ] Cancellation (Ctrl+C) at each stage

### Manual Test Cases
1. **Happy Path**: Valid source, clean target, accept defaults
2. **Override Defaults**: Change all auto-detected values
3. **Template Mode**: Select template, verify purge info shown
4. **Force Overwrite**: Target exists, confirm overwrite
5. **Validation Errors**: Try invalid paths, namespaces, etc.
6. **Cancellation**: Ctrl+C at various stages
7. **Multi-SLN**: Source with multiple solution files
8. **No Detection**: Source where namespace detection fails
9. **CLI Backward Compat**: All existing CLI patterns
10. **Edge Paths**: Network paths, long paths, special characters

## Success Metrics

- **Usability**: User can complete clone in <2 minutes (vs. 3+ for CLI with docs)
- **Error Rate**: <5% failed clones due to invalid inputs (down from ~15% in CLI)
- **Adoption**: 60%+ of users choose interactive over CLI after 1 week
- **Backward Compat**: 0 reported breaks in existing automation
- **Support Load**: 30% reduction in "how do I use this" questions

## Future Enhancements (Out of Scope)

- Back button to edit previous answers
- History/favorites list
- Dry-run mode with diff preview
- Save/load configuration profiles
- Multi-project batch cloning
- Progress bars during long operations
- Custom validation rules configuration
