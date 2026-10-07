# Automated Figma ↔ VS Code Merge

{
  "base": "VS Code project",
  "figma_visual_files": [
    "src/components/AIOrb.tsx",
    "src/components/FloatingAssistant.tsx",
    "src/components/GuidedTourModal.tsx",
    "src/components/Nav.tsx",
    "src/components/PageHeader.tsx",
    "src/components/SecurityPipelineVisual.tsx",
    "src/components/Shell.tsx",
    "src/pages/Analytics.tsx",
    "src/pages/Commits.tsx",
    "src/pages/Findings.tsx",
    "src/pages/PullRequests.tsx",
    "src/pages/Repositories.tsx",
    "src/pages/ReviewHistory.tsx",
    "src/pages/Settings.tsx",
    "src/pages/Tour.tsx",
    "src/pages/Welcome.tsx"
  ],
  "preserved": "src/auth, src/services, src/types, src/contexts/AppContext.tsx, src/App.tsx, configs, env",
  "assets_added": [],
  "css_strategy": "VS index.css retained; Figma CSS rules appended after imports stripped",
  "validation": {
    "typescript_stage": "passed after compatibility fix",
    "vite_build": "not completed in this environment because npm install/native dependency resolution timed out",
    "node_modules": "excluded from deliverable; install dependencies on target machine"
  }
}