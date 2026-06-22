#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { join, dirname, basename, extname, relative, resolve } from 'path';
import { spawnSync } from 'child_process';

/**
 * List of file extensions that should be processed as text files
 * and have their content transformed (namespaces replaced).
 */
const TEXT_FILE_EXTENSIONS = [
  '.cs',
  '.xml',
  '.json',
  '.config',
  '.xaml',
  '.cshtml',
  '.razor',
  '.html',
  '.js',
  '.ts',
  '.css',
  '.asax'
];

interface CloneOptions {
  sourcePath: string;
  targetPath: string;
  oldNamespace: string;
  newNamespace: string;
  oldSolutionName: string;
  newSolutionName: string;
  force: boolean;
  template: boolean;
}

interface ProjectInfo {
  name: string;
  path: string;
  guid: string;
  dependencies: string[];
}

interface SolutionInfo {
  solutionName: string;
  solutionPath: string;
  detectedNamespace: string | null;
  projectCount: number;
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates C# namespace format according to language specification.
 * @param namespace - The namespace string to validate
 * @returns true if valid, error message string if invalid
 */
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

/**
 * Validates that a path exists and is accessible.
 * @param path - The file system path to validate
 * @returns true if valid, error message string if invalid
 */
function validatePathExists(path: string): boolean | string {
  if (!path || path.trim().length === 0) {
    return 'Path cannot be empty';
  }

  try {
    if (!existsSync(path)) {
      return `Path does not exist: ${path}`;
    }
    return true;
  } catch (error: any) {
    return `Cannot access path: ${error.message}`;
  }
}

/**
 * Validates that a path points to a directory.
 * @param path - The file system path to validate
 * @returns true if valid, error message string if invalid
 */
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
  } catch (error: any) {
    return `Cannot access path: ${error.message}`;
  }
}

/**
 * Validates that a directory contains at least one solution file.
 * @param path - The directory path to validate
 * @returns true if valid, error message string if invalid
 */
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
  } catch (error: any) {
    return `Cannot read directory: ${error.message}`;
  }
}

/**
 * Ensures new namespace is different from old namespace.
 * @param oldNs - The old namespace
 * @param newNs - The new namespace
 * @returns true if different, error message string if same
 */
function validateNamespacesAreDifferent(oldNs: string, newNs: string): boolean | string {
  if (oldNs === newNs) {
    return 'New namespace must be different from old namespace';
  }
  return true;
}

/**
 * Validates target path for cloning operation.
 * @param targetPath - The target directory path
 * @param force - Whether force overwrite is enabled
 * @returns true if valid, error message string if invalid
 */
