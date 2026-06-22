# Tasks: Add Interactive CLI Mode

## Overview

Implementation tasks for adding interactive CLI mode to the C# Project Cloner, organized by priority and dependencies.

## Phase 1: Foundation (Dependencies: None)

### Task 1.1: Add @inquirer/prompts Dependency
**Priority:** High  
**Estimated Time:** 15 minutes  
**Dependencies:** None

**Description:**
Install and configure the @inquirer/prompts package for interactive CLI prompts.

**Acceptance Criteria:**
- [ ] Run `bun add @inquirer/prompts`
- [ ] Verify installation in package.json
- [ ] Test basic import in a scratch file
- [ ] Remove scratch file after verification

**Files Changed:**
- `package.json`
- `bun.lock`

---

### Task 1.2: Extract Validation Functions
**Priority:** High  
**Estimated Time:** 1 hour  
**Dependencies:** None

**Description:**
Extract existing validation logic into standalone, reusable functions that can be shared between CLI and interactive modes.

**Acceptance Criteria:**
- [ ] Create validation utility functions:
  - `validateNamespaceFormat()`
  - `validatePathExists()`
  - `validatePathIsDirectory()`
  - `validateSolutionDirectory()`
  - `validateNamespacesAreDifferent()`
  - `validateTargetPath()`
- [ ] Each function returns `boolean | string` (true or error message)
- [ ] Add TypeScript JSDoc comments for each function
- [ ] All validation follows spec requirements

**Files Changed:**
- `cloner.ts` (add validation functions section)

**Testing:**
- Unit tests for each validator with valid/invalid cases

---

### Task 1.3: Implement Mode Detection
**Priority:** High  
**Estimated Time:** 30 minutes  
**Dependencies:** None

**Description:**
Create a function to detect whether to run in CLI or interactive mode based on command-line arguments.

**Acceptance Criteria:**
- [ ] Implement `detectMode()` function
- [ ] Returns `'cli'` when args present (excluding --help)
- [ ] Returns `'interactive'` when no args present
- [ ] Optional: Support `--interactive` flag to force interactive mode
- [ ] Add unit tests

**Files Changed:**
- `cloner.ts` (add detectMode function)

**Testing:**
- Test with various argv combinations
- Test --help doesn't trigger interactive
- Test empty args triggers interactive

---

## Phase 2: Interactive Input Collection (Dependencies: Phase 1)

### Task 2.1: Implement Source Path Prompt
**Priority:** High  
**Estimated Time:** 45 minutes  
**Dependencies:** 1.1, 1.2

**Description:**
Create interactive prompt for collecting and validating source directory path.

**Acceptance Criteria:**
- [ ] Implement `promptSourcePath()` function
- [ ] Use @inquirer/input with validation
- [ ] Validate path exists, is directory, contains .sln
- [ ] Show clear error messages inline
- [ ] Allow retry on validation failure
- [ ] Return absolute path

**Files Changed:**
- `cloner.ts` (add promptSourcePath function)

**Testing:**
- Test with valid directory containing .sln
- Test with non-existent path
- Test with file instead of directory
- Test with directory missing .sln

---

### Task 2.2: Implement Solution Detection
**Priority:** High  
**Estimated Time:** 1 hour  
**Dependencies:** 1.2, 2.1

**Description:**
Create function to detect solution information from source directory.

**Acceptance Criteria:**
- [ ] Implement `detectSolutionInfo()` function
- [ ] Find .sln file in source directory
- [ ] Parse solution to count projects (reuse existing logic)
- [ ] Attempt namespace detection from solution name or first .csproj
- [ ] Return SolutionInfo interface
- [ ] Handle multiple .sln files (use first found)
- [ ] Display detected info to console

**Files Changed:**
- `cloner.ts` (add detectSolutionInfo function and SolutionInfo interface)

**Testing:**
- Test with single .sln file
- Test with multiple .sln files
- Test namespace detection success/failure

---

### Task 2.3: Implement Namespace Prompts
**Priority:** High  
**Estimated Time:** 45 minutes  
**Dependencies:** 1.1, 1.2, 2.2

**Description:**
Create interactive prompts for collecting old and new namespaces with validation.

**Acceptance Criteria:**
- [ ] Implement `promptNamespaces()` function
- [ ] Prompt for old namespace with detected default
- [ ] Prompt for new namespace (no default)
- [ ] Validate both using shared validators
- [ ] Ensure namespaces are different
- [ ] Show validation errors inline
- [ ] Return `{old: string, new: string}`

**Files Changed:**
- `cloner.ts` (add promptNamespaces function)

**Testing:**
- Test accepting default old namespace
- Test overriding default
- Test invalid namespace formats
- Test identical namespaces
- Test reserved keywords

---

