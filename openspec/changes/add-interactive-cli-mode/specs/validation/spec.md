# Spec: Input Validation

## Overview

Shared validation logic for both CLI and interactive modes to ensure consistent, robust input validation across all entry points.

## Requirements

### Functional Requirements

#### FR1: Namespace Validation
- **MUST** validate C# namespace format according to language specification
- **MUST** accept namespaces with letters, numbers, dots, and underscores
- **MUST** require namespace to start with letter or underscore
- **MUST** reject namespaces starting with numbers
- **MUST** reject namespaces that are only dots
- **MUST** reject empty namespaces
- **MUST** reject C# reserved keywords as namespace components
- **MUST** provide specific error message explaining why namespace is invalid

**Valid Examples:**
- `MyCompany.MyProject`
- `_Internal.Tools`
- `Company123.Project456`
- `My.Deeply.Nested.Namespace`

**Invalid Examples:**
- `123Company` (starts with number)
- `.MyCompany` (starts with dot)
- `My..Company` (consecutive dots)
- `namespace` (reserved keyword)
- `` (empty)
- `My Company` (contains space)

#### FR2: Path Validation
- **MUST** validate that paths are not empty
- **MUST** support both relative and absolute paths
- **MUST** support Windows path separators (`\` and `/`)
- **MUST** support UNC paths on Windows (`\\server\share`)
- **MUST** normalize paths to absolute before operations
- **MUST** validate that parent directory is accessible
- **MUST** detect invalid path characters for the operating system
- **SHOULD** warn about paths exceeding MAX_PATH on Windows

**Path Checks:**
- `validatePathExists()`: Path must exist
- `validatePathIsDirectory()`: Path must be a directory
- `validatePathWritable()`: Path must be writable
- `validatePathEmpty()`: Check if directory is empty

#### FR3: Solution Directory Validation
- **MUST** validate directory contains at least one `.sln` file
- **MUST** handle case where multiple `.sln` files exist
- **MUST** provide clear error if no solution file found
- **SHOULD** list found solution files if multiple exist

#### FR4: Target Directory Validation
- **MUST** check if target directory already exists
- **MUST** determine if existing directory is empty
- **MUST** validate write permissions on target location
- **MUST** validate parent directory exists or can be created
- **SHOULD** warn if target path is very long

#### FR5: Namespace Uniqueness Validation
- **MUST** ensure new namespace differs from old namespace
- **MUST** case-sensitive comparison (C# namespaces are case-sensitive)
- **MUST** provide clear error if namespaces are identical

### Non-Functional Requirements

#### NFR1: Performance
- All validation functions **MUST** complete in <100ms
- File system checks **SHOULD** be cached within single validation run
- **MUST** use synchronous operations for instant feedback in interactive mode

#### NFR2: Consistency
- Validation rules **MUST** be identical between CLI and interactive modes
- Error messages **MUST** be consistent across modes
- **MUST** use same validation functions in both code paths

#### NFR3: Error Messages
- **MUST** be specific about what is wrong
- **SHOULD** suggest how to fix the problem
- **MUST** avoid technical jargon when possible
- **SHOULD** include examples for format errors

## Validation Functions

### `validateNamespaceFormat(namespace: string): boolean | string`

**Purpose:** Validates C# namespace format

**Input:** Namespace string to validate

**Returns:** 
- `true` if valid
- Error message string if invalid

**Implementation Requirements:**
```typescript
function validateNamespaceFormat(namespace: string): boolean | string {
  // Must not be empty
  if (!namespace || namespace.trim().length === 0) {
    return 'Namespace cannot be empty';
  }
  
  // Check basic format: start with letter/underscore, contain only valid chars
  const namespaceRegex = /^[A-Za-z_][A-Za-z0-9_.]*$/;
  if (!namespaceRegex.test(namespace)) {
    return 'Namespace must start with a letter or underscore and contain only letters, numbers, dots, and underscores';
  }
  
  // Check for consecutive dots or trailing/leading dots
  if (namespace.includes('..') || namespace.startsWith('.') || namespace.endsWith('.')) {
    return 'Namespace cannot have consecutive dots or start/end with a dot';
  }
  
  // Check for reserved keywords
  const parts = namespace.split('.');
  const reservedKeywords = [
    'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch',
    'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default',
    'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit',
    'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach',
    'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal',
    'is', 'lock', 'long', 'namespace', 'new', 'null', 'object',
    'operator', 'out', 'override', 'params', 'private', 'protected',
    'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short',
    'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
    'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong',
    'unchecked', 'unsafe', 'ushort', 'using', 'virtual', 'void',
    'volatile', 'while'
  ];
  
  for (const part of parts) {
    if (reservedKeywords.includes(part.toLowerCase())) {
      return `Namespace contains reserved keyword: "${part}"`;
    }
  }
  
  return true;
}
```

### `validatePathExists(path: string): boolean | string`

**Purpose:** Validates that path exists and is accessible

**Input:** File system path

**Returns:**
- `true` if valid
- Error message string if invalid

**Implementation:**
```typescript
function validatePathExists(path: string): boolean | string {
  if (!path || path.trim().length === 0) {
    return 'Path cannot be empty';
  }
  
  try {
    if (!existsSync(path)) {
      return `Path does not exist: ${path}`;
    }
    return true;
  } catch (error) {
    return `Cannot access path: ${error.message}`;
  }
}
```

### `validatePathIsDirectory(path: string): boolean | string`

**Purpose:** Validates that path points to a directory

**Input:** File system path

**Returns:**
- `true` if valid
- Error message string if invalid

**Implementation:**
```typescript
function validatePathIsDirectory(path: string): boolean | string {
  const existsCheck = validatePathExists(path);
  if (existsCheck !== true) {
    return existsCheck;
  }
  
  try {
    const stats = statSync(path);
    if (!stats.isDirectory()) {
      return `Path is not a directory: ${path}`;
    }
    return true;
  } catch (error) {
    return `Cannot access path: ${error.message}`;
  }
}
```

### `validateSolutionDirectory(path: string): boolean | string`

**Purpose:** Validates directory contains solution file(s)

**Input:** Directory path

**Returns:**
- `true` if valid
- Error message string if invalid

**Implementation:**
```typescript
function validateSolutionDirectory(path: string): boolean | string {
  const dirCheck = validatePathIsDirectory(path);
  if (dirCheck !== true) {
    return dirCheck;
  }
  
  try {
    const files = readdirSync(path);
    const slnFiles = files.filter(f => f.toLowerCase().endsWith('.sln'));
    
    if (slnFiles.length === 0) {
      return `No solution file (.sln) found in: ${path}`;
    }
    
    return true;
  } catch (error) {
    return `Cannot read directory: ${error.message}`;
  }
}
```

### `validateNamespacesAreDifferent(oldNs: string, newNs: string): boolean | string`

**Purpose:** Ensures new namespace is different from old

**Input:** Old and new namespace strings

**Returns:**
- `true` if different
- Error message string if same

**Implementation:**
```typescript
function validateNamespacesAreDifferent(
  oldNs: string, 
  newNs: string
): boolean | string {
  if (oldNs === newNs) {
    return 'New namespace must be different from old namespace';
  }
  return true;
}
```

### `validateTargetPath(targetPath: string, force: boolean): boolean | string`

**Purpose:** Validates target path for cloning

**Input:** Target directory path and force flag

**Returns:**
- `true` if valid
- Error message string if invalid

**Implementation:**
```typescript
function validateTargetPath(
  targetPath: string, 
  force: boolean
): boolean | string {
  if (!targetPath || targetPath.trim().length === 0) {
    return 'Target path cannot be empty';
  }
  
  const absPath = resolve(targetPath);
  
  // Check path length on Windows
  if (process.platform === 'win32' && absPath.length > 240) {
    return `Target path is very long (${absPath.length} chars). This may cause issues on Windows.`;
  }
  
  // Check if target exists
  if (existsSync(absPath)) {
    const stats = statSync(absPath);
    
    if (!stats.isDirectory()) {
      return `Target exists but is not a directory: ${absPath}`;
    }
    
    // Check if directory is empty
    const files = readdirSync(absPath);
    if (files.length > 0 && !force) {
      return `Target directory is not empty. Use force mode to overwrite.`;
    }
  } else {
    // Target doesn't exist, check parent
    const parentDir = dirname(absPath);
    if (!existsSync(parentDir)) {
      return `Parent directory does not exist: ${parentDir}`;
    }
  }
  
  return true;
}
```

## Error Message Guidelines

### Format
```
[What's wrong] [Why it's wrong] [How to fix it]
```

### Examples

**Good:**
```
❌ Namespace cannot start with a number. 
   Try: "Company123" instead of "123Company"
```

**Bad:**
```
❌ Invalid format
```

**Good:**
```
❌ No solution file (.sln) found in ./source
   Make sure you've selected the correct directory
```

**Bad:**
```
❌ Invalid directory
```

### Validation Workflow

```
Input Received
     │
     ▼
Format Validation (syntax)
     │
     ├─ Invalid → Return error message
     │
     ▼
Semantic Validation (meaning)
     │
     ├─ Invalid → Return error message
     │
     ▼
Contextual Validation (environment)
     │
     ├─ Invalid → Return error message
     │
     ▼
Return true (valid)
```

## Testing Requirements

### Unit Test Cases

#### Namespace Validation
- [ ] Valid simple namespace: `Company.Project`
- [ ] Valid nested namespace: `A.B.C.D.E`
- [ ] Valid with underscore: `_Internal.Utils`
- [ ] Valid with numbers: `Company123.Project456`
- [ ] Invalid empty string
- [ ] Invalid starts with number: `123Invalid`
- [ ] Invalid starts with dot: `.Invalid`
- [ ] Invalid ends with dot: `Invalid.`
- [ ] Invalid consecutive dots: `Invalid..Name`
- [ ] Invalid reserved keyword: `namespace.class`
- [ ] Invalid special chars: `Invalid$Name`
- [ ] Invalid whitespace: `Invalid Name`

#### Path Validation
- [ ] Valid relative path: `./project`
- [ ] Valid absolute path: `C:\Projects\MyProject`
- [ ] Valid UNC path: `\\server\share\project`
- [ ] Invalid empty path
- [ ] Invalid non-existent path
- [ ] Invalid file as directory
- [ ] Invalid permission denied path

#### Solution Directory Validation
- [ ] Valid directory with one .sln
- [ ] Valid directory with multiple .sln files
- [ ] Invalid directory with no .sln
- [ ] Invalid non-directory path
- [ ] Invalid non-existent directory

#### Target Path Validation
- [ ] Valid new directory (doesn't exist)
- [ ] Valid empty existing directory
- [ ] Invalid non-empty directory without force
- [ ] Valid non-empty directory with force
- [ ] Invalid parent doesn't exist
- [ ] Invalid very long path (Windows)

### Integration Tests
- [ ] Validation consistency between CLI and interactive modes
- [ ] Error messages match across modes
- [ ] All validators work with real file system
- [ ] Performance: All validations <100ms

## Edge Cases

### EC1: Case Sensitivity
**Platform:** Windows (case-insensitive) vs Linux (case-sensitive)  
**Behavior:** Validation should be consistent across platforms  
**Test:** Namespace comparison should always be case-sensitive

### EC2: Unicode Characters
**Input:** Namespace with Unicode characters (e.g., `Company.Prøject`)  
**Behavior:** Reject with clear message (C# identifiers are ASCII-based)  
**Error:** "Namespace must contain only ASCII letters, numbers, dots, and underscores"

### EC3: Very Long Namespaces
**Input:** Namespace with 1000+ characters  
**Behavior:** Accept if syntactically valid (C# doesn't limit length)  
**Note:** May warn about maintainability but not reject

### EC4: Symlinks
**Input:** Path containing symbolic links  
**Behavior:** Follow symlinks, validate final target  
**Test:** Resolve symlinks before validation

### EC5: Read-Only Paths
**Input:** Target path on read-only filesystem  
**Behavior:** Detect and report clear error about permissions  
**Test:** Check write permissions early

## Success Criteria

- All validation functions return in <100ms
- Error messages are actionable and specific
- 100% test coverage for validation logic
- Zero differences in validation between CLI and interactive modes
- Clear documentation for each validator