function validateTargetPath(targetPath: string, force: boolean): boolean | string {
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

// ============================================================================
// MODE DETECTION
// ============================================================================

/**
 * Detects whether to run in CLI or interactive mode based on command-line arguments.
 * @returns 'cli' if arguments are present, 'interactive' if no arguments
 */
function detectMode(): 'cli' | 'interactive' {
  const args = process.argv.slice(2);

  // If --help, use CLI mode
  if (args.includes('--help')) {
    return 'cli';
  }

  // If --interactive flag, force interactive mode
  if (args.includes('--interactive')) {
    return 'interactive';
  }

  // If any positional args (excluding flags), use CLI mode
  const positionalArgs = args.filter(arg => !arg.startsWith('--'));
  if (positionalArgs.length > 0) {
    return 'cli';
  }

  return 'interactive';
}

// ============================================================================
// INTERACTIVE MODE FUNCTIONS
// ============================================================================

/**
 * Prompts user for source directory path with validation.
 * @returns Absolute path to source directory
 */
async function promptSourcePath(): Promise<string> {
  const { input } = await import('@inquirer/prompts');
  
  const sourcePath = await input({
    message: 'Enter source directory path:',
    validate: (value: string) => {
      const pathCheck = validatePathExists(value);
      if (pathCheck !== true) return pathCheck;

      const dirCheck = validatePathIsDirectory(value);
      if (dirCheck !== true) return dirCheck;

      const slnCheck = validateSolutionDirectory(value);
      if (slnCheck !== true) return slnCheck;

      return true;
    }
  });

  return resolve(sourcePath);
}

/**
 * Detects solution information from source directory.
 * @param sourcePath - The source directory path
 * @returns Solution information including name, path, detected namespace, and project count
 */
function detectSolutionInfo(sourcePath: string): SolutionInfo {
  // Find .sln file in source directory
  const files = readdirSync(sourcePath);
  const slnFiles = files.filter(f => f.toLowerCase().endsWith('.sln'));

  if (slnFiles.length === 0) {
    throw new Error(`No solution file found in: ${sourcePath}`);
  }

  // Use first .sln file found (sorted alphabetically)
  slnFiles.sort();
  const solutionName = slnFiles[0].replace('.sln', '');
  const solutionPath = join(sourcePath, slnFiles[0]);

  // Parse solution to count projects
  const solutionContent = readFileSync(solutionPath, 'utf-8');
  const lines = solutionContent.split('\n');
  let projectCount = 0;

  for (const line of lines) {
    if (line.trim().startsWith('Project(')) {
      projectCount++;
    }
  }

  // Attempt namespace detection from solution name or first .csproj
  let detectedNamespace: string | null = null;

  // Try from solution name first
  if (solutionName.includes('.')) {
    detectedNamespace = solutionName;
  }

  // Try from first .csproj if not detected
  if (!detectedNamespace) {
    try {
      const csprojFiles: string[] = [];
      const findCsproj = (dir: string) => {
        const items = readdirSync(dir);
        for (const item of items) {
          const itemPath = join(dir, item);
          const stat = statSync(itemPath);
          if (stat.isDirectory() && !['bin', 'obj', '.vs', '.git'].includes(item)) {
            findCsproj(itemPath);
          } else if (item.endsWith('.csproj')) {
            csprojFiles.push(itemPath);
          }
        }
      };
      findCsproj(sourcePath);

      if (csprojFiles.length > 0) {
        const csprojContent = readFileSync(csprojFiles[0], 'utf-8');
        const namespaceMatch = csprojContent.match(/<RootNamespace>(.*?)<\/RootNamespace>/);
        if (namespaceMatch) {
          detectedNamespace = namespaceMatch[1];
        }
      }
    } catch (error) {
      // Namespace detection failed, will prompt user without default
    }
  }

  return {
    solutionName,
    solutionPath,
    detectedNamespace,
    projectCount
  };
}

/**
 * Prompts user for old and new namespaces with validation.
 * @param defaultOld - Default value for old namespace (from detection)
 * @returns Object with old and new namespace strings
 */
async function promptNamespaces(defaultOld: string | null): Promise<{ old: string; new: string }> {
  const { input } = await import('@inquirer/prompts');

  const oldNamespace = await input({
    message: 'Old namespace:',
    default: defaultOld || undefined,
    validate: (value: string) => validateNamespaceFormat(value)
  });

  const newNamespace = await input({
    message: 'New namespace:',
    validate: (value: string) => {
      const formatCheck = validateNamespaceFormat(value);
      if (formatCheck !== true) return formatCheck;

      const diffCheck = validateNamespacesAreDifferent(oldNamespace, value);
      if (diffCheck !== true) return diffCheck;

      return true;
    }
  });

  return { old: oldNamespace, new: newNamespace };
}

/**
 * Prompts user for target directory path with smart default.
 * @param suggestedDefault - Suggested default path based on new namespace
 * @returns Absolute path to target directory
 */
async function promptTargetPath(suggestedDefault: string): Promise<string> {
  const { input } = await import('@inquirer/prompts');

  const targetPath = await input({
    message: 'Target directory path:',
    default: suggestedDefault,
    validate: (value: string) => {
      // Just check parent exists; we'll handle empty/non-empty later
      const absPath = resolve(value);
      if (existsSync(absPath)) {
        return true; // Will check if needs force later
      } else {
        const parentDir = dirname(absPath);
        if (!existsSync(parentDir)) {
          return `Parent directory does not exist: ${parentDir}`;
        }
      }
      return true;
    }
  });

  return resolve(targetPath);
}

/**
 * Prompts user for clone options (template mode and force overwrite).
 * @param targetPath - The target directory path to check if force is needed
 * @returns Object with template and force boolean flags
 */
async function promptOptions(targetPath: string): Promise<{ template: boolean; force: boolean }> {
  const { select, confirm } = await import('@inquirer/prompts');

  // Prompt for clone mode
  const cloneMode = await select({
    message: 'Clone mode:',
    choices: [
      {
        name: 'Full copy (preserve all business logic)',
        value: 'full',
        description: 'Complete copy including all logic files'
      },
      {
        name: 'Template (remove business logic for clean start)',
        value: 'template',
        description: 'Removes *Logic folders in BLL, *Repository.cs in DAL, and related DI registrations'
      }
    ]
  });

  const template = cloneMode === 'template';

  // Check if force is needed
  let force = false;
  if (existsSync(targetPath)) {
    const files = readdirSync(targetPath);
    if (files.length > 0) {
      console.log('\n⚠️  Warning: Target directory exists and is not empty');
      force = await confirm({
        message: 'Overwrite existing files?',
        default: false
      });
    }
  }

  return { template, force };
}

/**
 * Displays a formatted summary of all collected inputs before execution.
 * @param options - The CloneOptions to display
 * @param projectCount - Number of projects that will be cloned
 */
function showSummary(options: CloneOptions, projectCount: number): void {
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│ 📋 CLONE SUMMARY                                        │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Source:     ${options.sourcePath.padEnd(42)} │`);
  console.log(`│ Target:     ${options.targetPath.padEnd(42)} │`);
  console.log(`│ Namespace:  ${options.oldNamespace} → ${options.newNamespace.padEnd(26)} │`);
  console.log(`│ Solution:   ${options.oldSolutionName} → ${options.newSolutionName.padEnd(26)} │`);
  console.log(`│ Projects:   ${projectCount} will be cloned${' '.repeat(32)} │`);
  console.log(`│ Mode:       ${(options.template ? 'Template (logic removed)' : 'Full copy').padEnd(42)} │`);
  console.log(`│ Force:      ${(options.force ? 'Yes (overwrite enabled)' : 'No').padEnd(42)} │`);
  
  if (options.template) {
    console.log('│                                                         │');
    console.log('│ Template mode will remove:                              │');
    console.log('│  • *Logic folders in BLL projects                       │');
    console.log('│  • *Repository.cs in DAL projects                       │');
    console.log('│  • Related DI registrations                             │');
  }
  
  console.log('└─────────────────────────────────────────────────────────┘\n');
}

/**
 * Prompts user for final confirmation before starting clone operation.
 * @returns true to proceed, false to cancel
 */
async function confirmProceed(): Promise<boolean> {
  const { confirm } = await import('@inquirer/prompts');
  
  return await confirm({
    message: 'Proceed with clone?',
    default: true
  });
}

/**
 * Collects all inputs interactively and assembles CloneOptions.
 * @returns CloneOptions object ready for cloning
 */
async function collectInteractiveInputs(): Promise<CloneOptions> {
  try {
    console.log('\n🔧 C# Project Cloner - Interactive Mode\n');

    // Step 1: Source path
    const sourcePath = await promptSourcePath();

    // Step 2: Detect solution info
    console.log('\n🔍 Detecting solution information...');
    const solutionInfo = detectSolutionInfo(sourcePath);
    console.log(`✓ Found solution: ${solutionInfo.solutionName}.sln`);
    console.log(`  Projects: ${solutionInfo.projectCount} detected`);
    if (solutionInfo.detectedNamespace) {
      console.log(`  Namespace: ${solutionInfo.detectedNamespace} (detected)\n`);
    } else {
      console.log(`  Namespace: Could not auto-detect\n`);
    }

    // Step 3: Namespaces
    const namespaces = await promptNamespaces(solutionInfo.detectedNamespace);

    // Step 4: Target path
    const suggestedTarget = `./${namespaces.new}`;
    const targetPath = await promptTargetPath(suggestedTarget);

    // Step 5: Options
    const options = await promptOptions(targetPath);

    // Assemble CloneOptions
    const cloneOptions: CloneOptions = {
      sourcePath,
      targetPath,
      oldNamespace: namespaces.old,
      newNamespace: namespaces.new,
      oldSolutionName: solutionInfo.solutionName,
      newSolutionName: namespaces.new,
      force: options.force,
      template: options.template
    };

    // Step 6: Show summary
    showSummary(cloneOptions, solutionInfo.projectCount);

    // Step 7: Final confirmation
    const proceed = await confirmProceed();
    if (!proceed) {
      console.log('\n❌ Clone operation cancelled by user.');
      process.exit(0);
    }

    return cloneOptions;
  } catch (error: any) {
    // Handle Ctrl+C and other interruptions gracefully
    if (error.name === 'ExitPromptError' || error.code === 'ERR_USE_AFTER_CLOSE') {
      console.log('\n\n❌ Operation cancelled by user.');
      process.exit(130); // Standard exit code for SIGINT
    }
    throw error;
  }
}

class CSharpProjectCloner {
  private options: CloneOptions;
  private projectMap: Map<string, ProjectInfo> = new Map();
  private createdTargetDir = false;
  private deletedTypes: Set<string> = new Set();

  constructor(options: CloneOptions) {
    this.options = options;
  }

  async clone(): Promise<void> {
    console.log(`🚀 Starting C# project clone from "${this.options.sourcePath}" to "${this.options.targetPath}"`);
    console.log(`📝 Namespace: ${this.options.oldNamespace} → ${this.options.newNamespace}`);
    console.log(`📦 Solution: ${this.options.oldSolutionName} → ${this.options.newSolutionName}`);
    if (this.options.template) {
      console.log(`🧹 Template Mode: ENABLED (Removing distinct business logic)`);
    }

    try {
      // Validate source path
      if (!existsSync(this.options.sourcePath)) {
        throw new Error(`Source path does not exist: ${this.options.sourcePath}`);
      }

      // Check target directory
      if (existsSync(this.options.targetPath)) {
        const files = readdirSync(this.options.targetPath);
        if (files.length > 0 && !this.options.force) {
          throw new Error(`Target directory "${this.options.targetPath}" is not empty. Use --force to overwrite.`);
        }
      } else {
        this.createdTargetDir = true;
      }

      // Create target directory
      this.ensureDirectoryExists(this.options.targetPath);

      // Parse solution file to understand project structure
      await this.parseSolutionFile();

      // Copy solution-root files (e.g., .gitignore, NuGet.config)
      await this.copySolutionRootFiles();

      // Copy and transform all projects
      await this.copyProjects();

      // Apply template changes (remove logic and sanitise startup)
      if (this.options.template) {
        await this.applyTemplateChanges();
      }

      // Create new solution file
      await this.createNewSolutionFile();

      console.log('✅ Project cloning completed successfully!');
      console.log(`📁 New project location: ${this.options.targetPath}`);
    } catch (error) {
      console.error('❌ Error during cloning:', error);

      // Cleanup if we created the directory and cloning failed
      if (this.createdTargetDir && existsSync(this.options.targetPath)) {
        try {
          console.log(`🧹 Cleaning up created target directory: ${this.options.targetPath}`);
          rmSync(this.options.targetPath, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('⚠️  Failed to cleanup target directory:', cleanupError);
        }
      }

      throw error;
    }
  }

  private async parseSolutionFile(): Promise<void> {
    // Try to find the solution file
    let solutionPath = join(this.options.sourcePath, `${this.options.oldSolutionName}.sln`);

    if (!existsSync(solutionPath)) {
      // Auto-detect solution file
      const files = readdirSync(this.options.sourcePath);
      const slnFile = files.find(f => f.endsWith('.sln'));
      if (slnFile) {
        solutionPath = join(this.options.sourcePath, slnFile);
        this.options.oldSolutionName = slnFile.replace('.sln', '');
      } else {
        throw new Error(`Solution file not found in: ${this.options.sourcePath}`);
      }
    }

    const solutionContent = readFileSync(solutionPath, 'utf-8');
    const lines = solutionContent.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Parse project entries
      if (trimmedLine.startsWith('Project(')) {
        const projectMatch = trimmedLine.match(/Project\("([^"]+)"\) = "([^"]+)", "([^"]+)", "([^"]+)"/);
        if (projectMatch) {
          const [, , projectName, projectPath, projectGuid] = projectMatch;

          if (projectName && projectPath && projectGuid) {
            this.projectMap.set(projectGuid, {
              name: projectName,
              path: projectPath,
              guid: projectGuid,
              dependencies: []
            });
          }
        }
      }

      // Parse project dependencies
      if (trimmedLine.startsWith('{') && trimmedLine.includes('} = {')) {
        const depMatch = trimmedLine.match(/\{([^}]+)\} = \{([^}]+)\}/);
        if (depMatch) {
          const [, dependentGuid, dependencyGuid] = depMatch;
          if (dependentGuid && dependencyGuid) {
            const project = this.projectMap.get(dependentGuid);
            if (project) {
              project.dependencies.push(dependencyGuid);
            }
          }
        }
      }
    }

    console.log(`📋 Found ${this.projectMap.size} projects in solution`);
  }

  private async copySolutionRootFiles(): Promise<void> {
    const items = readdirSync(this.options.sourcePath);
    for (const item of items) {
      // Skip common directories and solution file (we regenerate it)
      if (['.git', '.vs', 'bin', 'obj'].includes(item)) continue;

      const sourcePath = join(this.options.sourcePath, item);
      const targetPath = join(this.options.targetPath, item);
      const stat = statSync(sourcePath);

      if (stat.isFile()) {
        // Do not copy existing solution file; it will be recreated with new names
        if (item.toLowerCase().endsWith('.sln')) continue;
        try {
          copyFileSync(sourcePath, targetPath);
        } catch (err) {
          console.warn(`⚠️  Failed to copy root file ${item}:`, err);
        }
      }
    }
  }

  private async copyProjects(): Promise<void> {
    for (const [guid, projectInfo] of this.projectMap) {
      const sourceProjectPath = join(this.options.sourcePath, dirname(projectInfo.path));
      const newProjectName = this.transformProjectName(projectInfo.name);
      const newProjectPath = join(this.options.targetPath, newProjectName);

      console.log(`📂 Copying project: ${projectInfo.name} → ${newProjectName}`);

      // Create project directory
      this.ensureDirectoryExists(newProjectPath);

      // Copy project files
      await this.copyDirectory(sourceProjectPath, newProjectPath);

      // Transform project file
      await this.transformProjectFile(newProjectPath, newProjectName);

      // Transform Project content files (cs, xml, etc)
      await this.transformProjectFiles(newProjectPath);
    }
  }

  private async applyTemplateChanges(): Promise<void> {
    console.log('🧹 Purging logic files...');

    // We need to walk through the *target* projects and specifically look for Logic, Repository, etc.
    // Since we renamed projects, we need to look in the renamed paths.

    for (const [guid, projectInfo] of this.projectMap) {
      const newProjectName = this.transformProjectName(projectInfo.name);
      const newProjectPath = join(this.options.targetPath, newProjectName);

      // Helper to determine if a project is a certain layer based on name
      const isBLL = newProjectName.endsWith('.BLL');
      const isDAL = newProjectName.endsWith('.DAL');
      const isAPI = newProjectName.endsWith('.BackEndAPI') || newProjectName.endsWith('.API');

      if (isBLL && existsSync(newProjectPath)) {
        await this.purgeLogicFolders(newProjectPath);
      }

      if (isDAL && existsSync(newProjectPath)) {
        await this.purgeRepositories(newProjectPath);
      }

      // We handle Startup/Program separately after gathering all deleted types
    }

    // Now cleanup Startup.cs / Program.cs in API projects
    for (const [guid, projectInfo] of this.projectMap) {
      const newProjectName = this.transformProjectName(projectInfo.name);
      const isAPI = newProjectName.endsWith('.BackEndAPI') || newProjectName.endsWith('.API');

      if (isAPI) {
        const newProjectPath = join(this.options.targetPath, newProjectName);
        await this.sanitizeStartup(newProjectPath);
      }
    }
  }

  private async purgeLogicFolders(directory: string): Promise<void> {
    const items = readdirSync(directory);

    for (const item of items) {
      const itemPath = join(directory, item);
      const stat = statSync(itemPath);

      if (stat.isDirectory()) {
        // Check if it's a Logic folder (ending in Logic)
        if (item.endsWith('Logic')) {
          console.log(`  Deleting BLL Logic Folder: ${item}`);
          // Track the types that might be in here (simple heuristic: folder name often matches main class name)
          this.deletedTypes.add(item);
          // Also try to read the directory to find file names (e.g. AnnouncementLogic.cs)
          try {
            const subFiles = readdirSync(itemPath);
            for (const sub of subFiles) {
              if (sub.endsWith('.cs') && sub.includes('Logic')) {
                this.deletedTypes.add(sub.replace('.cs', ''));
              }
            }
          } catch { }

          rmSync(itemPath, { recursive: true, force: true });
        } else {
          // Recurse into subdirectories (e.g. if structure is deeper)
          await this.purgeLogicFolders(itemPath);
        }
      }
    }
  }

  private async purgeRepositories(directory: string): Promise<void> {
    const items = readdirSync(directory);

    for (const item of items) {
      const itemPath = join(directory, item);
      const stat = statSync(itemPath);

      if (stat.isDirectory()) {
        await this.purgeRepositories(itemPath);
      } else if (stat.isFile()) {
        // Check if it's a Repository file (ending in Repository.cs) AND in a directory likely named Repositories (or sub)
        // Or just blanket replace *Repository.cs files that aren't base classes?
        // Let's be aggressive for template mode: delete *Repository.cs
        // BUT we should probably exclude core ones like 'BaseRepository' if they exist.
        // For now, let's target files ending in Repository.cs that aren't generic interfaces.

        if (item.endsWith('Repository.cs') && !item.startsWith('I') && item !== 'BaseRepository.cs' && item !== 'Repository.cs') {
          console.log(`  Deleting DAL Repository: ${item}`);
          this.deletedTypes.add(item.replace('.cs', ''));
          // Also add interface name guess
          this.deletedTypes.add(`I${item.replace('.cs', '')}`);
          unlinkSync(itemPath);
        }
      }
    }
  }

  private async sanitizeStartup(projectPath: string): Promise<void> {
    // Look for Startup.cs or Program.cs
    const files = readdirSync(projectPath);
    const startupFile = files.find(f => f === 'Startup.cs' || f === 'Program.cs');

    if (!startupFile) return;

    const startupPath = join(projectPath, startupFile);
    let content = readFileSync(startupPath, 'utf-8');
    const lines = content.split('\n');
    const newLines = [];

    for (const line of lines) {
      let shouldComment = false;
      // Check if line contains registration for any deleted type
      // Matches: <IDeletedType, DeletedType> or (typeof(DeletedType))
      for (const typeName of this.deletedTypes) {
        // Regex checking for word boundaries to avoid partial matches
        // e.g. "AnnouncementLogic" should not match "AnnouncementLogicHelper" if that existed (unlikely, but safe)
        const regex = new RegExp(`\\b${typeName}\\b`);
        if (regex.test(line)) {
          // Double check it's a service registration
          if (line.trim().startsWith('services.Add') || line.trim().startsWith('.')) { // .Add... chain
            shouldComment = true;
            break;
          }
        }
      }

      if (shouldComment && !line.trim().startsWith('//')) {
        console.log(`  Commenting out DI registration: ${line.trim()}`);
        newLines.push(`// ${line}`);
      } else {
        newLines.push(line);
      }
    }

    writeFileSync(startupPath, newLines.join('\n'));
  }

  private async copyDirectory(source: string, target: string): Promise<void> {
    if (!existsSync(source)) {
      console.warn(`⚠️  Source directory does not exist: ${source}`);
      return;
    }

    this.ensureDirectoryExists(target);

    const items = readdirSync(source);

    for (const item of items) {
      const sourcePath = join(source, item);
      const targetPath = join(target, item);
      const stat = statSync(sourcePath);

      if (stat.isDirectory()) {
        // Skip certain directories
        if (['bin', 'obj', '.vs', '.git'].includes(item)) {
          continue;
        }
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        // Skip certain files
        if (['.user', '.suo', '.cache'].some(ext => item.endsWith(ext))) {
          continue;
        }
        copyFileSync(sourcePath, targetPath);
      }
    }
  }

  private async transformProjectFile(projectPath: string, newProjectName: string): Promise<void> {
    const projectFile = join(projectPath, `${newProjectName}.csproj`);

    if (!existsSync(projectFile)) {
      // Find the actual project file
      const files = readdirSync(projectPath);
      const csprojFile = files.find(f => f.endsWith('.csproj'));
      if (csprojFile) {
        const oldProjectFile = join(projectPath, csprojFile);
        const newProjectFile = join(projectPath, `${newProjectName}.csproj`);
        copyFileSync(oldProjectFile, newProjectFile);

        // Remove old project file
        unlinkSync(oldProjectFile);
      }
    }

    if (existsSync(projectFile)) {
      let content = readFileSync(projectFile, 'utf-8');

      // Update project references - process in reverse order to avoid conflicts
      const sortedProjects = Array.from(this.projectMap.entries()).sort((a, b) => b[1].name.length - a[1].name.length);

      for (const [guid, projectInfo] of sortedProjects) {
        const oldProjectName = projectInfo.name;
        const newProjectName = this.transformProjectName(projectInfo.name);

        // Replace project reference paths
        const oldRefPath = `..\\${oldProjectName}\\${oldProjectName}.csproj`;
        const newRefPath = `..\\${newProjectName}\\${newProjectName}.csproj`;

        content = content.replace(
          new RegExp(this.escapeRegex(oldRefPath), 'g'),
          newRefPath
        );

        // Also replace with forward slashes (in case the original had forward slashes)
        const oldRefPathForward = `../${oldProjectName}/${oldProjectName}.csproj`;
        const newRefPathForward = `../${newProjectName}/${newProjectName}.csproj`;

        content = content.replace(
          new RegExp(this.escapeRegex(oldRefPathForward), 'g'),
          newRefPathForward
        );
      }

      writeFileSync(projectFile, content);
      console.log(`📝 Updated project references in: ${basename(projectFile)}`);
    }
  }

  private async transformProjectFiles(directory: string): Promise<void> {
    const items = readdirSync(directory);

    for (const item of items) {
      const itemPath = join(directory, item);
      const stat = statSync(itemPath);

      if (stat.isDirectory()) {
        await this.transformProjectFiles(itemPath);
      } else {
        const ext = extname(item).toLowerCase();
        if (TEXT_FILE_EXTENSIONS.includes(ext)) {
          await this.transformFile(itemPath);
        }
      }
    }
  }

  private async transformFile(filePath: string): Promise<void> {
    let content = readFileSync(filePath, 'utf-8');

    // Replace namespace declarations
    const namespaceRegex = new RegExp(`namespace\\s+${this.escapeRegex(this.options.oldNamespace)}`, 'g');
    content = content.replace(namespaceRegex, `namespace ${this.options.newNamespace}`);

    // Replace using statements
    const usingRegex = new RegExp(`using\\s+${this.escapeRegex(this.options.oldNamespace)}`, 'g');
    content = content.replace(usingRegex, `using ${this.options.newNamespace}`);

    // Replace class/interface/struct names that contain the old namespace
    const classRegex = new RegExp(`\\b${this.escapeRegex(this.options.oldNamespace)}\\.`, 'g');
    content = content.replace(classRegex, `${this.options.newNamespace}.`);

    // General string replacement for other file types (config, xml, etc)
    // This is safer for non-compiled files where explicit "using" or "namespace" keywords might not exist
    // but the string value needs to be updated.
    if (!filePath.endsWith('.cs')) {
      const generalRegex = new RegExp(this.escapeRegex(this.options.oldNamespace), 'g');
      content = content.replace(generalRegex, this.options.newNamespace);
    }

    writeFileSync(filePath, content);
  }

  private async createNewSolutionFile(): Promise<void> {
    const solutionPath = join(this.options.targetPath, `${this.options.newSolutionName}.sln`);
    // Robustly pick the original .sln: prefer provided name, else auto-detect first .sln in source
    let originalSolutionPath = join(this.options.sourcePath, `${this.options.oldSolutionName}.sln`);
    if (!existsSync(originalSolutionPath)) {
      const rootItems = readdirSync(this.options.sourcePath);
      const sln = rootItems.find(x => x.toLowerCase().endsWith('.sln'));
      if (!sln) {
        throw new Error(`No solution file found in ${this.options.sourcePath}`);
      }
      originalSolutionPath = join(this.options.sourcePath, sln);
    }

    let content = readFileSync(originalSolutionPath, 'utf-8');

    // Replace solution name occurrences in content (use detected old name if available)
    if (this.options.oldSolutionName) {
      content = content.replace(
        new RegExp(this.escapeRegex(this.options.oldSolutionName), 'g'),
        this.options.newSolutionName
      );
    }

    // Replace project names and paths - process in reverse order to avoid conflicts
    const sortedProjects = Array.from(this.projectMap.entries()).sort((a, b) => b[1].name.length - a[1].name.length);

    for (const [guid, projectInfo] of sortedProjects) {
      const newProjectName = this.transformProjectName(projectInfo.name);
      const newProjectPath = `${newProjectName}\\${newProjectName}.csproj`;

      // Replace project name in Project line - use regex with word boundaries
      content = content.replace(
        new RegExp(`"${this.escapeRegex(projectInfo.name)}"`, 'g'),
        `"${newProjectName}"`
      );

      // Replace project path
      content = content.replace(
        new RegExp(`"${this.escapeRegex(projectInfo.path)}"`, 'g'),
        `"${newProjectPath}"`
      );
    }

    writeFileSync(solutionPath, content);
    console.log(`📄 Created new solution file: ${solutionPath}`);

    // Attempt to run dotnet restore if available
    this.tryDotnetRestore(solutionPath, this.options.targetPath);
  }

  private tryDotnetRestore(solutionPath: string, workingDir: string): void {
    try {
      // Check if dotnet is available
      const version = spawnSync('dotnet', ['--version'], { encoding: 'utf-8' });
      if (version.status !== 0) {
        console.warn('⚠️  dotnet CLI not found. Skipping dotnet restore.');
        return;
      }

      console.log('🛠️  Running dotnet restore...');
      const result = spawnSync('dotnet', ['restore', solutionPath], { cwd: workingDir, stdio: 'inherit' });
      if (result.status === 0) {
        console.log('✅ dotnet restore completed successfully.');
      } else {
        console.warn('⚠️  dotnet restore failed for solution. Trying directory restore...');
        const fallback = spawnSync('dotnet', ['restore'], { cwd: workingDir, stdio: 'inherit' });
        if (fallback.status === 0) {
          console.log('✅ dotnet restore (directory) completed successfully.');
        } else {
          console.warn('⚠️  dotnet restore failed. You may need to run it manually.');
        }
      }
    } catch (err) {
      console.warn('⚠️  Error while attempting dotnet restore:', err);
    }
  }

  private transformProjectName(projectName: string): string {
    return projectName.replace(
      new RegExp(this.escapeRegex(this.options.oldNamespace), 'g'),
      this.options.newNamespace
    );
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }
}