### Task 2.4: Implement Target Path Prompt
**Priority:** High  
**Estimated Time:** 45 minutes  
**Dependencies:** 1.1, 1.2, 2.3

**Description:**
Create interactive prompt for target directory path with smart defaults.

**Acceptance Criteria:**
- [ ] Implement `promptTargetPath()` function
- [ ] Suggest default based on new namespace
- [ ] Validate parent directory exists
- [ ] Check if target exists and is empty
- [ ] Handle target validation
- [ ] Return absolute path

**Files Changed:**
- `cloner.ts` (add promptTargetPath function)

**Testing:**
- Test with non-existent target (happy path)
- Test with empty existing directory
- Test with non-empty directory
- Test with invalid parent directory

---

### Task 2.5: Implement Options Prompts
**Priority:** High  
**Estimated Time:** 45 minutes  
**Dependencies:** 1.1, 2.4

**Description:**
Create prompts for clone mode and force overwrite options.

**Acceptance Criteria:**
- [ ] Implement `promptOptions()` function
- [ ] Use @inquirer/select for clone mode
- [ ] Options: "Full copy" and "Template"
- [ ] Show description of template mode purging
- [ ] Use @inquirer/confirm for force overwrite (if needed)
- [ ] Only prompt for force if target exists and not empty
- [ ] Return `{template: boolean, force: boolean}`

**Files Changed:**
- `cloner.ts` (add promptOptions function)

**Testing:**
- Test template mode selection
- Test full copy selection
- Test force prompt appears when needed
- Test force prompt skipped when not needed

---

### Task 2.6: Implement Summary Display
**Priority:** Medium  
**Estimated Time:** 30 minutes  
**Dependencies:** 2.5

**Description:**
Create function to display formatted summary of all collected inputs.

**Acceptance Criteria:**
- [ ] Implement `showSummary()` function
- [ ] Display all CloneOptions in formatted box
- [ ] Include source, target, namespaces, solution names, project count
- [ ] Show clone mode and force status
- [ ] Use box-drawing characters for visual appeal
- [ ] Show template purging info if applicable

**Files Changed:**
- `cloner.ts` (add showSummary function)

**Testing:**
- Manual verification of output formatting
- Test with template mode vs full copy
- Test with force vs no force

---

### Task 2.7: Implement Final Confirmation
**Priority:** High  
**Estimated Time:** 15 minutes  
**Dependencies:** 2.6

**Description:**
Create final confirmation prompt before starting clone operation.

**Acceptance Criteria:**
- [ ] Implement `confirmProceed()` function
- [ ] Use @inquirer/confirm
- [ ] Default to "Yes"
- [ ] Return boolean
- [ ] Clear prompt text

**Files Changed:**
- `cloner.ts` (add confirmProceed function)

**Testing:**
- Test accepting confirmation
- Test declining confirmation
- Test default behavior (Enter key)

---

### Task 2.8: Implement Interactive Collector Orchestrator
**Priority:** High  
**Estimated Time:** 1 hour  
**Dependencies:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7

**Description:**
Create main orchestrator function that calls all prompt functions in sequence and assembles CloneOptions.

**Acceptance Criteria:**
- [ ] Implement `collectInteractiveInputs()` async function
- [ ] Call prompts in correct order:
  1. Welcome message
  2. Source path
  3. Solution detection
  4. Namespaces
  5. Target path
  6. Options
  7. Summary
  8. Confirmation
- [ ] Assemble CloneOptions from collected inputs
- [ ] Handle cancellation gracefully (Ctrl+C)
- [ ] Return CloneOptions if confirmed, exit if declined
- [ ] Add try-catch for prompt errors

**Files Changed:**
- `cloner.ts` (add collectInteractiveInputs function)

**Testing:**
- End-to-end test with all prompts
- Test cancellation at various stages
- Test produces correct CloneOptions

---

## Phase 3: Integration (Dependencies: Phase 2)

### Task 3.1: Refactor main() Function
**Priority:** High  
**Estimated Time:** 45 minutes  
**Dependencies:** 1.3, 2.8

**Description:**
Update main() to support both CLI and interactive modes based on mode detection.

**Acceptance Criteria:**
- [ ] Detect mode at start of main()
- [ ] Route to CLI parser if mode is 'cli'
- [ ] Route to interactive collector if mode is 'interactive'
- [ ] Both paths produce CloneOptions
- [ ] Pass options to CSharpProjectCloner (unchanged)
- [ ] Preserve existing CLI error handling
- [ ] Add interactive mode error handling

**Files Changed:**
- `cloner.ts` (refactor main function)

**Testing:**
- Test CLI mode with various argument combinations
- Test interactive mode (manual)
- Verify CLI mode unchanged
- Test error handling in both modes

---

### Task 3.2: Update Help Text
**Priority:** Low  
**Estimated Time:** 15 minutes  
**Dependencies:** 3.1

