const fs = require('fs');
const path = require('path');

function copyDir(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'src', 'core', 'skill');
const targetRoot = path.join(projectRoot, 'dist', 'core', 'skill');
const staleLegacyRoot = path.join(projectRoot, 'dist', '.transpec');

fs.rmSync(staleLegacyRoot, { recursive: true, force: true });

for (const dirName of ['preprocess-skills', 'postprocess-skills']) {
  fs.rmSync(path.join(targetRoot, dirName), { recursive: true, force: true });
  copyDir(path.join(sourceRoot, dirName), path.join(targetRoot, dirName));
}