// ============================================================================
// CLI PARSER
// ============================================================================

/**
 * Parses command-line arguments and returns CloneOptions.
 * @returns CloneOptions object from CLI arguments
 */
function parseCliArgs(): CloneOptions {
  const args = process.argv.slice(2);

  // Parse flags
  const force = args.includes('--force');
  const template = args.includes('--template');

  const cleanArgs = args.filter(arg => !arg.startsWith('--'));

  const [sourcePath, targetPath, oldNamespace, newNamespace, oldSolutionName, newSolutionName] = cleanArgs;

  // Validate required arguments
  if (!sourcePath || !targetPath || !oldNamespace || !newNamespace) {
    console.error('❌ Missing required arguments');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Auto-detect solution name if not provided
  const detectedSolutionName = oldSolutionName || basename(sourcePath);
  // Default the new solution name to the FULL new namespace
  const finalNewSolutionName = newSolutionName || newNamespace || 'NewProject';

  return {
    sourcePath: sourcePath,
    targetPath: targetPath,
    oldNamespace: oldNamespace,
    newNamespace: newNamespace,
    oldSolutionName: detectedSolutionName,
    newSolutionName: finalNewSolutionName,
    force: force,
    template: template
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  const mode = detectMode();

  // Handle --help flag
  if (process.argv.includes('--help')) {
    console.log(`
🔧 C# Project Cloner

Usage: 
  Interactive mode: bun cloner.ts
  CLI mode:         bun cloner.ts <source-path> <target-path> <old-namespace> <new-namespace> [old-solution-name] [new-solution-name] [--force] [--template]

Interactive Mode:
  Run without arguments to start an interactive guided wizard that will:
  • Auto-detect solution and namespace information
  • Validate inputs at each step
  • Show a summary before cloning
  • Provide helpful error messages

CLI Mode Arguments:
  source-path       Path to the source C# project directory
  target-path       Path where the new project will be created
  old-namespace     Current namespace (e.g., "Bion.NAS.Platform")
  new-namespace     New namespace (e.g., "MyCompany.MyProject")
  old-solution-name (optional) Current solution name (default: auto-detect)
  new-solution-name (optional) New solution name (default: based on new namespace)

Options:
  --force           Overwrite target directory if it exists and is not empty
  --template        Clone as a template (removes specific business logic, keeps infrastructure)
  --interactive     Force interactive mode even with some arguments present
  --help            Show this help message

Examples:
  # Interactive mode (recommended for first-time users)
  bun cloner.ts

  # CLI mode (for automation and scripts)
  bun cloner.ts ./SSG1-BION-NAS-Platform ./MyNewProject Bion.NAS.Platform MyCompany.MyProject
  bun cloner.ts ./SSG1-BION-NAS-Platform ./MyNewProject Bion.NAS.Platform MyCompany.MyProject --force --template

Template Mode:
  When --template is used, the following will be removed:
  • *Logic folders in BLL projects
  • *Repository.cs files in DAL projects
  • Related dependency injection registrations in Startup.cs/Program.cs
    `);
    process.exit(0);
  }

  try {
    let options: CloneOptions;

    if (mode === 'interactive') {
      // Interactive mode: guided prompts
      options = await collectInteractiveInputs();
    } else {
      // CLI mode: parse command-line arguments
      options = parseCliArgs();
    }

    // Execute clone with the assembled options
    const cloner = new CSharpProjectCloner(options);
    await cloner.clone();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main().catch(console.error);
}

export { CSharpProjectCloner };
export type { CloneOptions };
