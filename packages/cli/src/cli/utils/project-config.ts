import * as fs from 'fs/promises';
import * as path from 'path';
import { parseYaml } from './yaml.js';

export interface ProjectConfigSection {
  sourceFramework?: string;
  targetFramework?: string;
  ide?: string;
  ides?: string;
  mode?: string;
  codeSpec?: string;
}

export interface SkillConfigSection {
  preprocess?: string;
  postprocess?: string;
}

export interface WorkspaceConfigSection {
  preprocessContext?: string;
  enhancedAnalysis?: string;
  postprocessContext?: string;
}

export interface ProjectConfig {
  project?: ProjectConfigSection;
  skills?: SkillConfigSection;
  workspace?: WorkspaceConfigSection;
  logging?: {
    level?: string;
    console?: boolean;
  };
}

export async function loadProjectConfig(projectPath: string): Promise<ProjectConfig> {
  const configPath = path.join(projectPath, '.transpec', 'config.yaml');
  const configContent = await fs.readFile(configPath, 'utf-8');
  return parseYaml(configContent) as ProjectConfig;
}
