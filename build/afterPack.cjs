const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`\n  • Deep signing and stripping quarantine: ${appName}.app`)

  try {
    // 1. Remove any existing broken signatures and extended attributes
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })

    // 2. Apply the deep signature
    // The '--options runtime' flag is often what Apple Silicon looks for
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit',
    })

    console.log('  • Success!\n')
  } catch (error) {
    console.error('  • Signing failed:', error)
  }
}
