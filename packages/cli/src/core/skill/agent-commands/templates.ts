export interface AgentCommandTemplateContext {
  preprocessSkillPath: string;
  postprocessSkillPath: string;
  preprocessContextPath: string;
  enhancedAnalysisPath: string;
  postprocessContextPath: string;
}

export function buildPreprocessWorkflowBody(context: AgentCommandTemplateContext): string {
  return `Run the Transpec preprocess workflow for this project.

## Goal

Prepare deterministic RAW IR, then execute the source-specific preprocess skill and write enhanced analysis back into the project runtime directory.

## Steps

1. Read \`.transpec/config.yaml\`.
2. Run:
   \`\`\`bash
   transpec preprocess
   \`\`\`
3. Read the source preprocess skill:
   \`\`\`
   ${context.preprocessSkillPath}
   \`\`\`
4. Read the generated preprocess context:
   \`\`\`
   ${context.preprocessContextPath}
   \`\`\`
5. Follow the preprocess skill and analyze the source project.
6. Write the enhanced analysis JSON to:
   \`\`\`
   ${context.enhancedAnalysisPath}
   \`\`\`

## Enhanced Analysis Output Format

\`\`\`json
{
  "version": "1.0.0",
  "generatedAt": "ISO-8601 timestamp",
  "sourceFramework": "<source framework>",
  "targetFramework": "<target framework>",
  "entities": {
    "<entity-id>": {
      "intent": "One sentence describing the goal",
      "keyPoints": ["Point 1"],
      "dependencies": ["dependency"],
      "constraints": ["constraint"],
      "requirement": ["requirement"],
      "design": ["design decision"],
      "implementNote": ["implementation note"]
    }
  }
}
\`\`\`

## Important

- Do not look for built-in skill markdown inside the installed npm package.
- Use the project-local skill markdown already generated in \`.transpec/skills/\`.
- Validate the JSON by re-reading the file after writing it.
`;
}

export function buildApplyWorkflowBody(context: AgentCommandTemplateContext): string {
  return `Run the Transpec apply workflow for this project.

## Goal

Apply deterministic transformation/emission using RAW IR plus any generated enhanced analysis, then execute the target-specific postprocess skill.

## Steps

1. Read \`.transpec/config.yaml\`.
2. Confirm the enhanced analysis file exists if this project requires semantic enrichment:
   \`\`\`
   ${context.enhancedAnalysisPath}
   \`\`\`
3. Run:
   \`\`\`bash
   transpec apply
   \`\`\`
4. Read the target postprocess skill:
   \`\`\`
   ${context.postprocessSkillPath}
   \`\`\`
5. Read the generated postprocess context:
   \`\`\`
   ${context.postprocessContextPath}
   \`\`\`
6. Follow the postprocess skill and complete any target-framework-specific postprocessing.

## Important

- The CLI handles deterministic transform/emit plumbing.
- Use the project-local skill markdown already generated in \`.transpec/skills/\`.
- Do not fetch skill markdown from the installed npm package during agent execution.
`;
}
