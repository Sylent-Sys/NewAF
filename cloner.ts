#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname, basename, extname, relative } from 'path';
import { spawnSync } from 'child_process';

interface CloneOptions {
  sourcePath: string;
  targetPath: string;
  oldNamespace: string;
  newNamespace: string;
  oldSolutionName: string;
  newSolutionName: string;
}

interface ProjectInfo {
  name: string;
  path: string;
  guid: string;
  dependencies: string[];
}

class CSharpProjectCloner {
  private options: CloneOptions;
  private projectMap: Map<string, ProjectInfo> = new Map();

  constructor(options: CloneOptions) {
    this.options = options;
  }

  async clone(): Promise<void> {
    console.log(`🚀 Starting C# project clone from "${this.options.sourcePath}" to "${this.options.targetPath}"`);
    console.log(`📝 Namespace: ${this.options.oldNamespace} → ${this.options.newNamespace}`);
    console.log(`📦 Solution: ${this.options.oldSolutionName} → ${this.options.newSolutionName}`);
    
    try {
      // Validate source path
      if (!existsSync(this.options.sourcePath)) {
        throw new Error(`Source path does not exist: ${this.options.sourcePath}`);
      }

      // Create target directory
      this.ensureDirectoryExists(this.options.targetPath);

      // Parse solution file to understand project structure
      await this.parseSolutionFile();

      // Copy solution-root files (e.g., .gitignore, NuGet.config)
      await this.copySolutionRootFiles();

      // Copy and transform all projects
      await this.copyProjects();

      // Create new solution file
      await this.createNewSolutionFile();

      console.log('✅ Project cloning completed successfully!');
      console.log(`📁 New project location: ${this.options.targetPath}`);
    } catch (error) {
      console.error('❌ Error during cloning:', error);
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
      
      // Transform C# files
      await this.transformCSharpFiles(newProjectPath);
    }
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

  private async transformCSharpFiles(directory: string): Promise<void> {
    const items = readdirSync(directory);
    
    for (const item of items) {
      const itemPath = join(directory, item);
      const stat = statSync(itemPath);
      
      if (stat.isDirectory()) {
        await this.transformCSharpFiles(itemPath);
      } else if (item.endsWith('.cs')) {
        await this.transformCSharpFile(itemPath);
      }
    }
  }

  private async transformCSharpFile(filePath: string): Promise<void> {
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

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log(`
🔧 C# Project Cloner

Usage: bun cloner.ts <source-path> <target-path> <old-namespace> <new-namespace> [old-solution-name] [new-solution-name]

Arguments:
  source-path      Path to the source C# project directory
  target-path      Path where the new project will be created
  old-namespace    Current namespace (e.g., "Bion.NAS.Platform")
  new-namespace    New namespace (e.g., "MyCompany.MyProject")
  old-solution-name (optional) Current solution name (default: auto-detect)
  new-solution-name (optional) New solution name (default: based on new namespace)

Examples:
  bun cloner.ts ./SSG1-BION-NAS-Platform ./MyNewProject Bion.NAS.Platform MyCompany.MyProject
  bun cloner.ts ./SSG1-BION-NAS-Platform ./MyNewProject Bion.NAS.Platform MyCompany.MyProject Bion.NAS.Platform MyCompany.MyProject
    `);
    process.exit(1);
  }

  const [sourcePath, targetPath, oldNamespace, newNamespace, oldSolutionName, newSolutionName] = args;
  
  // Validate required arguments
  if (!sourcePath || !targetPath || !oldNamespace || !newNamespace) {
    console.error('❌ Missing required arguments');
    process.exit(1);
  }
  
  // Auto-detect solution name if not provided
  const detectedSolutionName = oldSolutionName || basename(sourcePath);
  // Default the new solution name to the FULL new namespace to avoid mismatch (e.g., Bion.ForumSummary)
  const finalNewSolutionName = newSolutionName || newNamespace || 'NewProject';

  const options: CloneOptions = {
    sourcePath: sourcePath,
    targetPath: targetPath,
    oldNamespace: oldNamespace,
    newNamespace: newNamespace,
    oldSolutionName: detectedSolutionName,
    newSolutionName: finalNewSolutionName
  };

  const cloner = new CSharpProjectCloner(options);
  await cloner.clone();
}

// Run the script
if (import.meta.main) {
  main().catch(console.error);
}

export { CSharpProjectCloner };
export type { CloneOptions };