**Description:**
Update --help text to mention interactive mode.

**Acceptance Criteria:**
- [ ] Add note about interactive mode to help text
- [ ] Explain how to trigger interactive (no args)
- [ ] Mention CLI mode still fully supported
- [ ] Keep existing CLI documentation

**Files Changed:**
- `cloner.ts` (update help text in main)

**Testing:**
- Verify `bun cloner.ts --help` shows updated text

---

### Task 3.3: Add Error Recovery Messages
**Priority:** Medium  
**Estimated Time:** 30 minutes  
**Dependencies:** 3.1

**Description:**
Enhance error messages throughout with recovery suggestions.

**Acceptance Criteria:**
- [ ] Add helpful suggestions to common errors
- [ ] Format error messages consistently
- [ ] Include examples where helpful
- [ ] Test with common error scenarios

**Files Changed:**
- `cloner.ts` (enhance error messages)

**Testing:**
- Trigger various errors and verify messages
- Verify suggestions are actionable

---

## Phase 4: Polish & Testing (Dependencies: Phase 3)

### Task 4.1: Add Unit Tests
**Priority:** High  
**Estimated Time:** 2 hours  
**Dependencies:** All previous tasks

**Description:**
Create comprehensive unit tests for all new functions.

**Acceptance Criteria:**
- [ ] Test detectMode() with various inputs
- [ ] Test all validation functions
- [ ] Test detectSolutionInfo() with mocked fs
- [ ] Test namespace validation edge cases
- [ ] Test path validation edge cases
- [ ] Achieve >80% code coverage for new code

**Files Created:**
- `cloner.test.ts` (new file)

**Testing:**
- Run `bun test` and verify all pass

---

### Task 4.2: Integration Testing
**Priority:** High  
**Estimated Time:** 1.5 hours  
**Dependencies:** 3.1, 4.1

**Description:**
Perform end-to-end testing of both CLI and interactive modes.

**Acceptance Criteria:**
- [ ] Test CLI backward compatibility (all existing patterns)
- [ ] Test interactive mode happy path
- [ ] Test interactive validation at each step
- [ ] Test cancellation handling
- [ ] Test error scenarios
- [ ] Verify both modes produce identical results

**Testing Checklist:**
- [ ] CLI: All existing argument patterns work
- [ ] CLI: Error messages unchanged
- [ ] Interactive: Complete flow with valid inputs
- [ ] Interactive: Validation errors at each step
- [ ] Interactive: Ctrl+C cancellation
- [ ] Interactive: Decline final confirmation
- [ ] Both: Identical CloneOptions for same inputs
- [ ] Both: Template mode works correctly
- [ ] Both: Force mode works correctly

---

### Task 4.3: Documentation Updates
**Priority:** Medium  
**Estimated Time:** 30 minutes  
**Dependencies:** 3.2

**Description:**
Update README and inline code comments.

**Acceptance Criteria:**
- [ ] Update README.md with interactive mode info
- [ ] Add examples of interactive mode usage
- [ ] Document new validation functions
- [ ] Add JSDoc comments to all new functions
- [ ] Update troubleshooting section if needed

**Files Changed:**
- `README.md`
- `cloner.ts` (add/improve comments)

---

### Task 4.4: Performance Optimization
**Priority:** Low  
**Estimated Time:** 1 hour  
**Dependencies:** 4.2

**Description:**
Optimize interactive mode for quick response times.

**Acceptance Criteria:**
- [ ] Lazy load @inquirer only in interactive mode
- [ ] Ensure validation functions < 100ms
- [ ] Optimize solution detection if needed
- [ ] Measure and document startup time
- [ ] No performance impact on CLI mode

**Files Changed:**
- `cloner.ts` (optimization tweaks)

**Testing:**
- Benchmark interactive mode startup
- Benchmark validation response times
- Verify CLI mode unaffected

---

## Summary

**Total Estimated Time:** 14-16 hours

**Task Breakdown:**
- Phase 1 (Foundation): 2.25 hours
- Phase 2 (Interactive): 6.25 hours
- Phase 3 (Integration): 1.5 hours
- Phase 4 (Polish): 5 hours

**Critical Path:**
1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8 → 3.1 → 4.2

**Can Work in Parallel:**
- 1.3 (Mode detection) can be done independently
- 3.2, 3.3 (Help & errors) after 3.1
- 4.1 (Unit tests) alongside implementation
- 4.3, 4.4 (Docs & optimization) after main work

**Risk Areas:**
- Validation consistency between modes (Task 1.2, 4.2)
- Backward compatibility (Task 3.1, 4.2)
- Error handling in prompts (Task 2.8, 3.1)

**Success Metrics:**
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Zero breaking changes to CLI mode
- [ ] Interactive mode startup < 500ms
- [ ] Validation response < 100ms
- [ ] Code coverage > 80% for new code
