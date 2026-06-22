# C# Project Cloner

A powerful CLI tool for cloning and transforming C# .NET solutions with namespace and project name replacements. Supports both interactive guided mode and traditional CLI mode.

## Features

- 🎯 **Dual Mode Operation**: Interactive wizard or traditional CLI
- 🔍 **Auto-Detection**: Automatically detects solution files and namespaces
- ✅ **Input Validation**: Real-time validation with helpful error messages
- 🎨 **Namespace Transformation**: Replace namespaces throughout the entire solution
- 📦 **Project Renaming**: Automatically renames projects and updates references
- 🧹 **Template Mode**: Remove business logic to create clean project templates
- 🛡️ **Backward Compatible**: Existing CLI scripts continue to work unchanged

## Installation

```bash
bun install
```

## Usage

### Interactive Mode (Recommended)

Simply run the tool without arguments to start the interactive wizard:

```bash
bun cloner.ts
```

The interactive mode will guide you through:
1. **Source Path**: Select the source C# project directory
2. **Auto-Detection**: Automatically detect solution and namespace information
3. **Namespace Configuration**: Set old and new namespaces with validation
4. **Target Path**: Choose where to create the cloned project
5. **Options**: Select clone mode (full or template) and force overwrite if needed
6. **Summary**: Review all settings before proceeding
7. **Confirmation**: Final confirmation before cloning begins

#### Interactive Mode Benefits

- **Beginner-Friendly**: No need to remember command syntax
- **Smart Defaults**: Suggests sensible defaults based on detection
- **Inline Validation**: Catch errors immediately with helpful messages
- **Preview**: See a summary of all changes before execution
- **Guided Experience**: Step-by-step prompts with descriptions

### CLI Mode (For Automation)

Use command-line arguments for scripting and automation:

```bash
bun cloner.ts <source-path> <target-path> <old-namespace> <new-namespace> [old-solution-name] [new-solution-name] [--force] [--template]
```

#### CLI Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `source-path` | Yes | Path to the source C# project directory |
| `target-path` | Yes | Path where the new project will be created |
| `old-namespace` | Yes | Current namespace (e.g., "Bion.NAS.Platform") |
| `new-namespace` | Yes | New namespace (e.g., "MyCompany.MyProject") |
| `old-solution-name` | No | Current solution name (default: auto-detect) |
| `new-solution-name` | No | New solution name (default: based on new namespace) |

#### CLI Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite target directory if it exists and is not empty |
| `--template` | Clone as a template (removes business logic) |
| `--interactive` | Force interactive mode even with arguments present |
| `--help` | Show help message |

### Examples

#### Interactive Mode

```bash
# Start interactive wizard
bun cloner.ts
```

#### CLI Mode - Basic Clone

```bash
# Clone with namespace transformation
bun cloner.ts ./SSG1-BION-NAS-Platform ./MyNewProject Bion.NAS.Platform MyCompany.MyProject
```

#### CLI Mode - Template Creation

```bash
# Create a clean template without business logic
bun cloner.ts ./SSG1-BION-NAS-Platform ./MyTemplate Bion.NAS.Platform MyCompany.Template --template
```

#### CLI Mode - Force Overwrite

```bash
# Overwrite existing target directory
bun cloner.ts ./SourceProject ./ExistingTarget Old.Namespace New.Namespace --force
```

#### CLI Mode - Full Options

```bash
# Complete example with all options
bun cloner.ts ./SourceProject ./NewProject Old.Namespace New.Namespace OldSolution NewSolution --force --template
```

## Template Mode

When using `--template` flag or selecting "Template" in interactive mode, the tool will:

- ✂️ **Remove `*Logic` folders** in BLL (Business Logic Layer) projects
- ✂️ **Remove `*Repository.cs` files** in DAL (Data Access Layer) projects
- ✂️ **Comment out DI registrations** for removed types in Startup.cs/Program.cs
- ✅ **Preserve infrastructure** code, interfaces, and base classes

This creates a clean starting point for new projects while maintaining the architectural structure.

## What Gets Transformed

The cloner automatically transforms:

- ✅ **Namespace declarations** in all `.cs` files
- ✅ **Using statements** importing the old namespace
- ✅ **Project names** and `.csproj` files
- ✅ **Project references** in `.csproj` files
- ✅ **Solution file** (`.sln`) with updated project names and paths
- ✅ **Configuration files** (`.xml`, `.json`, `.config`)
- ✅ **Web files** (`.cshtml`, `.razor`, `.xaml`)

### Excluded Files and Directories

The following are automatically excluded from copying:

- `bin/`, `obj/` - Build outputs
- `.vs/`, `.git/` - IDE and version control
- `.user`, `.suo`, `.cache` - User-specific files

## Validation

The tool validates inputs in both modes:

### Namespace Validation

- ✅ Must start with a letter or underscore
- ✅ Can contain letters, numbers, dots, and underscores
- ✅ Cannot start or end with a dot
- ✅ Cannot contain consecutive dots
- ✅ Cannot use C# reserved keywords
- ✅ New namespace must differ from old namespace

### Path Validation

- ✅ Source path must exist and be a directory
- ✅ Source directory must contain a `.sln` file
- ✅ Target parent directory must exist
- ✅ Target directory validation with force mode support

## Error Handling

- **Graceful Cancellation**: Press `Ctrl+C` at any time in interactive mode
- **Validation Errors**: Clear, actionable error messages with suggestions
- **Cleanup**: Automatically cleans up on failure if target directory was created
- **Backward Compatible**: CLI mode error handling unchanged

## Requirements

- **Bun** runtime (v1.2.22 or later)
- **.NET SDK** (optional, for `dotnet restore` after cloning)
- **Windows, macOS, or Linux**

## Advanced Features

### Auto-Detection

The tool automatically detects:

- Solution file (`.sln`) in source directory
- Project count from solution file
- Namespace from solution name or `.csproj` RootNamespace
- Solution name if not provided

### Smart Defaults

Interactive mode provides smart defaults:

- Old namespace from auto-detection
- Target path based on new namespace (e.g., `./MyCompany.MyProject`)
- Solution names derived from namespaces

### Performance

- **Interactive Mode**: Starts in < 500ms
- **Validation**: All checks complete in < 100ms
- **CLI Mode**: Zero performance impact (lazy loading)

## Troubleshooting

### "No solution file (.sln) found"

Ensure you're pointing to the correct directory containing a `.sln` file.

### "Target directory is not empty"

Use `--force` flag in CLI mode, or confirm overwrite in interactive mode.

### "Namespace contains reserved keyword"

C# reserved keywords cannot be used in namespaces. Choose a different name.

### "Path does not exist"

Verify the source path is correct and accessible.

## Development

This project uses:

- **TypeScript** for type safety
- **Bun** for runtime and package management
- **@inquirer/prompts** for interactive mode

### Project Structure

```
.
├── cloner.ts              # Main application (CLI + Interactive)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── README.md              # This file
└── openspec/              # OpenSpec change management
    ├── config.yaml
    ├── changes/           # Active changes
    └── specs/             # Specifications
```

## Contributing

This project follows the OpenSpec workflow for changes and features. See the `openspec/` directory for active changes and specifications.

## License

[Add your license here]

## Credits

Created using [Bun](https://bun.sh) - A fast all-in-one JavaScript runtime.
