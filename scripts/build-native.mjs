import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

if (process.platform !== 'darwin') {
  console.log('[build-native] Not macOS, skipping native Quick Look compilation.')
  process.exit(0)
}

// Find node_api.h
let includeDir = ''
const candidates = [
  '/opt/homebrew/Cellar/node@24/24.14.0/include/node',
  '/usr/local/include/node',
  '/opt/homebrew/include/node'
]
for (const c of candidates) {
  if (existsSync(join(c, 'node_api.h'))) {
    includeDir = c
    break
  }
}

if (!includeDir) {
  try {
    const found = execSync('find /opt/homebrew -name "node_api.h" 2>/dev/null | head -n 1').toString().trim()
    if (found) includeDir = dirname(found)
  } catch {}
}

if (!includeDir) {
  console.warn('[build-native] Warning: node_api.h not found, skipping native build.')
  process.exit(0)
}

const srcFile = join(rootDir, 'src/main/native/quicklook.m')
const outDir = join(rootDir, 'out/main')
const outFile = join(outDir, 'quicklook.node')

mkdirSync(outDir, { recursive: true })

const cmd = `clang -arch arm64 -arch x86_64 -dynamiclib -undefined dynamic_lookup -fobjc-arc -framework Cocoa -framework QuickLookUI -I"${includeDir}" -o "${outFile}" "${srcFile}"`
console.log('[build-native] Compiling universal native Quick Look addon...')
execSync(cmd, { stdio: 'inherit' })

// Also copy to src/main/native for dev mode
copyFileSync(outFile, join(rootDir, 'src/main/native/quicklook.node'))
console.log('[build-native] Successfully compiled quicklook.node universal binary.')
