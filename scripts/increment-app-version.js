const fs = require('node:fs');
const path = require('node:path');

const appConfigPath = path.resolve(process.argv[2] || 'app.json');

try {
  const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
  const version = appConfig.expo && appConfig.expo.version;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version || '');

  if (!match) {
    throw new Error(`Versão inválida em ${appConfigPath}: esperado o formato MAJOR.MINOR.PATCH.`);
  }

  const nextVersion = `${match[1]}.${match[2]}.${BigInt(match[3]) + 1n}`;
  appConfig.expo.version = nextVersion;
  fs.writeFileSync(appConfigPath, `${JSON.stringify(appConfig, null, 2)}\n`);
  console.log(`Versão do aplicativo atualizada: ${version} -> ${nextVersion}`);
} catch (error) {
  console.error(`Não foi possível atualizar a versão do aplicativo: ${error.message}`);
  process.exitCode = 1;
}
