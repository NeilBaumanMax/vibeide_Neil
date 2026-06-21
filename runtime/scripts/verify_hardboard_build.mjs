import { getHardboardEnvStatus, listHardboardDevices, runIdfBuild, runIdfSetTarget } from '../dist/hardboard.js';

const projectDir = new URL('../hardboard/projects/hello_world_esp32s3', import.meta.url).pathname;

const env = getHardboardEnvStatus();
console.log('hardboard env:', JSON.stringify(env, null, 2));

if (!env.idfPath || !env.idfPy) {
  throw new Error('ESP-IDF 5.4.3 not found');
}

const devices = await listHardboardDevices();
console.log('hardboard devices:', JSON.stringify(devices, null, 2));

const target = await runIdfSetTarget(projectDir, 'esp32s3');
console.log('set-target exit:', target.exitCode);
if (target.exitCode !== 0) {
  console.error(target.stderr || target.stdout);
  process.exit(target.exitCode);
}

const build = await runIdfBuild(projectDir);
console.log('build exit:', build.exitCode);
if (build.exitCode !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(build.exitCode);
}

console.log('hardboard build smoke ok');
